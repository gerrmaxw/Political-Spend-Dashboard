from __future__ import annotations

import csv
import hashlib
import math
import re
import shutil
from collections import defaultdict
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable

import pandas as pd
from pyxlsb import open_workbook


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "powerbi_implementation"
DATA = OUT / "data"
CURATED = DATA / "curated"
SNAPSHOT_DIR = DATA / "Spend Snapshots"
SCRIPTS = OUT / "powerquery"
DAX_DIR = OUT / "dax"
DOCS = OUT / "docs"

DOWNLOADS = Path("/Users/gerritmaxwell/Downloads")
POLITICAL = DOWNLOADS / "Political Spend"

SPEND_XLSB = DOWNLOADS / "Election Spend 5.11.xlsb"
PBIX = DOWNLOADS / "Political Spend Dashboard-1.pbix"
SNAPSHOT_DATE = date(2026, 5, 11)
CYCLE = 2026
TODAY = date(2026, 5, 13)


def mkdirs() -> None:
    for path in [OUT, DATA, CURATED, SNAPSHOT_DIR, SCRIPTS, DAX_DIR, DOCS]:
        path.mkdir(parents=True, exist_ok=True)


def norm_blank(value, default: str = "Unknown") -> str:
    if value is None:
        return default
    if isinstance(value, float) and math.isnan(value):
        return default
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "n/a", "na"}:
        return default
    return re.sub(r"\s+", " ", text)


def norm_key(value) -> str:
    text = norm_blank(value, "")
    text = text.lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def stable_key(prefix: str, *parts) -> str:
    base = "|".join(norm_key(part) for part in parts)
    if not base.strip("|"):
        base = "unknown"
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}_{digest}"


def to_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    text = str(value).strip().replace("$", "").replace(",", "")
    if text in {"", "-", "n/a", "N/A"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_date(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def load_xlsb(path: Path) -> pd.DataFrame:
    with open_workbook(path) as workbook:
        sheet_name = workbook.sheets[0]
        with workbook.get_sheet(sheet_name) as sheet:
            rows = sheet.rows()
            headers = [cell.v for cell in next(rows)]
            records = []
            for row in rows:
                values = [cell.v for cell in row]
                if len(values) < len(headers):
                    values += [None] * (len(headers) - len(values))
                records.append(values[: len(headers)])
    return pd.DataFrame(records, columns=headers)


def read_excel(path: Path, **kwargs) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_excel(path, **kwargs)


def clean_spend(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    field_map = {
        "Election State": "State",
        "DMA": "DMA",
        "Office Type": "Race Level",
        "Office": "Office",
        "Team Party": "Party",
        "Advertiser": "Advertiser",
        "Agencies": "Agency",
        "Networks": "Network",
        "Station": "Station",
        "ATV_MEDIA_TYPE (copy 2)": "Media Type",
    }
    clean = pd.DataFrame()
    for source, target in field_map.items():
        clean[target] = raw[source].map(norm_blank)

    amount = raw.get("Amount", pd.Series([None] * len(raw))).map(to_number)
    amount = amount.fillna(raw.get("Gross Spending", pd.Series([None] * len(raw))).map(to_number))
    amount = amount.fillna(raw.get("Gross Spending/Share", pd.Series([None] * len(raw))).map(to_number))
    clean["Amount"] = amount
    before_rows = len(clean)
    clean = clean[clean["Amount"].notna() & (clean["Amount"] != 0)].copy()

    media_map = {
        "broadcast": "Broadcast",
        "cable": "Cable",
        "ctv": "CTV",
        "digital": "Digital",
        "radio": "Radio",
    }
    party_map = {
        "democratic": "Democratic",
        "democrat": "Democratic",
        "dem": "Democratic",
        "republican": "Republican",
        "gop": "Republican",
        "rep": "Republican",
        "independent": "Independent",
        "ind": "Independent",
    }
    clean["Media Type"] = clean["Media Type"].map(lambda x: media_map.get(norm_key(x), norm_blank(x)))
    clean["Party"] = clean["Party"].map(lambda x: party_map.get(norm_key(x), norm_blank(x)))
    for col in ["State", "DMA", "Race Level", "Office", "Advertiser", "Agency", "Network", "Station"]:
        clean[col] = clean[col].map(norm_blank)

    clean["SnapshotDate"] = SNAPSHOT_DATE.isoformat()
    clean["Cycle"] = CYCLE
    clean["SourceFile"] = SPEND_XLSB.name

    business_cols = [
        "Advertiser",
        "State",
        "DMA",
        "Office",
        "Race Level",
        "Party",
        "Media Type",
        "Station",
        "Network",
    ]
    clean["RowBusinessKey"] = clean[business_cols].apply(
        lambda row: "|".join(norm_key(row[col]) for col in business_cols),
        axis=1,
    )
    clean["RowBusinessKeyHash"] = clean["RowBusinessKey"].map(
        lambda value: hashlib.sha1(value.encode("utf-8")).hexdigest()[:16].upper()
    )

    for col, prefix in [
        ("Advertiser", "ADV"),
        ("Agency", "AGY"),
        ("Media Type", "MED"),
        ("State", "STA"),
        ("DMA", "DMA"),
        ("Office", "OFF"),
        ("Race Level", "RLV"),
        ("Party", "PTY"),
        ("Station", "STN"),
        ("Network", "NET"),
    ]:
        clean[f"{col.replace(' ', '')}Key"] = clean[col].map(lambda value: stable_key(prefix, value))

    stats = {
        "RawRows": before_rows,
        "SpendRows": len(clean),
        "SkippedBlankAmountRows": before_rows - len(clean),
        "TotalSpend": round(float(clean["Amount"].sum()), 2),
    }
    return clean, stats


def race_key(state, office, district=None, race_name=None) -> str:
    return stable_key("RACE", state, office, district or "", race_name or "")


def candidate_key(name, state, office="", district="") -> str:
    return stable_key("CAND", name, state, office, district)


def party_short(value) -> str:
    key = norm_key(value)
    if key.startswith("dem"):
        return "D"
    if key.startswith("rep") or key == "gop":
        return "R"
    if key.startswith("ind"):
        return "I"
    return ""


def load_candidate_sources() -> tuple[pd.DataFrame, pd.DataFrame]:
    candidates = []
    results_rows = []

    house_path = POLITICAL / "House_2026_Party_District_Lookup.xlsx"
    for sheet in ["Candidates", "Incumbents"]:
        df = read_excel(house_path, sheet_name=sheet, dtype=str)
        if df.empty:
            continue
        for _, row in df.iterrows():
            state = norm_blank(row.get("state"), "")
            district = norm_blank(row.get("district"), "")
            name = norm_blank(row.get("candidate_name"), "")
            if not state or not name:
                continue
            rk = race_key(state, "House", district)
            candidates.append(
                {
                    "CandidateName": name.title(),
                    "CandidateParty": norm_blank(row.get("party"), ""),
                    "PartyShort": norm_blank(row.get("party_short"), ""),
                    "State": state,
                    "Office": "House",
                    "District": district,
                    "RaceKey": rk,
                    "RaceName": f"{state}-{district} U.S. House",
                    "Status": norm_blank(row.get("status"), ""),
                    "FEC_ID": norm_blank(row.get("fec_id"), ""),
                    "Source": f"House lookup {sheet}",
                }
            )

    ca_races = read_excel(POLITICAL / "CA House Races.xlsx", sheet_name=0, dtype=str)
    if not ca_races.empty:
        for _, row in ca_races.iterrows():
            state = norm_blank(row.get("STATE_ABBR"), "")
            district = norm_blank(row.get("CDFIPS"), "")
            name = norm_blank(row.get("NAME"), "")
            if not state or not name:
                continue
            rk = race_key(state, "House", district)
            candidates.append(
                {
                    "CandidateName": name,
                    "CandidateParty": norm_blank(row.get("PARTY"), ""),
                    "PartyShort": party_short(row.get("PARTY")),
                    "State": state,
                    "Office": "House",
                    "District": district,
                    "RaceKey": rk,
                    "RaceName": f"{state}-{district} U.S. House",
                    "Status": "Incumbent/known race",
                    "FEC_ID": "",
                    "Source": "CA House Races",
                }
            )

    polls = read_excel(POLITICAL / "RealClearPolling Data - April 2026.xlsx", sheet_name=0)
    if not polls.empty:
        for _, row in polls.iterrows():
            state = norm_blank(row.get("State"), "")
            race_name = norm_blank(row.get("Race"), "")
            race_type = norm_blank(row.get("Race Type"), "")
            office = race_type.split(" - ")[0] if race_type else "Unknown"
            rk = race_key(state, office, race_name=race_name)
            for idx in range(1, 8):
                cand_col = f"Candidate/Option {idx}"
                if cand_col not in polls.columns:
                    continue
                name = norm_blank(row.get(cand_col), "")
                if not name or name.lower() in {"approve", "disapprove", "yes", "no"}:
                    continue
                candidates.append(
                    {
                        "CandidateName": name,
                        "CandidateParty": "",
                        "PartyShort": "",
                        "State": state,
                        "Office": office,
                        "District": "",
                        "RaceKey": rk,
                        "RaceName": race_name,
                        "Status": "Polled",
                        "FEC_ID": "",
                        "Source": "RealClearPolling",
                    }
                )

    results_path = DOWNLOADS / "files" / "Political_Spend_vs_Results_2026.xlsx"
    if results_path.exists():
        results = read_excel(results_path, sheet_name="1a. Primaries (Per Candidate)", header=3)
        if not results.empty:
            candidate_col = results.get("Candidate")
            if candidate_col is None:
                results = pd.DataFrame()
            else:
                results = results[candidate_col.notna()].copy()
        if not results.empty:
            for _, row in results.iterrows():
                name = norm_blank(row.get("Candidate"), "")
                state = norm_blank(row.get("State"), "")
                office = norm_blank(row.get("Office"), "")
                district = norm_blank(row.get("District"), "")
                if not name or not state:
                    continue
                rk = race_key(state, office, district)
                ck = candidate_key(name, state, office, district)
                candidates.append(
                    {
                        "CandidateName": name,
                        "CandidateParty": norm_blank(row.get("Party"), ""),
                        "PartyShort": party_short(row.get("Party")),
                        "State": state,
                        "Office": office,
                        "District": district,
                        "RaceKey": rk,
                        "RaceName": f"{state} {office} {district}".strip(),
                        "Status": norm_blank(row.get("Result"), ""),
                        "FEC_ID": "",
                        "Source": "Political_Spend_vs_Results_2026",
                    }
                )
                results_rows.append(
                    {
                        "CandidateKey": ck,
                        "RaceKey": rk,
                        "CandidateName": name,
                        "State": state,
                        "Office": office,
                        "District": district,
                        "ElectionDate": to_date(row.get("Primary Date")),
                        "Result": norm_blank(row.get("Result"), ""),
                        "Votes": to_number(row.get("Votes")),
                        "VoteShare": to_number(row.get("Vote Share")),
                        "Margin": to_number(row.get("Margin")),
                        "Source": results_path.name,
                    }
                )

    cand_df = pd.DataFrame(candidates)
    if cand_df.empty:
        cand_df = pd.DataFrame(
            columns=[
                "CandidateName",
                "CandidateParty",
                "PartyShort",
                "State",
                "Office",
                "District",
                "RaceKey",
                "RaceName",
                "Status",
                "FEC_ID",
                "Source",
            ]
        )
    cand_df["CandidateKey"] = cand_df.apply(
        lambda r: candidate_key(r["CandidateName"], r["State"], r["Office"], r["District"]),
        axis=1,
    )
    cand_df = cand_df.drop_duplicates(subset=["CandidateKey"]).copy()
    unmatched = {
        "CandidateKey": "UNMATCHED",
        "CandidateName": "UNMATCHED",
        "CandidateParty": "",
        "PartyShort": "",
        "State": "",
        "Office": "",
        "District": "",
        "RaceKey": "RACE_UNMATCHED",
        "RaceName": "UNMATCHED",
        "Status": "Unmatched",
        "FEC_ID": "",
        "Source": "System placeholder",
    }
    cand_df = pd.concat([pd.DataFrame([unmatched]), cand_df], ignore_index=True)

    results_df = pd.DataFrame(results_rows)
    return cand_df, results_df


STOPWORDS = {
    "for",
    "committee",
    "campaign",
    "friends",
    "friend",
    "citizens",
    "people",
    "vote",
    "elect",
    "reelect",
    "re",
    "election",
    "victory",
    "pac",
    "super",
    "inc",
    "llc",
    "ltd",
    "congress",
    "senate",
    "governor",
    "mayor",
    "assembly",
    "district",
    "house",
    "america",
    "american",
    "americans",
    "action",
    "fund",
}


def advertiser_match_text(text: str) -> str:
    words = [w for w in norm_key(text).split() if w not in STOPWORDS]
    return " ".join(words)


def office_compatible(spend_office: str, spend_level: str, cand_office: str) -> bool:
    spend = f"{spend_office} {spend_level}".lower()
    cand = norm_key(cand_office)
    if not cand:
        return True
    aliases = {
        "house": ["house", "congress", "representative"],
        "senate": ["senate", "us senate"],
        "governor": ["governor", "gubernatorial"],
    }
    for key, values in aliases.items():
        if cand == key or key in cand:
            return any(value in spend for value in values)
    return cand in norm_key(spend)


def build_crosswalk(spend: pd.DataFrame, candidates: pd.DataFrame) -> pd.DataFrame:
    usable_candidates = candidates[candidates["CandidateKey"] != "UNMATCHED"].copy()
    usable_candidates["CandidateNorm"] = usable_candidates["CandidateName"].map(norm_key)
    usable_candidates["CandidateMatchText"] = usable_candidates["CandidateName"].map(advertiser_match_text)
    usable_candidates["LastName"] = usable_candidates["CandidateNorm"].map(
        lambda text: text.split()[-1] if text.split() else ""
    )
    usable_candidates["TokenSet"] = usable_candidates["CandidateMatchText"].map(
        lambda text: {token for token in text.split() if len(token) >= 3}
    )
    by_state: dict[str, list[dict]] = defaultdict(list)
    all_candidates = usable_candidates.to_dict("records")
    for record in all_candidates:
        by_state[norm_blank(record.get("State"), "").upper()].append(record)

    combos = spend[["Advertiser", "State", "Office", "Race Level", "Party"]].drop_duplicates()
    rows = []
    for _, row in combos.iterrows():
        advertiser = norm_blank(row["Advertiser"], "")
        adv_norm = norm_key(advertiser)
        adv_match = advertiser_match_text(advertiser)
        adv_tokens = {token for token in adv_match.split() if len(token) >= 3}
        state = norm_blank(row["State"], "").upper()
        pool = by_state.get(state, all_candidates) if state and state != "US" else all_candidates
        pool = [
            cand
            for cand in pool
            if adv_tokens
            and (
                cand["TokenSet"] & adv_tokens
                or (len(cand["LastName"]) >= 4 and cand["LastName"] in adv_tokens)
            )
        ]
        best = None
        best_score = 0.0
        best_method = "unmatched"
        for cand in pool:
            cand_match = cand["CandidateMatchText"]
            if not cand_match:
                continue
            score = max(
                SequenceMatcher(None, adv_match, cand_match).ratio(),
                SequenceMatcher(None, adv_norm, cand["CandidateNorm"]).ratio() * 0.9,
            )
            method = "fuzzy"
            last = cand["LastName"]
            if len(last) >= 4 and re.search(rf"\b{re.escape(last)}\b", adv_norm):
                score = max(score, 0.82)
                method = "last-name"
            first = cand["CandidateNorm"].split()[0] if cand["CandidateNorm"].split() else ""
            if len(first) >= 4 and first in adv_norm and len(last) >= 4 and last in adv_norm:
                score = max(score, 0.96)
                method = "first-last"
            if state and state == norm_blank(cand.get("State"), "").upper():
                score += 0.04
            if office_compatible(row["Office"], row["Race Level"], cand.get("Office", "")):
                score += 0.04
            if party_short(row["Party"]) and party_short(row["Party"]) == party_short(cand.get("CandidateParty", "")):
                score += 0.015
            score = min(score, 0.99)
            if score > best_score:
                best = cand
                best_score = score
                best_method = method

        if best is None or best_score < 0.68:
            rows.append(
                {
                    "Advertiser": row["Advertiser"],
                    "State": row["State"],
                    "Office": row["Office"],
                    "Race Level": row["Race Level"],
                    "Party": row["Party"],
                    "CandidateKey": "UNMATCHED",
                    "RaceKey": "RACE_UNMATCHED",
                    "MatchedCandidate": "UNMATCHED",
                    "CandidateMatchScore": 0.0,
                    "CandidateMatchMethod": "unmatched",
                }
            )
        else:
            rows.append(
                {
                    "Advertiser": row["Advertiser"],
                    "State": row["State"],
                    "Office": row["Office"],
                    "Race Level": row["Race Level"],
                    "Party": row["Party"],
                    "CandidateKey": best["CandidateKey"],
                    "RaceKey": best["RaceKey"],
                    "MatchedCandidate": best["CandidateName"],
                    "CandidateMatchScore": round(best_score, 3),
                    "CandidateMatchMethod": best_method,
                }
            )
    return pd.DataFrame(rows)


def dim_from_fact(fact: pd.DataFrame, key_col: str, text_col: str, out_cols: list[str] | None = None) -> pd.DataFrame:
    cols = [key_col, text_col] + (out_cols or [])
    return fact[cols].drop_duplicates().sort_values(text_col).reset_index(drop=True)


def build_media_dim(fact: pd.DataFrame) -> pd.DataFrame:
    base = dim_from_fact(fact, "MediaTypeKey", "Media Type")
    def group(media):
        key = norm_key(media)
        if key in {"broadcast", "cable", "ctv"}:
            return "TV"
        if key == "digital":
            return "Digital"
        if key == "radio":
            return "Radio"
        return "Other"
    base["MediaGroup"] = base["Media Type"].map(group)
    base["IsCable"] = base["Media Type"].eq("Cable")
    base["IsBroadcast"] = base["Media Type"].eq("Broadcast")
    base["IsCTV"] = base["Media Type"].eq("CTV")
    base["IsDigital"] = base["Media Type"].eq("Digital")
    base["IsRadio"] = base["Media Type"].eq("Radio")
    base["IsGeoTargetable"] = base["Media Type"].isin(["Cable", "CTV", "Digital"])
    return base


def build_windows() -> pd.DataFrame:
    path = POLITICAL / "Political Windows by Market.xlsx"
    df = read_excel(path, sheet_name=0)
    if df.empty:
        return pd.DataFrame()
    df = df.rename(columns={"Market": "DMA", "Market/DMA": "DMA", "WINDOW TYPE": "WindowType"})
    df["WindowOpenDate"] = df["WINDOW OPEN DATE"].map(to_date)
    df["ElectionDate"] = df["ELECTION DATE"].map(to_date)
    out = df[["State", "Region", "DMA", "WindowType", "WindowOpenDate", "ElectionDate"]].copy()
    def status(row):
        open_dt = pd.to_datetime(row["WindowOpenDate"], errors="coerce")
        election_dt = pd.to_datetime(row["ElectionDate"], errors="coerce")
        if pd.isna(open_dt) or pd.isna(election_dt):
            return "Unknown"
        open_d = open_dt.date()
        election_d = election_dt.date()
        if election_d < TODAY:
            return "Past"
        if open_d <= TODAY <= election_d:
            return "In Window"
        if 0 <= (open_d - TODAY).days <= 30:
            return "Opening Soon"
        return "Future"
    out["DaysToElection"] = out["ElectionDate"].map(
        lambda value: (pd.to_datetime(value).date() - TODAY).days if value else None
    )
    out["WindowStatus"] = out.apply(status, axis=1)
    out["WindowKey"] = out.apply(
        lambda r: stable_key("WIN", r["State"], r["DMA"], r["WindowType"], r["ElectionDate"]),
        axis=1,
    )
    return out


def build_bridge_race_dma() -> pd.DataFrame:
    df = read_excel(POLITICAL / "CA House Districts.xlsx", sheet_name=0, dtype=str)
    if df.empty:
        return pd.DataFrame()
    out = pd.DataFrame()
    out["State"] = df["STATE_ABBR"].map(norm_blank)
    out["District"] = df["CDFIPS"].map(norm_blank)
    out["RaceKey"] = out.apply(lambda r: race_key(r["State"], "House", r["District"]), axis=1)
    out["RepresentativeName"] = df["NAME"].map(norm_blank)
    out["RepresentativeParty"] = df["PARTY"].map(norm_blank)
    out["DMA"] = df["DMA"].map(norm_blank)
    out["Market"] = df["MARKET"].map(norm_blank)
    out = out.drop_duplicates(subset=["RaceKey", "DMA", "Market"]).copy()
    counts = out.groupby("RaceKey")["DMA"].transform("count")
    out["DistrictDMAWeight"] = 1 / counts
    out["DistrictHouseholdsInDMA"] = pd.NA
    out["DMAHouseholds"] = pd.NA
    out["IsHouseholdShareEstimated"] = True
    out["BridgeKey"] = out.apply(lambda r: stable_key("BRDMA", r["RaceKey"], r["DMA"], r["Market"]), axis=1)
    return out


def build_pac_fact(candidates: pd.DataFrame, crosswalk: pd.DataFrame) -> pd.DataFrame:
    path = POLITICAL / "PAC_to_Candidates_2026_from_5.1_v2 (2).csv"
    if not path.exists():
        return pd.DataFrame()
    df = pd.read_csv(path)
    if df.empty:
        return pd.DataFrame()
    df["Amount"] = df["Grand Total"].map(to_number)
    df["CommitteeName"] = df["Advertiser"].map(norm_blank)
    df["CommitteeID"] = df["Committee ID"].map(lambda x: norm_blank(x, ""))
    df["SupportMethod"] = df["Support Method"].map(lambda x: norm_blank(x, "Unspecified"))
    df["SupportedCandidates"] = df["Supported Candidates"].map(lambda x: norm_blank(x, ""))
    df["RaceType"] = df["Race Type"].map(norm_blank)
    xwalk_by_adv = (
        crosswalk.sort_values("CandidateMatchScore", ascending=False)
        .drop_duplicates(subset=["Advertiser"])
        .set_index("Advertiser")
    )
    rows = []
    for _, row in df.iterrows():
        candidate_key_value = "UNMATCHED"
        race_key_value = "RACE_UNMATCHED"
        matched = "UNMATCHED"
        if row["CommitteeName"] in xwalk_by_adv.index:
            hit = xwalk_by_adv.loc[row["CommitteeName"]]
            candidate_key_value = hit["CandidateKey"]
            race_key_value = hit["RaceKey"]
            matched = hit["MatchedCandidate"]
        method_key = norm_key(row["SupportMethod"])
        if "oppose" in method_key or "against" in method_key:
            support_oppose = "Oppose"
        elif "support" in method_key or method_key != "unspecified":
            support_oppose = "Support"
        else:
            support_oppose = "Unspecified"
        rows.append(
            {
                "IEKey": stable_key("IE", row["CommitteeName"], row["CommitteeID"], row["RaceType"]),
                "CommitteeName": row["CommitteeName"],
                "CommitteeID": row["CommitteeID"],
                "CandidateKey": candidate_key_value,
                "RaceKey": race_key_value,
                "MatchedCandidate": matched,
                "SupportedCandidatesRaw": row["SupportedCandidates"],
                "SupportOppose": support_oppose,
                "SupportMethod": row["SupportMethod"],
                "Amount": row["Amount"],
                "Date": "",
                "RaceType": row["RaceType"],
                "Source": path.name,
            }
        )
    return pd.DataFrame(rows)


def build_race_dim(candidates: pd.DataFrame, results: pd.DataFrame) -> pd.DataFrame:
    races = candidates[["RaceKey", "RaceName", "State", "Office", "District"]].drop_duplicates().copy()
    races = races[races["RaceKey"].notna()]
    races["RaceLevel"] = races["Office"].map(lambda x: norm_blank(x, "Unknown"))
    races["CompletedFlag"] = False
    races["ElectionDate"] = ""
    if not results.empty:
        res = results[["RaceKey", "ElectionDate", "Result"]].dropna(subset=["RaceKey"]).copy()
        completed = res.groupby("RaceKey", as_index=False).agg({"ElectionDate": "first", "Result": "count"})
        completed["CompletedFlag"] = completed["Result"] > 0
        races = races.merge(completed[["RaceKey", "ElectionDate", "CompletedFlag"]], on="RaceKey", how="left", suffixes=("", "_Result"))
        races["ElectionDate"] = races["ElectionDate_Result"].fillna(races["ElectionDate"])
        races["CompletedFlag"] = races["CompletedFlag_Result"].where(
            races["CompletedFlag_Result"].notna(),
            races["CompletedFlag"],
        ).astype(bool)
        races = races.drop(columns=[c for c in ["ElectionDate_Result", "CompletedFlag_Result"] if c in races.columns])
    if "RACE_UNMATCHED" not in set(races["RaceKey"]):
        races = pd.concat(
            [
                pd.DataFrame(
                    [
                        {
                            "RaceKey": "RACE_UNMATCHED",
                            "RaceName": "UNMATCHED",
                            "State": "",
                            "Office": "",
                            "District": "",
                            "RaceLevel": "",
                            "CompletedFlag": False,
                            "ElectionDate": "",
                        }
                    ]
                ),
                races,
            ],
            ignore_index=True,
        )
    return races.drop_duplicates(subset=["RaceKey"]).copy()


def write_csv(df: pd.DataFrame, name: str) -> Path:
    path = CURATED / name
    df.to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)
    return path


def write_manifest() -> None:
    shutil.copy2(SPEND_XLSB, SNAPSHOT_DIR / SPEND_XLSB.name)
    manifest = pd.DataFrame(
        [
            {
                "Name": SPEND_XLSB.name,
                "SnapshotDate": SNAPSHOT_DATE.isoformat(),
                "Cycle": CYCLE,
                "IncludeFlag": True,
                "SourcePath": str(SPEND_XLSB),
                "Notes": "Seed snapshot copied into Spend Snapshots folder.",
            }
        ]
    )
    manifest.to_csv(DATA / "SnapshotManifest.csv", index=False)


def create_fact_tables(spend: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    fact_cols = [
        "SnapshotDate",
        "Cycle",
        "SourceFile",
        "RowBusinessKey",
        "RowBusinessKeyHash",
        "AdvertiserKey",
        "AgencyKey",
        "MediaTypeKey",
        "StateKey",
        "DMAKey",
        "OfficeKey",
        "RaceLevelKey",
        "PartyKey",
        "StationKey",
        "NetworkKey",
        "CandidateKey",
        "RaceKey",
        "Advertiser",
        "Agency",
        "Media Type",
        "State",
        "DMA",
        "Office",
        "Race Level",
        "Party",
        "Station",
        "Network",
        "MatchedCandidate",
        "CandidateMatchScore",
        "CandidateMatchMethod",
    ]
    grouped = spend.groupby(fact_cols, dropna=False, as_index=False)["Amount"].sum()
    latest = grouped["SnapshotDate"].max()
    current = grouped[grouped["SnapshotDate"] == latest].copy()
    snapshot_dim = pd.DataFrame(
        [
            {
                "SnapshotDate": latest,
                "Cycle": CYCLE,
                "SnapshotLabel": f"{latest} Snapshot",
                "IsLatestSnapshot": True,
                "SourceFile": SPEND_XLSB.name,
            }
        ]
    )
    return grouped, current, snapshot_dim


def write_powerquery_loaders(table_names: list[str]) -> None:
    project_folder_unc = r"\\Mac\Home\Documents\Codex\2026-05-13\files-mentioned-by-the-user-election\powerbi_implementation"
    type_maps = {
        "FactSpendSnapshot": {
            "SnapshotDate": "type date",
            "Cycle": "Int64.Type",
            "Amount": "Currency.Type",
            "CandidateMatchScore": "type number",
        },
        "stg_SpendClean": {
            "SnapshotDate": "type date",
            "Cycle": "Int64.Type",
            "Amount": "Currency.Type",
            "CandidateMatchScore": "type number",
        },
        "FactSpendCurrent": {
            "SnapshotDate": "type date",
            "Cycle": "Int64.Type",
            "Amount": "Currency.Type",
            "CandidateMatchScore": "type number",
        },
        "DimSnapshot": {"SnapshotDate": "type date", "Cycle": "Int64.Type", "IsLatestSnapshot": "type logical"},
        "DimMediaType": {
            "IsCable": "type logical",
            "IsBroadcast": "type logical",
            "IsCTV": "type logical",
            "IsDigital": "type logical",
            "IsRadio": "type logical",
            "IsGeoTargetable": "type logical",
        },
        "FactPoliticalWindows": {
            "WindowOpenDate": "type date",
            "ElectionDate": "type date",
            "DaysToElection": "Int64.Type",
        },
        "FactFECIndependentExpenditures": {"Amount": "Currency.Type", "Date": "type date"},
        "FactElectionResults": {"ElectionDate": "type date", "Votes": "Int64.Type", "VoteShare": "type number", "Margin": "type number"},
        "DimRace": {"ElectionDate": "type date", "CompletedFlag": "type logical"},
        "BridgeRaceDMA": {
            "DistrictDMAWeight": "type number",
            "DistrictHouseholdsInDMA": "type number",
            "DMAHouseholds": "type number",
            "IsHouseholdShareEstimated": "type logical",
        },
        "DataHealthSummary": {"ValueNumber": "type number"},
        "DuplicateBusinessKeys": {"DuplicateRows": "Int64.Type", "Amount": "Currency.Type"},
        "UnmatchedAdvertisers": {"Amount": "Currency.Type", "Rows": "Int64.Type"},
        "SnapshotFileLoad": {
            "SnapshotDate": "type date",
            "Cycle": "Int64.Type",
            "IncludeFlag": "type logical",
            "RawRows": "Int64.Type",
            "SpendRows": "Int64.Type",
            "TotalSpend": "Currency.Type",
        },
        "CandidateCrosswalk": {"CandidateMatchScore": "type number"},
    }
    header = f"""// Paste each query below into Power Query Advanced Editor.
// The pProjectFolder value is set for Parallels' default Mac shared-folder path.
// If your Windows VM maps Mac files differently, update pProjectFolder only.

// Query: pProjectFolder
let
    Source = "{project_folder_unc}"
in
    Source

"""
    blocks = [header]
    for table in table_names:
        types = type_maps.get(table, {})
        type_expr = "{}"
        if types:
            type_expr = "{" + ", ".join(f'{{"{col}", {typ}}}' for col, typ in types.items()) + "}"
        block = f"""// Query: {table}
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\\data\\curated\\{table}.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {type_expr}, "en-US")
in
    Typed

"""
        blocks.append(block)
    (SCRIPTS / "PowerQuery_CuratedCsvLoaders.pq").write_text("".join(blocks), encoding="utf-8")


def write_direct_folder_pipeline() -> None:
    text = """// Direct folder-based pipeline for the weekly .xlsb spend snapshots.
// Create these as separate Power Query queries in the order shown.

// Query: pSpendSnapshotsFolder
let
    Source = "\\\\Mac\\Home\\Documents\\Codex\\2026-05-13\\files-mentioned-by-the-user-election\\powerbi_implementation\\data\\Spend Snapshots"
in
    Source

// Query: SnapshotManifest
let
    Source = Csv.Document(File.Contents("\\\\Mac\\Home\\Documents\\Codex\\2026-05-13\\files-mentioned-by-the-user-election\\powerbi_implementation\\data\\SnapshotManifest.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"IncludeFlag", type logical}}, "en-US")
in
    Typed

// Query: stg_SpendFiles
let
    Source = Folder.Files(pSpendSnapshotsFolder),
    KeepXlsb = Table.SelectRows(Source, each Text.Lower([Extension]) = ".xlsb" and not Text.StartsWith([Name], "~$")),
    MergeManifest = Table.NestedJoin(KeepXlsb, {"Name"}, SnapshotManifest, {"Name"}, "Manifest", JoinKind.Inner),
    ExpandManifest = Table.ExpandTableColumn(MergeManifest, "Manifest", {"SnapshotDate", "Cycle", "IncludeFlag"}, {"SnapshotDate", "Cycle", "IncludeFlag"}),
    Included = Table.SelectRows(ExpandManifest, each [IncludeFlag] = true),
    KeepColumns = Table.SelectColumns(Included, {"Content", "Name", "SnapshotDate", "Cycle"})
in
    KeepColumns

// Query: stg_SpendClean
let
    Source = stg_SpendFiles,
    AddWorkbook = Table.AddColumn(Source, "Workbook", each Excel.Workbook([Content], true), type table),
    ExpandWorkbook = Table.ExpandTableColumn(AddWorkbook, "Workbook", {"Name", "Data", "Item", "Kind", "Hidden"}, {"SheetName", "Data", "Item", "Kind", "Hidden"}),
    KeepSheet = Table.SelectRows(ExpandWorkbook, each [Kind] = "Sheet" and [Item] = "Home_Advertiser_data (3)"),
    ExpandData = Table.ExpandTableColumn(
        KeepSheet,
        "Data",
        {"Election State", "DMA", "Office Type", "Office", "Team Party", "Advertiser", "Agencies", "Networks", "Station", "ATV_MEDIA_TYPE (copy 2)", "Amount", "Gross Spending", "Gross Spending/Share"},
        {"State", "DMA", "Race Level", "Office", "Party", "Advertiser", "Agency", "Network", "Station", "Media Type", "AmountRaw", "GrossSpendingRaw", "GrossSpendingShareRaw"}
    ),
    CleanText = Table.TransformColumns(ExpandData, {
        {"State", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"DMA", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Race Level", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Office", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Party", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Advertiser", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Agency", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Network", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Station", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Media Type", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text}
    }),
    AddAmount = Table.AddColumn(CleanText, "Amount", each try Number.From([AmountRaw]) otherwise try Number.From([GrossSpendingRaw]) otherwise try Number.From([GrossSpendingShareRaw]) otherwise null, Currency.Type),
    KeepSpend = Table.SelectRows(AddAmount, each [Amount] <> null and [Amount] <> 0),
    AddRowBusinessKey = Table.AddColumn(
        KeepSpend,
        "RowBusinessKey",
        each Text.Lower(Text.Combine({[Advertiser], [State], [DMA], [Office], [Race Level], [Party], [Media Type], [Station], [Network]}, "|")),
        type text
    ),
    AddTypes = Table.TransformColumnTypes(AddRowBusinessKey, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}}),
    RenameSnapshot = Table.RenameColumns(AddTypes, {{"Name", "SourceFile"}}),
    KeepColumns = Table.SelectColumns(RenameSnapshot, {"SnapshotDate", "Cycle", "SourceFile", "RowBusinessKey", "Advertiser", "Agency", "State", "DMA", "Office", "Race Level", "Party", "Media Type", "Station", "Network", "Amount"})
in
    KeepColumns

// Query: FactSpendSnapshot
let
    Source = stg_SpendClean
in
    Source

// Query: FactSpendCurrent
let
    LatestSnapshot = List.Max(FactSpendSnapshot[SnapshotDate]),
    Source = Table.SelectRows(FactSpendSnapshot, each [SnapshotDate] = LatestSnapshot)
in
    Source
"""
    (SCRIPTS / "PowerQuery_DirectFolderPipeline.pq").write_text(text, encoding="utf-8")


def write_dax() -> None:
    measures = """-- Create these measures on the _Measures table.

Cumulative Spend as of Snapshot =
SUM ( FactSpendSnapshot[Amount] )

Prior Snapshot Spend =
VAR CurrentSnapshot = MAX ( DimSnapshot[SnapshotDate] )
VAR PreviousSnapshot =
    CALCULATE (
        MAX ( DimSnapshot[SnapshotDate] ),
        FILTER ( ALL ( DimSnapshot ), DimSnapshot[SnapshotDate] < CurrentSnapshot )
    )
RETURN
    CALCULATE (
        [Cumulative Spend as of Snapshot],
        REMOVEFILTERS ( DimSnapshot ),
        DimSnapshot[SnapshotDate] = PreviousSnapshot
    )

Weekly Added Spend =
[Cumulative Spend as of Snapshot] - COALESCE ( [Prior Snapshot Spend], 0 )

Total Spend =
SUM ( FactSpendCurrent[Amount] )

Broadcast Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[Media Type] = "Broadcast" ) )

Cable Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[Media Type] = "Cable" ) )

CTV Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[Media Type] = "CTV" ) )

Digital Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[Media Type] = "Digital" ) )

Radio Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[Media Type] = "Radio" ) )

Broadcast + CTV Spend =
[Broadcast Spend] + [CTV Spend]

Digital + Radio Spend =
[Digital Spend] + [Radio Spend]

TV Spend =
[Broadcast Spend] + [Cable Spend] + [CTV Spend]

Cable Share % =
DIVIDE ( [Cable Spend], [TV Spend] )

Selected TV Spend Floor =
SELECTEDVALUE ( 'TV Spend Floor Slider'[Value], 11000 )

Selected Cable Share Target =
SELECTEDVALUE ( 'Cable Share Target Slider'[Value], 0.15 )

Target Cable Spend =
[TV Spend] * [Selected Cable Share Target]

Cable Opportunity $ =
MAX ( 0, [Target Cable Spend] - [Cable Spend] )

Cable Prospect Flag =
IF (
    [Broadcast + CTV Spend] >= [Selected TV Spend Floor]
        && COALESCE ( [Cable Share %], 0 ) <= [Selected Cable Share Target],
    1,
    0
)

Cable Prospect Label =
SWITCH (
    TRUE (),
    [TV Spend] = 0, "No TV",
    [Cable Spend] = 0 && [Broadcast + CTV Spend] >= [Selected TV Spend Floor], "Zero Cable",
    [Cable Prospect Flag] = 1, "Low Cable",
    [Cable Spend] > 0, "Cable In Mix",
    "Below Floor"
)

Zero Cable Count =
COUNTROWS (
    FILTER (
        VALUES ( DimAdvertiser[AdvertiserKey] ),
        [Cable Prospect Label] = "Zero Cable"
    )
)

District Share of DMA =
VAR HouseholdShare =
    DIVIDE (
        SUM ( BridgeRaceDMA[DistrictHouseholdsInDMA] ),
        SUM ( BridgeRaceDMA[DMAHouseholds] )
    )
VAR EstimatedShare =
    AVERAGE ( BridgeRaceDMA[DistrictDMAWeight] )
RETURN
    COALESCE ( HouseholdShare, EstimatedShare )

Estimated Broadcast Waste % =
VAR IsHouseRace = SELECTEDVALUE ( DimRace[Office] ) = "House"
RETURN
    IF ( IsHouseRace, MAX ( 0, 1 - [District Share of DMA] ) )

Estimated Wasted Broadcast $ =
[Broadcast Spend] * [Estimated Broadcast Waste %]

Total PAC Spend =
SUM ( FactFECIndependentExpenditures[Amount] )

PAC Support Spend =
CALCULATE (
    [Total PAC Spend],
    KEEPFILTERS ( FactFECIndependentExpenditures[SupportOppose] = "Support" )
)

PAC Oppose Spend =
CALCULATE (
    [Total PAC Spend],
    KEEPFILTERS ( FactFECIndependentExpenditures[SupportOppose] = "Oppose" )
)

PAC Net Support =
[PAC Support Spend] - [PAC Oppose Spend]

Votes =
SUM ( FactElectionResults[Votes] )

Vote Share % =
AVERAGE ( FactElectionResults[VoteShare] )

Cost Per Vote =
DIVIDE ( [Total Spend], [Votes] )

Completed Race Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimRace[CompletedFlag] = TRUE () ) )

Last Snapshot Date =
MAX ( DimSnapshot[SnapshotDate] )

Current Snapshot Rows =
COUNTROWS ( FactSpendCurrent )

Unmatched Advertiser Rows =
CALCULATE ( COUNTROWS ( FactSpendCurrent ), FactSpendCurrent[CandidateKey] = "UNMATCHED" )

Unmatched Advertiser % =
DIVIDE ( [Unmatched Advertiser Rows], [Current Snapshot Rows] )

Total Spend vs Prior Snapshot =
[Cumulative Spend as of Snapshot] - [Prior Snapshot Spend]

Case Study Score =
VAR SpendComponent = MIN ( 40, DIVIDE ( [Total Spend], 100000 ) )
VAR CableDeficitComponent = MIN ( 25, ( 1 - COALESCE ( [Cable Share %], 0 ) ) * 25 )
VAR WasteComponent = MIN ( 25, COALESCE ( [Estimated Broadcast Waste %], 0 ) * 25 )
VAR HouseBonus = IF ( SELECTEDVALUE ( DimRace[Office] ) = "House", 10, 0 )
RETURN
    SpendComponent + CableDeficitComponent + WasteComponent + HouseBonus
"""
    calculated_tables = """-- Calculated tables.

_Measures =
DATATABLE ( "Measure Table", STRING, { { "_Measures" } } )

TV Spend Floor Slider =
GENERATESERIES ( 0, 250000, 1000 )

Cable Share Target Slider =
GENERATESERIES ( 0, 0.5, 0.01 )

Trend Breakdown =
{
    ( "Candidate", NAMEOF ( DimCandidate[CandidateName] ), 0 ),
    ( "Advertiser", NAMEOF ( DimAdvertiser[Advertiser] ), 1 ),
    ( "Office", NAMEOF ( DimOffice[Office] ), 2 ),
    ( "State", NAMEOF ( DimState[State] ), 3 ),
    ( "DMA", NAMEOF ( DimDMA[DMA] ), 4 ),
    ( "Race Level", NAMEOF ( DimRaceLevel[Race Level] ), 5 ),
    ( "Party", NAMEOF ( DimParty[Party] ), 6 ),
    ( "Media Type", NAMEOF ( DimMediaType[Media Type] ), 7 ),
    ( "Agency", NAMEOF ( DimAgency[Agency] ), 8 )
}
"""
    relationships = """-- Relationship checklist.
-- Create single-direction one-to-many relationships from each dimension to both fact spend tables:
-- DimSnapshot[SnapshotDate] -> FactSpendSnapshot[SnapshotDate]
-- DimAdvertiser[AdvertiserKey] -> FactSpendSnapshot[AdvertiserKey] and FactSpendCurrent[AdvertiserKey]
-- DimAgency[AgencyKey] -> FactSpendSnapshot[AgencyKey] and FactSpendCurrent[AgencyKey]
-- DimMediaType[MediaTypeKey] -> FactSpendSnapshot[MediaTypeKey] and FactSpendCurrent[MediaTypeKey]
-- DimState[StateKey] -> FactSpendSnapshot[StateKey] and FactSpendCurrent[StateKey]
-- DimDMA[DMAKey] -> FactSpendSnapshot[DMAKey] and FactSpendCurrent[DMAKey]
-- DimOffice[OfficeKey] -> FactSpendSnapshot[OfficeKey] and FactSpendCurrent[OfficeKey]
-- DimRaceLevel[RaceLevelKey] -> FactSpendSnapshot[RaceLevelKey] and FactSpendCurrent[RaceLevelKey]
-- DimParty[PartyKey] -> FactSpendSnapshot[PartyKey] and FactSpendCurrent[PartyKey]
-- DimStation[StationKey] -> FactSpendSnapshot[StationKey] and FactSpendCurrent[StationKey]
-- DimNetwork[NetworkKey] -> FactSpendSnapshot[NetworkKey] and FactSpendCurrent[NetworkKey]
-- DimCandidate[CandidateKey] -> FactSpendSnapshot[CandidateKey], FactSpendCurrent[CandidateKey], FactFECIndependentExpenditures[CandidateKey], FactElectionResults[CandidateKey]
-- DimRace[RaceKey] -> FactSpendSnapshot[RaceKey], FactSpendCurrent[RaceKey], FactFECIndependentExpenditures[RaceKey], FactElectionResults[RaceKey], BridgeRaceDMA[RaceKey]
"""
    (DAX_DIR / "Measures.dax").write_text(measures, encoding="utf-8")
    (DAX_DIR / "CalculatedTables.dax").write_text(calculated_tables, encoding="utf-8")
    (DAX_DIR / "Relationships.txt").write_text(relationships, encoding="utf-8")


def write_docs(stats: dict, table_counts: dict) -> None:
    guide = f"""# Political Spend Power BI Implementation Pack

Generated for: `{PBIX}`

## What was implemented

- Seeded `Spend Snapshots` folder with `{SPEND_XLSB.name}`.
- Created `SnapshotManifest.csv` with `SnapshotDate = {SNAPSHOT_DATE.isoformat()}`, `Cycle = {CYCLE}`, and `IncludeFlag = TRUE`.
- Normalized the `.xlsb` spend sheet into clean snapshot fact tables, dimensions, QA tables, political windows, PAC spend, election results, and district-DMA bridge data.
- Added paste-ready Power Query and DAX scripts for the PBIX.

## Direct PBIX status

Direct Power BI Desktop automation was blocked by the Parallels accessibility bridge timing out, and `prlctl exec` is unavailable in this Parallels edition. The `.pbix` binary data model was not patched directly because that would risk corrupting the file. Use the scripts in this pack to apply the model changes safely in Power BI Desktop.

## Recommended application order

1. Open `Political Spend Dashboard-1.pbix` in Power BI Desktop.
2. In Power Query, create the `pProjectFolder` query and every table query from `powerquery/PowerQuery_CuratedCsvLoaders.pq`.
3. Load the tables, then create calculated tables from `dax/CalculatedTables.dax`.
4. Create relationships using `dax/Relationships.txt`.
5. Add all measures from `dax/Measures.dax` to `_Measures`.
6. Rebuild the report pages using `docs/ReportPageBuildSpec.md`.
7. Use `DataHealthSummary`, `CandidateCrosswalk`, `UnmatchedAdvertisers`, and `DuplicateBusinessKeys` on the QA page.

## Key source counts

- Raw spend rows read: {stats.get("RawRows", 0):,}
- Spend rows with nonzero amount: {stats.get("SpendRows", 0):,}
- Blank/zero amount rows skipped: {stats.get("SkippedBlankAmountRows", 0):,}
- Seed snapshot total spend: ${stats.get("TotalSpend", 0):,.2f}

## Curated table row counts

{chr(10).join(f'- `{name}`: {count:,}' for name, count in sorted(table_counts.items()))}
"""
    (OUT / "README.md").write_text(guide, encoding="utf-8")

    page_spec = """# Report Page Build Spec

## Executive Overview
- KPI cards: `[Total Spend]`, `[TV Spend]`, `[Cable Share %]`, `[Cable Opportunity $]`, `[Estimated Wasted Broadcast $]`, `[Zero Cable Count]`.
- Media mix: 100% stacked bar by `DimMediaType[Media Type]` and `[Total Spend]`.
- Detail table: State, DMA, Office, Race Level, Advertiser, Broadcast, Cable, CTV, Total Spend, Cable Share, Opportunity.
- Notes box: prospect logic uses selected TV spend floor and selected cable share target.

## Cable Prospect Finder
- Scatter: X `[Broadcast + CTV Spend]`, Y `[Cable Share %]`, size `[Total Spend]`, legend `DimRaceLevel[Race Level]`.
- Visual filter: `[Cable Prospect Flag] = 1`.
- Reference lines: `[Selected TV Spend Floor]` on X and `[Selected Cable Share Target]` on Y.
- Ranking table: State, DMA, Office, Race Level, Advertiser, Broadcast, CTV, Cable, Cable Share, Opportunity, Waste %, ElectionDate, WindowStatus.

## Advertiser / Candidate Detail
- Drillthrough filters: `DimAdvertiser[Advertiser]`, `DimRace[RaceName]`.
- Cards: Total Spend, Cable Share, Estimated Wasted Broadcast, PAC Support, PAC Oppose.
- Visuals: media mix stacked bar, snapshot line using `[Cumulative Spend as of Snapshot]`, station/network table, election results panel.

## Race Explorer
- Matrix columns: State, DMA, Office, District, ElectionDate, Candidate, Party, Total, Broadcast, Cable, Cable Share, Opportunity, PAC Support, PAC Oppose, Result, Cost Per Vote.
- Add `Trend Breakdown` parameter as grouping switcher.
- Slicers: Cycle, CompletedFlag, Cable Prospect Label.

## Election Calendar / Political Windows
- Gantt/stacked bar: `FactPoliticalWindows[WindowOpenDate]` to `FactPoliticalWindows[ElectionDate]`, grouped by State/DMA.
- Color by `WindowStatus`.
- Detail table: DMA, State, WindowOpenDate, ElectionDate, DaysToElection, current spend, Cable Share, top prospects.

## PAC / FEC Spend Breakdown
- Stacked bar by `FactFECIndependentExpenditures[CommitteeName]`, split by `SupportOppose`.
- Trend line by Date when transaction-level dates are available.
- Matrix by Race/Candidate: paid media spend, PAC support, PAC oppose, net support.

## Completed Elections & Cost Per Vote
- Scatter: X `[Cable Share %]`, Y `[Cost Per Vote]`, size `[Total Spend]`, color `FactElectionResults[Result]`.
- Detail matrix: Candidate, Party, State, Office, Votes, Vote Share, Result, Total Spend, Cost Per Vote.

## Case Study Finder
- Table sorted by `[Case Study Score]`.
- Filters: Office, Result, Party, Cost Per Vote buckets.
- Selection cards: Broadcast waste, targeted efficiency, cost per vote, vote share.

## Data Health / Refresh QA
- Cards: `[Last Snapshot Date]`, `[Current Snapshot Rows]`, `[Unmatched Advertiser Rows]`, `[Unmatched Advertiser %]`, `[Total Spend vs Prior Snapshot]`.
- Tables: `SnapshotFileLoad`, `CandidateCrosswalk`, `UnmatchedAdvertisers`, `DuplicateBusinessKeys`, `DataHealthSummary`.
"""
    (DOCS / "ReportPageBuildSpec.md").write_text(page_spec, encoding="utf-8")


def main() -> None:
    mkdirs()
    write_manifest()

    raw = load_xlsb(SPEND_XLSB)
    spend, stats = clean_spend(raw)
    candidates, election_results = load_candidate_sources()
    crosswalk = build_crosswalk(spend, candidates)
    spend = spend.merge(
        crosswalk,
        on=["Advertiser", "State", "Office", "Race Level", "Party"],
        how="left",
    )
    spend["CandidateKey"] = spend["CandidateKey"].fillna("UNMATCHED")
    spend["RaceKey"] = spend["RaceKey"].fillna("RACE_UNMATCHED")
    spend["MatchedCandidate"] = spend["MatchedCandidate"].fillna("UNMATCHED")
    spend["CandidateMatchScore"] = spend["CandidateMatchScore"].fillna(0.0)
    spend["CandidateMatchMethod"] = spend["CandidateMatchMethod"].fillna("unmatched")

    fact_snapshot, fact_current, dim_snapshot = create_fact_tables(spend)
    dim_candidate = candidates
    dim_race = build_race_dim(dim_candidate, election_results)
    bridge = build_bridge_race_dma()
    windows = build_windows()
    pac_fact = build_pac_fact(dim_candidate, crosswalk)

    dims = {
        "DimAdvertiser": dim_from_fact(fact_snapshot, "AdvertiserKey", "Advertiser"),
        "DimAgency": dim_from_fact(fact_snapshot, "AgencyKey", "Agency"),
        "DimMediaType": build_media_dim(fact_snapshot),
        "DimState": dim_from_fact(fact_snapshot, "StateKey", "State"),
        "DimDMA": dim_from_fact(fact_snapshot, "DMAKey", "DMA"),
        "DimOffice": dim_from_fact(fact_snapshot, "OfficeKey", "Office"),
        "DimRaceLevel": dim_from_fact(fact_snapshot, "RaceLevelKey", "Race Level"),
        "DimParty": dim_from_fact(fact_snapshot, "PartyKey", "Party"),
        "DimStation": dim_from_fact(fact_snapshot, "StationKey", "Station"),
        "DimNetwork": dim_from_fact(fact_snapshot, "NetworkKey", "Network"),
        "DimCandidate": dim_candidate,
        "DimRace": dim_race,
        "DimSnapshot": dim_snapshot,
    }

    duplicate_keys = (
        spend.groupby(["SnapshotDate", "RowBusinessKey"], as_index=False)
        .agg(DuplicateRows=("Amount", "size"), Amount=("Amount", "sum"))
        .query("DuplicateRows > 1")
        .sort_values("DuplicateRows", ascending=False)
    )
    unmatched = (
        spend[spend["CandidateKey"] == "UNMATCHED"][
            ["Advertiser", "State", "DMA", "Office", "Race Level", "Party", "Amount"]
        ]
        .groupby(["Advertiser", "State", "DMA", "Office", "Race Level", "Party"], as_index=False)
        .agg(Amount=("Amount", "sum"), Rows=("Amount", "size"))
        .sort_values("Amount", ascending=False)
    )
    snapshot_load = pd.DataFrame(
        [
            {
                "Name": SPEND_XLSB.name,
                "SnapshotDate": SNAPSHOT_DATE.isoformat(),
                "Cycle": CYCLE,
                "IncludeFlag": True,
                "RawRows": stats["RawRows"],
                "SpendRows": stats["SpendRows"],
                "TotalSpend": stats["TotalSpend"],
            }
        ]
    )
    health = pd.DataFrame(
        [
            {"Metric": "Last Snapshot Date", "ValueText": SNAPSHOT_DATE.isoformat(), "ValueNumber": None},
            {"Metric": "Raw Rows", "ValueText": str(stats["RawRows"]), "ValueNumber": stats["RawRows"]},
            {"Metric": "Spend Rows", "ValueText": str(stats["SpendRows"]), "ValueNumber": stats["SpendRows"]},
            {"Metric": "Total Spend", "ValueText": str(stats["TotalSpend"]), "ValueNumber": stats["TotalSpend"]},
            {
                "Metric": "Unmatched Spend Rows",
                "ValueText": str(int((spend["CandidateKey"] == "UNMATCHED").sum())),
                "ValueNumber": int((spend["CandidateKey"] == "UNMATCHED").sum()),
            },
            {"Metric": "Unmatched Advertiser Combos", "ValueText": str(len(unmatched)), "ValueNumber": len(unmatched)},
            {"Metric": "Duplicate Business Keys", "ValueText": str(len(duplicate_keys)), "ValueNumber": len(duplicate_keys)},
        ]
    )

    outputs: dict[str, pd.DataFrame] = {
        "stg_SpendClean": spend,
        "FactSpendSnapshot": fact_snapshot,
        "FactSpendCurrent": fact_current,
        "FactPoliticalWindows": windows,
        "FactFECIndependentExpenditures": pac_fact,
        "FactElectionResults": election_results,
        "BridgeRaceDMA": bridge,
        "CandidateCrosswalk": crosswalk,
        "UnmatchedAdvertisers": unmatched,
        "DuplicateBusinessKeys": duplicate_keys,
        "SnapshotFileLoad": snapshot_load,
        "DataHealthSummary": health,
    }
    outputs.update(dims)

    table_counts = {}
    for name, df in outputs.items():
        df = df.copy()
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].fillna("")
        write_csv(df, f"{name}.csv")
        table_counts[name] = len(df)

    write_powerquery_loaders(list(outputs.keys()))
    write_direct_folder_pipeline()
    write_dax()
    write_docs(stats, table_counts)

    print(f"Wrote implementation pack to {OUT}")
    print(f"FactSpendSnapshot rows: {len(fact_snapshot):,}")
    print(f"Total spend: ${fact_snapshot['Amount'].sum():,.2f}")
    print(f"Unmatched advertiser combos: {len(unmatched):,}")
    print(f"Duplicate business keys: {len(duplicate_keys):,}")


if __name__ == "__main__":
    main()
