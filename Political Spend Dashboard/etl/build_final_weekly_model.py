from __future__ import annotations

import csv
import hashlib
import os
import re
import shutil
from collections import defaultdict
from datetime import date
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

from config import (
    BASE_DIR,
    CASE_STUDY_NOTES,
    CIVIC_ADDRESS_TARGETS,
    CIVIC_API_DIR,
    CONTROL_DIR,
    CURATED_DIR,
    CYCLE,
    DATA_SOURCE_MANIFEST,
    DEFAULT_SNAPSHOT_DATE,
    DMA_RACE_COVERAGE,
    EXPECTED_SPEND_CHECKPOINTS,
    FEC_API_DIR,
    FEC_API_KEY_ENV,
    FEC_DIR,
    MAPPING_OVERRIDES,
    MARKET_DMA_CROSSWALK,
    CIVIC_API_KEY_ENV,
    POWERBI_DIR,
    QA_DIR,
    RACE_MASTER_MANUAL,
    REFRESH_CIVIC_API_ENV,
    REFRESH_DATE,
    REFRESH_FEC_API_ENV,
    SNAPSHOT_MANIFEST,
    SOURCE_FILES,
    SPEND_ACTIVITY_DIR,
    SPEND_DIR,
    WINDOWS_DIR,
    ensure_directories,
)
from api_sources import refresh_civic_api_sources, refresh_fec_api_sources, read_civic_tables
from normalize_spend import clean_key_text, clean_text, normalize_spend_file, stable_key, build_spend_facts


OFFICE_MAP = {"H": "House", "S": "Senate", "P": "President"}
SUPPORT_MAP = {"S": "Support", "O": "Oppose", "SUPPORT": "Support", "OPPOSE": "Oppose"}
UNKNOWN_CANDIDATE = "Unknown"
UNKNOWN_COMMITTEE = "Unknown"
UNKNOWN_RACE = "Unknown"
US_STATE_ABBR = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
}
MARKET_SCOPE_EXCLUDED_DMA = {
    "addressable",
    "desktop mobile",
    "national",
    "non metro",
    "regional sports network",
    "streaming video",
    "unknown",
}
MARKET_ALIASES = {
    "harrisburg lancaster lebanon york": "HLLY",
    "hattiesburg laurel": "SOUTHERN MISS",
    "biloxi gulfport": "SOUTHERN MISS",
    "wheeling steubenville": "WYC",
    "youngstown": "WYC",
}


def safe_read_csv(path: Path, **kwargs) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, dtype=str, keep_default_na=False, low_memory=False, **kwargs)


def safe_read_excel(path: Path, **kwargs) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_excel(path, dtype=str, keep_default_na=False, **kwargs)


def concat_frames(frames: list[pd.DataFrame]) -> pd.DataFrame:
    non_empty = [frame for frame in frames if frame is not None and not frame.empty]
    return pd.concat(non_empty, ignore_index=True, sort=False) if non_empty else pd.DataFrame()


def read_candidate_source_frames() -> pd.DataFrame:
    frames = [
        safe_read_csv(FEC_DIR / "candidate_summary_2026.csv"),
        safe_read_csv(FEC_API_DIR / f"api_candidate_summary_{CYCLE}.csv"),
    ]
    return concat_frames(frames)


def read_committee_source_frames() -> pd.DataFrame:
    frames = [
        safe_read_csv(FEC_DIR / "committee_summary_2026.csv"),
        safe_read_csv(FEC_API_DIR / f"api_committee_summary_{CYCLE}.csv"),
    ]
    return concat_frames(frames)


def read_independent_expenditure_frames() -> pd.DataFrame:
    frames = [
        safe_read_csv(FEC_DIR / "independent_expenditure_2026.csv"),
        safe_read_csv(FEC_API_DIR / f"api_independent_expenditure_{CYCLE}.csv"),
    ]
    if all(frame.empty for frame in frames):
        frames.append(safe_read_excel(FEC_DIR / "independent_expenditure_2026.xlsx"))
    return concat_frames(frames)


def to_number(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace("$", "").replace(",", "")
    if text == "" or text.lower() in {"nan", "none", "null"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_date(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null"}:
        return ""
    if re.fullmatch(r"\d{8}", text):
        parsed = pd.to_datetime(text, format="%Y%m%d", errors="coerce")
    else:
        parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return ""
    return parsed.date().isoformat()


def normalize_district(value) -> str:
    text = clean_text(value, "")
    if not text:
        return ""
    if re.fullmatch(r"\d+(\.0+)?", text):
        return str(int(float(text))).zfill(2)
    return text


def office_from_code(value) -> str:
    return OFFICE_MAP.get(clean_text(value, "").upper(), clean_text(value, "Unknown"))


def party_key(value) -> str:
    return clean_text(value, "Unknown").upper()


def race_key(cycle: int, office: str, state: str, district: str = "") -> str:
    if office == "President":
        state = "US"
        district = ""
    return f"{cycle}|{office}|{state}|{district}"


def source_key(*parts) -> str:
    raw = "|".join(clean_text(part, "") for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16].upper()


def write_csv(df: pd.DataFrame, path: Path) -> None:
    out = df.copy()
    for col in out.columns:
        if out[col].dtype == "object":
            out[col] = out[col].where(out[col].notna(), "")
    out.to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)


def write_excel(path: Path, sheets: dict[str, pd.DataFrame]) -> None:
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for sheet, df in sheets.items():
            df.to_excel(writer, index=False, sheet_name=sheet[:31])


def copy_source_files() -> None:
    copy_plan = {
        "spend_snapshot": SPEND_DIR / "2026-05-13_Home_Advertiser_data_5.xlsx",
        "spend_activity": SPEND_ACTIVITY_DIR / "Cross tab_data_1.xlsx",
        "candidate_summary": FEC_DIR / "candidate_summary_2026.csv",
        "independent_expenditure_csv": FEC_DIR / "independent_expenditure_2026.csv",
        "independent_expenditure_xlsx": FEC_DIR / "independent_expenditure_2026.xlsx",
        "committee_summary": FEC_DIR / "committee_summary_2026.csv",
        "electioneering": FEC_DIR / "ElectioneeringComm_2026.csv",
        "leadership": FEC_DIR / "leadership2026.csv",
        "lobbyist": FEC_DIR / "lobbyist.csv",
        "communication_costs": FEC_DIR / "CommunicationCosts_2026.csv",
        "dev_cash_on_hand": FEC_DIR / "DEV_cash_on_hand_data.xlsx",
        "political_windows": WINDOWS_DIR / "Political Windows by Market.xlsx",
    }
    for key, dest in copy_plan.items():
        src = SOURCE_FILES.get(key)
        if src and src.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)


def create_control_files() -> None:
    if SNAPSHOT_MANIFEST.exists():
        manifest = pd.read_excel(SNAPSHOT_MANIFEST, dtype=str).fillna("")
    else:
        manifest = pd.DataFrame(columns=["SourceFile", "SnapshotDate", "Cycle", "IncludeFlag", "Notes"])
    source_file = "2026-05-13_Home_Advertiser_data_5.xlsx"
    if not (manifest.get("SourceFile", pd.Series(dtype=str)) == source_file).any():
        manifest = pd.concat(
            [
                manifest,
                pd.DataFrame(
                    [
                        {
                            "SourceFile": source_file,
                            "SnapshotDate": DEFAULT_SNAPSHOT_DATE,
                            "Cycle": CYCLE,
                            "IncludeFlag": True,
                            "Notes": "Seeded from Home_Advertiser_data (5).xlsx",
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )
    write_excel(SNAPSHOT_MANIFEST, {"SnapshotManifest": manifest})

    # This is a structural source contract for Power BI, so regenerate it each
    # run while keeping manual controls in their own files.
    if True:
        write_csv(
            pd.DataFrame(
                [
                    {
                        "SourceName": "Weekly Spend Snapshots",
                        "SourceType": "Folder/File",
                        "System": "AdImpact/Home_Advertiser_data",
                        "Enabled": True,
                        "RawLocation": str(SPEND_DIR),
                        "CuratedOutputs": "FactSpendSnapshot; FactSpendCurrent; spend dimensions",
                        "RefreshMode": "File drop + SnapshotManifest",
                        "ApiKeyEnvVar": "",
                        "Notes": "Add each cumulative weekly spend file to SnapshotManifest. Power BI should consume curated CSV outputs, not raw snapshots.",
                    },
                    {
                        "SourceName": "FEC Bulk Files",
                        "SourceType": "File",
                        "System": "FEC bulk downloads",
                        "Enabled": True,
                        "RawLocation": str(FEC_DIR),
                        "CuratedOutputs": "DimCandidate; DimCommittee; FactOutsideSpend; FactCandidateFinance",
                        "RefreshMode": "Weekly file replacement or API supplement",
                        "ApiKeyEnvVar": "",
                        "Notes": "Current local FEC files remain a deterministic fallback and QA checkpoint.",
                    },
                    {
                        "SourceName": "OpenFEC API",
                        "SourceType": "OpenFEC API",
                        "System": "Federal Election Commission OpenFEC",
                        "Enabled": False,
                        "RawLocation": str(FEC_API_DIR),
                        "CuratedOutputs": "API candidate, committee, and independent expenditure supplements",
                        "RefreshMode": f"Set {REFRESH_FEC_API_ENV}=1",
                        "ApiKeyEnvVar": FEC_API_KEY_ENV,
                        "Notes": "Optional API refresh. API outputs are normalized to the same canonical columns as FEC bulk files.",
                    },
                    {
                        "SourceName": "Google Civic Information API",
                        "SourceType": "Civic API",
                        "System": "Google Civic Information API",
                        "Enabled": False,
                        "RawLocation": str(CIVIC_API_DIR),
                        "CuratedOutputs": "DimCivicElection; FactCivicContest; DimCivicCandidate; FactCivicPollingLocation",
                        "RefreshMode": f"Set {REFRESH_CIVIC_API_ENV}=1",
                        "ApiKeyEnvVar": CIVIC_API_KEY_ENV,
                        "Notes": "CivicAPI requires address targets for voterInfo. It provides elections/contests/candidates, not official certified results.",
                    },
                    {
                        "SourceName": "Political Windows",
                        "SourceType": "File",
                        "System": "Political window calendar",
                        "Enabled": True,
                        "RawLocation": str(WINDOWS_DIR),
                        "CuratedOutputs": "FactPoliticalWindows",
                        "RefreshMode": "File replacement",
                        "ApiKeyEnvVar": "",
                        "Notes": "Market names can be reconciled to spend DMAs through MarketDMACrosswalk.",
                    },
                ]
            ),
            DATA_SOURCE_MANIFEST,
        )

    if not CIVIC_ADDRESS_TARGETS.exists():
        write_csv(
            pd.DataFrame(
                columns=[
                    "AddressTargetKey",
                    "StateKey",
                    "DMA",
                    "Market",
                    "Address",
                    "ElectionId",
                    "IncludeFlag",
                    "Notes",
                ]
            ),
            CIVIC_ADDRESS_TARGETS,
        )

    if not MAPPING_OVERRIDES.exists():
        write_excel(
            MAPPING_OVERRIDES,
            {
                "Overrides": pd.DataFrame(
                    columns=[
                        "Advertiser",
                        "AdvertiserKey",
                        "OverrideEntityType",
                        "OverrideFEC_ID",
                        "OverrideCandidateKey",
                        "OverrideCommitteeKey",
                        "OverrideRaceKey",
                        "OverrideMatchedName",
                        "OverrideNotes",
                        "ApprovedBy",
                        "ApprovedDate",
                    ]
                )
            },
        )
    if not RACE_MASTER_MANUAL.exists():
        write_excel(
            RACE_MASTER_MANUAL,
            {
                "RaceMasterManual": pd.DataFrame(
                    columns=[
                        "RaceKey",
                        "Cycle",
                        "Office",
                        "OfficeCode",
                        "StateKey",
                        "District",
                        "RaceName",
                        "RaceLevel",
                        "ElectionType",
                        "ElectionDate",
                        "RaceStatus",
                        "ResultStatus",
                        "Notes",
                    ]
                )
            },
        )
    if not DMA_RACE_COVERAGE.exists():
        write_excel(
            DMA_RACE_COVERAGE,
            {
                "DMARaceCoverage": pd.DataFrame(
                    columns=[
                        "RaceKey",
                        "StateKey",
                        "DMAKey",
                        "Market",
                        "DistrictHouseholdsInDMA",
                        "DMAHouseholds",
                        "CoverageNotes",
                    ]
                )
            },
        )
    if not MARKET_DMA_CROSSWALK.exists():
        write_excel(
            MARKET_DMA_CROSSWALK,
            {"MarketDMACrosswalk": pd.DataFrame(columns=["Market", "DMA", "DMAKey", "StateKey", "Notes"])},
        )
    if not CASE_STUDY_NOTES.exists():
        write_excel(
            CASE_STUDY_NOTES,
            {
                "CaseStudyNotes": pd.DataFrame(
                    columns=[
                        "RaceKey",
                        "AdvertiserKey",
                        "Status",
                        "Owner",
                        "Narrative",
                        "ApprovedForSales",
                        "DeckLink",
                        "LastUpdated",
                    ]
                )
            },
        )


def load_manifest() -> pd.DataFrame:
    manifest = pd.read_excel(SNAPSHOT_MANIFEST, dtype=str).fillna("")
    manifest["IncludeFlag"] = manifest["IncludeFlag"].map(lambda v: str(v).strip().lower() in {"true", "1", "yes", "y"})
    manifest["Cycle"] = pd.to_numeric(manifest["Cycle"], errors="coerce").fillna(CYCLE).astype(int)
    return manifest


def build_spend_tables() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    manifest = load_manifest()
    included = manifest[manifest["IncludeFlag"]].copy()
    frames = []
    stats = []
    for _, row in included.iterrows():
        source_file = row["SourceFile"]
        path = SPEND_DIR / source_file
        normalized, file_stats = normalize_spend_file(path, row["SnapshotDate"], int(row["Cycle"]), source_file)
        frames.append(normalized)
        stats.append(file_stats)
    stg = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    fact_snapshot, fact_current = build_spend_facts(stg)

    latest_snapshot = fact_snapshot["SnapshotDate"].max()
    dim_snapshot = (
        fact_snapshot[["SnapshotDate", "Cycle", "SourceFile"]]
        .drop_duplicates()
        .sort_values("SnapshotDate")
        .reset_index(drop=True)
    )
    dim_snapshot["SnapshotLabel"] = pd.to_datetime(dim_snapshot["SnapshotDate"]).dt.strftime("%Y-%m-%d Snapshot")
    dim_snapshot["SnapshotWeek"] = pd.to_datetime(dim_snapshot["SnapshotDate"]).dt.isocalendar().week.astype(int)
    dim_snapshot["IsLatestSnapshot"] = dim_snapshot["SnapshotDate"].eq(latest_snapshot)

    stats_df = pd.DataFrame(stats)
    return stg, fact_snapshot, fact_current, dim_snapshot, stats_df


def dim_from_fact(fact: pd.DataFrame, key: str, label: str, extras: list[str] | None = None) -> pd.DataFrame:
    cols = [key, label] + (extras or [])
    return fact[cols].drop_duplicates().sort_values(label).reset_index(drop=True)


def build_spend_dimensions(
    fact_snapshot: pd.DataFrame,
    dim_snapshot: pd.DataFrame,
    fact_political_windows: pd.DataFrame | None = None,
) -> dict[str, pd.DataFrame]:
    dims = {
        "dim_advertiser": dim_from_fact(fact_snapshot, "AdvertiserKey", "Advertiser", ["AdvertiserType"]),
        "dim_agency": dim_from_fact(fact_snapshot, "AgencyKey", "Agency"),
        "dim_state": dim_from_fact(fact_snapshot, "StateKey", "State"),
        "dim_dma": dim_from_fact(fact_snapshot, "DMAKey", "DMA"),
        "dim_office": dim_from_fact(fact_snapshot, "OfficeKey", "Office"),
        "dim_race_level": dim_from_fact(fact_snapshot, "RaceLevelKey", "RaceLevel"),
        "dim_party": dim_from_fact(fact_snapshot, "PartyKey", "Party"),
        "dim_station": dim_from_fact(fact_snapshot, "StationKey", "Station"),
        "dim_network": dim_from_fact(fact_snapshot, "NetworkKey", "Network"),
        "dim_snapshot": dim_snapshot,
    }
    media = dim_from_fact(fact_snapshot, "MediaTypeKey", "MediaType")
    media_map = {
        "Broadcast": ("Linear TV", "False"),
        "Cable": ("Linear TV", "True"),
        "CTV": ("Streaming Video", "True"),
        "Digital": ("Digital", "True"),
        "Radio": ("Audio", "Mixed"),
    }
    media["MediaGroup"] = media["MediaType"].map(lambda value: media_map.get(value, ("Other", "Unknown"))[0])
    media["IsGeoTargetable"] = media["MediaType"].map(lambda value: media_map.get(value, ("Other", "Unknown"))[1])
    media["IsBroadcast"] = media["MediaType"].eq("Broadcast")
    media["IsCable"] = media["MediaType"].eq("Cable")
    media["IsCTV"] = media["MediaType"].eq("CTV")
    media["IsDigital"] = media["MediaType"].eq("Digital")
    media["IsRadio"] = media["MediaType"].eq("Radio")
    dims["dim_media_type"] = media
    dims["dim_advertiser"]["AdvertiserClean"] = dims["dim_advertiser"]["Advertiser"].map(clean_key_text)

    if fact_political_windows is not None and not fact_political_windows.empty:
        dims["dim_state"] = (
            fact_political_windows[["StateKey"]]
            .drop_duplicates()
            .assign(State=lambda df: df["StateKey"])
            [["StateKey", "State"]]
            .sort_values("State")
            .reset_index(drop=True)
        )
        dims["dim_dma"] = (
            fact_political_windows[["DMAKey", "Market"]]
            .drop_duplicates()
            .rename(columns={"Market": "DMA"})
            .sort_values("DMA")
            .reset_index(drop=True)
        )
    return dims


def build_candidate_tables() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    raw = read_candidate_source_frames()
    if raw.empty:
        empty_candidate = pd.DataFrame(
            [{"CandidateKey": UNKNOWN_CANDIDATE, "CandidateName": "Unknown", "RaceKey": UNKNOWN_RACE}]
        )
        return empty_candidate, pd.DataFrame(), pd.DataFrame()
    expected_cols = [
        "Cand_Id",
        "Cand_Name",
        "Cand_Office",
        "Cand_Office_St",
        "Cand_Office_Dist",
        "Cand_Party_Affiliation",
        "Cand_Incumbent_Challenger_Open_Seat",
        "Link_Image",
    ]
    for col in expected_cols:
        if col not in raw:
            raw[col] = ""
    raw = raw[raw["Cand_Id"].map(lambda value: clean_text(value, "")) != ""].drop_duplicates("Cand_Id", keep="first")

    dim = pd.DataFrame()
    dim["CandidateKey"] = raw["Cand_Id"].map(lambda value: clean_text(value, UNKNOWN_CANDIDATE))
    dim["CandidateName"] = raw["Cand_Name"].map(lambda value: clean_text(value, "Unknown"))
    dim["OfficeCode"] = raw["Cand_Office"].map(lambda value: clean_text(value, ""))
    dim["Office"] = dim["OfficeCode"].map(office_from_code)
    dim["StateKey"] = raw["Cand_Office_St"].map(lambda value: "US" if clean_text(value, "") == "" and dim["Office"].eq("President").any() else clean_text(value, ""))
    dim["District"] = raw["Cand_Office_Dist"].map(normalize_district)
    dim.loc[dim["Office"].eq("President"), ["StateKey", "District"]] = ["US", ""]
    dim["PartyKey"] = raw["Cand_Party_Affiliation"].map(party_key)
    dim["Party"] = raw["Cand_Party_Affiliation"].map(lambda value: clean_text(value, "Unknown"))
    dim["IncumbencyStatus"] = raw["Cand_Incumbent_Challenger_Open_Seat"].map(lambda value: clean_text(value, "Unknown"))
    dim["RaceKey"] = dim.apply(lambda row: race_key(CYCLE, row["Office"], row["StateKey"], row["District"]), axis=1)
    dim["FECLink"] = raw.get("Link_Image", "")

    numeric_fields = [
        "Total_Receipt",
        "Total_Disbursement",
        "Cash_On_Hand_COP",
        "Debt_Owed_By_Committee",
        "Individual_Contribution",
        "Other_Committee_Contribution",
        "Party_Committee_Contribution",
        "Total_Contribution",
        "Operating_Expenditure",
        "Net_Contribution",
        "Net_Operating_Expenditure",
        "Individual_Itemized_Contribution",
        "Individual_Unitemized_Contribution",
    ]
    finance = pd.DataFrame()
    finance["CandidateKey"] = dim["CandidateKey"]
    finance["Coverage_Start_Date"] = raw["Coverage_Start_Date"].map(to_date) if "Coverage_Start_Date" in raw else ""
    finance["Coverage_End_Date"] = raw["Coverage_End_Date"].map(to_date) if "Coverage_End_Date" in raw else ""
    for field in numeric_fields:
        finance[field] = raw[field].map(to_number) if field in raw else None

    races = (
        dim[["RaceKey", "Office", "OfficeCode", "StateKey", "District"]]
        .drop_duplicates()
        .sort_values(["Office", "StateKey", "District"])
        .reset_index(drop=True)
    )
    races["Cycle"] = CYCLE
    races["RaceName"] = races.apply(
        lambda row: f"{row['Cycle']} {row['StateKey']} {row['Office']} {row['District']}".strip(),
        axis=1,
    )
    races["RaceLevel"] = races["Office"]
    races["ElectionType"] = "Unknown"
    races["ElectionDate"] = ""
    races["RaceStatus"] = "Active"
    races["ResultStatus"] = "Not Loaded"

    unknown_candidate = pd.DataFrame(
        [
            {
                "CandidateKey": UNKNOWN_CANDIDATE,
                "CandidateName": "Unknown",
                "OfficeCode": "",
                "Office": "Unknown",
                "StateKey": "",
                "District": "",
                "PartyKey": "",
                "Party": "Unknown",
                "IncumbencyStatus": "Unknown",
                "RaceKey": UNKNOWN_RACE,
                "FECLink": "",
            }
        ]
    )
    unknown_race = pd.DataFrame(
        [
            {
                "RaceKey": UNKNOWN_RACE,
                "Office": "Unknown",
                "OfficeCode": "",
                "StateKey": "",
                "District": "",
                "Cycle": CYCLE,
                "RaceName": "Unknown",
                "RaceLevel": "Unknown",
                "ElectionType": "Unknown",
                "ElectionDate": "",
                "RaceStatus": "Unknown",
                "ResultStatus": "Not Loaded",
            }
        ]
    )
    dim = pd.concat([unknown_candidate, dim.drop_duplicates("CandidateKey")], ignore_index=True)
    races = pd.concat([unknown_race, races.drop_duplicates("RaceKey")], ignore_index=True)
    return dim, finance, races


def append_committee(registry: dict[str, dict], committee_key: str, committee_name: str, source: str, **fields) -> None:
    committee_key = clean_text(committee_key, "")
    if not committee_key:
        committee_key = stable_key("CMTE", committee_name)
    committee_name = clean_text(committee_name, "Unknown")
    record = registry.setdefault(
        committee_key,
        {
            "CommitteeKey": committee_key,
            "CommitteeName": committee_name,
            "IsLobbyist": False,
            "SourceList": set(),
            "CommitteeType": "",
            "CommitteeDesignation": "",
            "TreasurerName": "",
            "SponsorName": "",
            "CandidateKey": "",
            "CashOnHand": None,
        },
    )
    if committee_name != "Unknown" and record["CommitteeName"] == "Unknown":
        record["CommitteeName"] = committee_name
    record["SourceList"].add(source)
    for key, value in fields.items():
        if key == "IsLobbyist":
            record[key] = record[key] or bool(value)
        elif value not in [None, ""] and not record.get(key):
            record[key] = value


def build_committee_table() -> pd.DataFrame:
    registry: dict[str, dict] = {}
    committee_summary = read_committee_source_frames()
    for _, row in committee_summary.iterrows():
        append_committee(
            registry,
            row.get("CMTE_ID"),
            row.get("CMTE_NM"),
            "committee_summary",
            CommitteeType=row.get("CMTE_TP"),
            CommitteeDesignation=row.get("CMTE_DSGN"),
            TreasurerName=row.get("TRES_NM"),
            CandidateKey=row.get("CAND_ID"),
            CashOnHand=to_number(row.get("COH_COP")),
        )

    ie = read_independent_expenditure_frames()
    for _, row in ie.iterrows():
        append_committee(registry, row.get("spe_id"), row.get("spe_nam"), "independent_expenditure")

    electioneering = safe_read_csv(FEC_DIR / "ElectioneeringComm_2026.csv")
    for _, row in electioneering.iterrows():
        append_committee(registry, row.get("COMMITTEE_ID"), row.get("COMMITTEE_NAME"), "electioneering")

    communication = safe_read_csv(FEC_DIR / "CommunicationCosts_2026.csv")
    for _, row in communication.iterrows():
        append_committee(registry, row.get("CMTE_ID"), row.get("CMTE_NM"), "communication_costs")

    lobbyist = safe_read_csv(FEC_DIR / "lobbyist.csv")
    for _, row in lobbyist.iterrows():
        append_committee(registry, row.get("Committee_Id"), row.get("Committee_Name"), "lobbyist", IsLobbyist=True)

    leadership = safe_read_csv(FEC_DIR / "leadership2026.csv")
    for _, row in leadership.iterrows():
        append_committee(
            registry,
            row.get("Committee_Id"),
            row.get("Committee_Name"),
            "leadership",
            SponsorName=row.get("Sponsor_Name"),
            CashOnHand=to_number(row.get("Cash_on_Hand")),
        )

    dev_cash = safe_read_excel(FEC_DIR / "DEV_cash_on_hand_data.xlsx")
    for _, row in dev_cash.iterrows():
        append_committee(
            registry,
            row.get("Fec Id"),
            row.get("Advertiser"),
            "dev_cash_on_hand",
            CashOnHand=to_number(row.get("Cash on Hand")),
        )

    append_committee(registry, UNKNOWN_COMMITTEE, "Unknown", "system")
    records = []
    for record in registry.values():
        copy = record.copy()
        copy["SourceList"] = "; ".join(sorted(copy["SourceList"]))
        records.append(copy)
    return pd.DataFrame(records).drop_duplicates("CommitteeKey").sort_values("CommitteeName").reset_index(drop=True)


def normalize_support(value) -> str:
    key = clean_text(value, "").upper()
    return SUPPORT_MAP.get(key, "Unknown")


def outside_row(
    source_type: str,
    committee_key: str,
    committee_name: str,
    candidate_key: str,
    candidate_name: str,
    office_code: str,
    state: str,
    district: str,
    election_type: str,
    spend_date: str,
    amount,
    support_oppose: str,
    purpose: str,
    payee: str,
    file_number: str,
    transaction_id: str,
    image_number: str,
) -> dict:
    office = office_from_code(office_code)
    state = clean_text(state, "US" if office == "President" else "")
    district = normalize_district(district)
    if candidate_key == "":
        candidate_key = UNKNOWN_CANDIDATE
    rk = race_key(CYCLE, office, state, district) if state and office != "Unknown" else UNKNOWN_RACE
    return {
        "OutsideSpendKey": source_key(source_type, committee_key, candidate_key, spend_date, amount, transaction_id, image_number),
        "SourceType": source_type,
        "CommitteeKey": clean_text(committee_key, UNKNOWN_COMMITTEE),
        "CommitteeName": clean_text(committee_name, "Unknown"),
        "CandidateKey": clean_text(candidate_key, UNKNOWN_CANDIDATE),
        "CandidateName": clean_text(candidate_name, "Unknown"),
        "RaceKey": rk,
        "Office": office,
        "OfficeCode": clean_text(office_code, ""),
        "StateKey": state,
        "District": district,
        "ElectionType": clean_text(election_type, "Unknown"),
        "SpendDate": to_date(spend_date),
        "Amount": to_number(amount),
        "SupportOppose": normalize_support(support_oppose),
        "Purpose": clean_text(purpose, ""),
        "Payee": clean_text(payee, ""),
        "FileNumber": clean_text(file_number, ""),
        "TransactionID": clean_text(transaction_id, ""),
        "ImageNumber": clean_text(image_number, ""),
    }


def build_outside_spend() -> pd.DataFrame:
    rows = []
    ie = read_independent_expenditure_frames()
    for _, row in ie.iterrows():
        rows.append(
            outside_row(
                "Independent Expenditure",
                row.get("spe_id"),
                row.get("spe_nam"),
                row.get("cand_id"),
                row.get("cand_name"),
                row.get("can_office"),
                row.get("can_office_state"),
                row.get("can_office_dis"),
                row.get("ele_type"),
                row.get("exp_date"),
                row.get("exp_amo"),
                row.get("sup_opp"),
                row.get("pur"),
                row.get("pay"),
                row.get("file_num"),
                row.get("tran_id"),
                row.get("image_num"),
            )
        )

    electioneering = safe_read_csv(FEC_DIR / "ElectioneeringComm_2026.csv")
    for _, row in electioneering.iterrows():
        rows.append(
            outside_row(
                "Electioneering",
                row.get("COMMITTEE_ID"),
                row.get("COMMITTEE_NAME"),
                row.get("CANDIDATE_ID"),
                row.get("CANDIDATE_NAME"),
                row.get("CANDIDATE_OFFICE"),
                row.get("CANDIDATE_STATE"),
                row.get("CANDIDATE_DISTRICT"),
                "",
                row.get("COMMUNICATION_DATE") or row.get("DISBURSEMENT_DATE"),
                row.get("CALCULATED_CANDIDATE_SHARE") or row.get("REPORTED_DISBURSEMENT_AMOUNT"),
                "",
                row.get("DISBURSEMENT_DESCRIPTION"),
                row.get("PAYEE_NAME"),
                "",
                "",
                row.get("SB_IMAGE_NUM"),
            )
        )

    communication = safe_read_csv(FEC_DIR / "CommunicationCosts_2026.csv")
    for _, row in communication.iterrows():
        rows.append(
            outside_row(
                "Communication Cost",
                row.get("CMTE_ID"),
                row.get("CMTE_NM"),
                row.get("CAND_ID"),
                row.get("CAND_NAME"),
                row.get("CAND_OFFICE"),
                row.get("CAND_STATE"),
                row.get("CAND_OFFICE_DISTRICT"),
                "",
                row.get("TRANSACTION_DT"),
                row.get("TRANSACTION_AMT"),
                row.get("SUPPORT_OPPOSE_IND"),
                row.get("PURPOSE"),
                "",
                row.get("FILE_NUM"),
                row.get("TRAN_ID"),
                row.get("IMAGE_NUM"),
            )
        )
    return pd.DataFrame(rows)


def build_race_table(dim_candidate_race: pd.DataFrame, fact_outside_spend: pd.DataFrame) -> pd.DataFrame:
    outside_races = fact_outside_spend[["RaceKey", "Office", "OfficeCode", "StateKey", "District", "ElectionType"]].drop_duplicates()
    outside_races = outside_races[outside_races["RaceKey"].ne(UNKNOWN_RACE)].copy()
    outside_races["Cycle"] = CYCLE
    outside_races["RaceName"] = outside_races.apply(
        lambda row: f"{CYCLE} {row['StateKey']} {row['Office']} {row['District']}".strip(),
        axis=1,
    )
    outside_races["RaceLevel"] = outside_races["Office"]
    outside_races["ElectionDate"] = ""
    outside_races["RaceStatus"] = "Active"
    outside_races["ResultStatus"] = "Not Loaded"

    manual = pd.read_excel(RACE_MASTER_MANUAL, dtype=str).fillna("") if RACE_MASTER_MANUAL.exists() else pd.DataFrame()
    races = pd.concat([dim_candidate_race, outside_races, manual], ignore_index=True, sort=False)
    required = [
        "RaceKey",
        "Cycle",
        "Office",
        "OfficeCode",
        "StateKey",
        "District",
        "RaceName",
        "RaceLevel",
        "ElectionType",
        "ElectionDate",
        "RaceStatus",
        "ResultStatus",
    ]
    for col in required:
        if col not in races:
            races[col] = ""
    return races[required].drop_duplicates("RaceKey").reset_index(drop=True)


def build_political_windows() -> pd.DataFrame:
    path = WINDOWS_DIR / "Political Windows by Market.xlsx"
    if not path.exists():
        return pd.DataFrame(
            columns=[
                "PoliticalWindowKey",
                "StateKey",
                "Region",
                "Market",
                "DMAKey",
                "WindowType",
                "WindowOpenDate",
                "ElectionDate",
                "DaysToWindowOpen",
                "DaysToElection",
                "WindowStatus",
            ]
        )
    raw = pd.read_excel(path)
    raw = raw.rename(columns={"State": "StateKey", "Market": "Market", "Market/DMA": "Market", "WINDOW TYPE": "WindowType"})
    out = pd.DataFrame()
    out["StateKey"] = raw["StateKey"].map(lambda value: clean_text(value, ""))
    out["Region"] = raw["Region"].map(lambda value: clean_text(value, "")) if "Region" in raw else ""
    out["Market"] = raw["Market"].map(lambda value: clean_text(value, ""))
    out["DMAKey"] = out["Market"].map(lambda value: stable_key("DMA", value))
    out["WindowType"] = raw["WindowType"].map(lambda value: clean_text(value, "Unknown"))
    out["WindowOpenDate"] = raw["WINDOW OPEN DATE"].map(to_date)
    out["ElectionDate"] = raw["ELECTION DATE"].map(to_date)
    refresh = pd.to_datetime(REFRESH_DATE).date()

    def days_until(value: str) -> int | None:
        if not value:
            return None
        return (pd.to_datetime(value).date() - refresh).days

    out["DaysToWindowOpen"] = out["WindowOpenDate"].map(days_until)
    out["DaysToElection"] = out["ElectionDate"].map(days_until)

    def window_status(row) -> str:
        if row["DaysToElection"] is not None and row["DaysToElection"] < 0:
            return "Completed"
        if row["DaysToWindowOpen"] is not None and row["DaysToElection"] is not None and row["DaysToWindowOpen"] <= 0 <= row["DaysToElection"]:
            return "In Window"
        if row["DaysToWindowOpen"] is not None and 0 < row["DaysToWindowOpen"] <= 30:
            return "Opening Next 30"
        return "Future"

    out["WindowStatus"] = out.apply(window_status, axis=1)
    out["PoliticalWindowKey"] = out.apply(
        lambda row: stable_key("WIN", row["StateKey"], row["Market"], row["WindowType"], row["ElectionDate"]),
        axis=1,
    )
    return out[
        [
            "PoliticalWindowKey",
            "StateKey",
            "Region",
            "Market",
            "DMAKey",
            "WindowType",
            "WindowOpenDate",
            "ElectionDate",
            "DaysToWindowOpen",
            "DaysToElection",
            "WindowStatus",
        ]
    ]


def market_match_key(value) -> str:
    text = clean_key_text(value)
    tokens = text.split()
    while tokens and tokens[-1].upper() in US_STATE_ABBR:
        tokens.pop()
    return " ".join(tokens)


def expand_calendar_states(value) -> set[str]:
    text = clean_text(value, "").upper()
    return {part.strip() for part in re.split(r"[/,]+", text) if part.strip()}


def build_window_market_metadata(fact_political_windows: pd.DataFrame) -> dict[str, dict]:
    metadata: dict[str, dict] = {}
    if fact_political_windows.empty:
        return metadata

    for market, group in fact_political_windows.groupby("Market", dropna=False):
        market_label = clean_text(market, "")
        if not market_label:
            continue
        market_key = market_match_key(market_label)
        states = sorted(clean_text(value, "").upper() for value in group["StateKey"].dropna().unique())
        expanded_states: set[str] = set()
        for state in states:
            expanded_states.update(expand_calendar_states(state))
        regions = sorted(clean_text(value, "") for value in group["Region"].dropna().unique() if clean_text(value, ""))
        metadata[market_key] = {
            "Market": market_label,
            "DMAKey": stable_key("DMA", market_label),
            "StateKeys": states,
            "ExpandedStates": expanded_states,
            "Region": "; ".join(regions),
        }
    return metadata


def resolve_window_market(row: pd.Series, market_metadata: dict[str, dict]) -> dict:
    raw_state = clean_text(row.get("State"), "").upper()
    raw_dma = clean_text(row.get("DMA"), "")
    spend_key = market_match_key(raw_dma)
    if not raw_state or not spend_key or spend_key in MARKET_SCOPE_EXCLUDED_DMA:
        return {
            "InPoliticalWindowMarket": False,
            "PoliticalWindowState": "",
            "PoliticalWindowMarket": "",
            "PoliticalWindowRegion": "",
        }

    candidate_keys: list[str] = []
    alias = MARKET_ALIASES.get(spend_key)
    if alias:
        candidate_keys.append(market_match_key(alias))
    if spend_key in market_metadata:
        candidate_keys.append(spend_key)
    for market_key in sorted(market_metadata, key=len, reverse=True):
        if spend_key.startswith(f"{market_key} ") or market_key.startswith(f"{spend_key} "):
            candidate_keys.append(market_key)

    seen: set[str] = set()
    for market_key in candidate_keys:
        if market_key in seen or market_key not in market_metadata:
            continue
        seen.add(market_key)
        meta = market_metadata[market_key]
        if raw_state not in meta["ExpandedStates"]:
            continue
        state_matches = [state for state in meta["StateKeys"] if raw_state in expand_calendar_states(state)]
        if raw_state in state_matches:
            state_key = raw_state
        else:
            state_key = sorted(state_matches, key=lambda value: (len(expand_calendar_states(value)), value))[0]
        return {
            "InPoliticalWindowMarket": True,
            "PoliticalWindowState": state_key,
            "PoliticalWindowMarket": meta["Market"],
            "PoliticalWindowRegion": meta["Region"],
        }

    return {
        "InPoliticalWindowMarket": False,
        "PoliticalWindowState": "",
        "PoliticalWindowMarket": "",
        "PoliticalWindowRegion": "",
    }


def recompute_spend_business_keys(fact: pd.DataFrame) -> pd.DataFrame:
    out = fact.copy()
    row_key_fields = [
        "AdvertiserKey",
        "AgencyKey",
        "StateKey",
        "DMAKey",
        "OfficeKey",
        "RaceLevelKey",
        "PartyKey",
        "MediaTypeKey",
        "StationKey",
        "NetworkKey",
    ]
    out["RowBusinessKey"] = out[row_key_fields].agg("|".join, axis=1)
    out["RowBusinessKeyHash"] = out["RowBusinessKey"].map(
        lambda value: hashlib.sha1(value.encode("utf-8")).hexdigest()[:16].upper()
    )
    return out


def apply_political_window_market_scope(
    fact: pd.DataFrame,
    fact_political_windows: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if fact.empty or fact_political_windows.empty:
        return fact.copy(), pd.DataFrame()

    market_metadata = build_window_market_metadata(fact_political_windows)
    resolved = fact.apply(lambda row: resolve_window_market(row, market_metadata), axis=1, result_type="expand")
    scoped = pd.concat([fact.copy(), resolved], axis=1)
    scoped["RawState"] = scoped["State"]
    scoped["RawDMA"] = scoped["DMA"]

    excluded = (
        scoped[~scoped["InPoliticalWindowMarket"]]
        .groupby(["RawState", "RawDMA"], dropna=False, as_index=False)
        .agg(RowsExcluded=("Amount", "size"), AmountExcluded=("Amount", "sum"))
        .sort_values("AmountExcluded", ascending=False)
        .reset_index(drop=True)
    )
    if not excluded.empty:
        excluded["Reason"] = "State/DMA not present in Political Windows by Market calendar"

    scoped = scoped[scoped["InPoliticalWindowMarket"]].copy()
    scoped["State"] = scoped["PoliticalWindowState"]
    scoped["DMA"] = scoped["PoliticalWindowMarket"]
    scoped["StateKey"] = scoped["State"].map(lambda value: stable_key("STA", value))
    scoped["DMAKey"] = scoped["DMA"].map(lambda value: stable_key("DMA", value))
    scoped = recompute_spend_business_keys(scoped)
    return scoped.reset_index(drop=True), excluded


STOPWORDS = {
    "for",
    "committee",
    "campaign",
    "friends",
    "citizens",
    "people",
    "vote",
    "elect",
    "reelect",
    "re",
    "pac",
    "super",
    "inc",
    "llc",
    "ltd",
    "corp",
    "corporation",
    "company",
    "fund",
    "action",
    "america",
    "american",
    "americans",
    "congress",
    "senate",
    "house",
    "governor",
    "district",
    "committee",
}


def match_text(value: str) -> str:
    return " ".join(token for token in clean_key_text(value).split() if token not in STOPWORDS and len(token) >= 3)


def tokenize(value: str) -> set[str]:
    return {token for token in match_text(value).split() if len(token) >= 3}


def entity_type_from_committee(row) -> str:
    committee_type = clean_text(row.get("CommitteeType", ""), "").upper()
    if committee_type in {"O", "U", "Q", "N"}:
        return "PAC"
    if committee_type in {"X", "Y", "Z"}:
        return "Party"
    return "Committee"


def build_entities(dim_candidate: pd.DataFrame, dim_committee: pd.DataFrame) -> list[dict]:
    entities = []
    for _, row in dim_candidate[dim_candidate["CandidateKey"].ne(UNKNOWN_CANDIDATE)].iterrows():
        entities.append(
            {
                "EntityKey": row["CandidateKey"],
                "EntityName": row["CandidateName"],
                "EntityType": "Candidate",
                "CandidateKey": row["CandidateKey"],
                "CommitteeKey": "",
                "RaceKey": row["RaceKey"],
                "FEC_ID": row["CandidateKey"],
                "StateKey": row["StateKey"],
                "PartyKey": row["PartyKey"],
                "Tokens": tokenize(row["CandidateName"]),
                "MatchText": match_text(row["CandidateName"]),
            }
        )
    for _, row in dim_committee[dim_committee["CommitteeKey"].ne(UNKNOWN_COMMITTEE)].iterrows():
        entities.append(
            {
                "EntityKey": row["CommitteeKey"],
                "EntityName": row["CommitteeName"],
                "EntityType": entity_type_from_committee(row),
                "CandidateKey": clean_text(row.get("CandidateKey"), ""),
                "CommitteeKey": row["CommitteeKey"],
                "RaceKey": "",
                "FEC_ID": row["CommitteeKey"],
                "StateKey": "",
                "PartyKey": "",
                "Tokens": tokenize(row["CommitteeName"]),
                "MatchText": match_text(row["CommitteeName"]),
            }
        )
    return entities


def load_overrides() -> dict[str, dict]:
    if not MAPPING_OVERRIDES.exists():
        return {}
    raw = pd.read_excel(MAPPING_OVERRIDES, dtype=str).fillna("")
    overrides = {}
    for _, row in raw.iterrows():
        adv_key = clean_text(row.get("AdvertiserKey"), "")
        advertiser = clean_text(row.get("Advertiser"), "")
        approved = any(clean_text(row.get(col), "") for col in ["OverrideFEC_ID", "OverrideCandidateKey", "OverrideCommitteeKey", "OverrideMatchedName"])
        if not approved:
            continue
        key = adv_key or stable_key("ADV", advertiser)
        overrides[key] = row.to_dict()
    return overrides


def build_advertiser_bridge(dim_advertiser: pd.DataFrame, entities: list[dict]) -> pd.DataFrame:
    overrides = load_overrides()
    token_index: dict[str, list[int]] = defaultdict(list)
    for idx, entity in enumerate(entities):
        for token in entity["Tokens"]:
            token_index[token].append(idx)

    rows = []
    for _, advertiser in dim_advertiser.iterrows():
        advertiser_key = advertiser["AdvertiserKey"]
        advertiser_name = advertiser["Advertiser"]
        advertiser_clean = match_text(advertiser_name)
        advertiser_type = clean_text(advertiser.get("AdvertiserType"), "")
        if advertiser_key in overrides:
            override = overrides[advertiser_key]
            entity_type = clean_text(override.get("OverrideEntityType"), "Unknown")
            candidate_key = clean_text(override.get("OverrideCandidateKey"), "")
            committee_key = clean_text(override.get("OverrideCommitteeKey"), "")
            rows.append(
                {
                    "AdvertiserKey": advertiser_key,
                    "Advertiser": advertiser_name,
                    "AdvertiserClean": advertiser_clean,
                    "MatchedEntityKey": clean_text(override.get("OverrideFEC_ID"), candidate_key or committee_key or UNKNOWN_CANDIDATE),
                    "MatchedEntityName": clean_text(override.get("OverrideMatchedName"), "Unknown"),
                    "EntityType": entity_type,
                    "CandidateKey": candidate_key or UNKNOWN_CANDIDATE,
                    "CommitteeKey": committee_key or UNKNOWN_COMMITTEE,
                    "RaceKey": clean_text(override.get("OverrideRaceKey"), UNKNOWN_RACE),
                    "FEC_ID": clean_text(override.get("OverrideFEC_ID"), ""),
                    "FinalScore": 1.0,
                    "ConfidenceLevel": "Override",
                    "MatchSource": "Manual Override",
                    "OverrideFlag": True,
                    "ReviewStatus": "Approved Override",
                    "LastUpdated": REFRESH_DATE,
                }
            )
            continue

        adv_tokens = tokenize(advertiser_name)
        candidate_idxs = set()
        for token in adv_tokens:
            candidate_idxs.update(token_index.get(token, []))
        best = None
        best_score = 0.0
        for idx in candidate_idxs:
            entity = entities[idx]
            if not entity["MatchText"]:
                continue
            ratio = SequenceMatcher(None, advertiser_clean, entity["MatchText"]).ratio()
            token_overlap = len(adv_tokens & entity["Tokens"]) / max(1, len(adv_tokens | entity["Tokens"]))
            score = max(ratio, token_overlap)
            if entity["EntityType"] == "Candidate" and "candidate" in advertiser_type.lower():
                score += 0.08
            if entity["EntityType"] in {"PAC", "Committee", "Party"} and any(x in advertiser_type.lower() for x in ["pac", "party", "issue", "committee"]):
                score += 0.08
            score = min(score, 0.99)
            if score > best_score:
                best = entity
                best_score = score

        if best is None or best_score < 0.62:
            row = {
                "MatchedEntityKey": "Unknown",
                "MatchedEntityName": "Unknown",
                "EntityType": advertiser_type if advertiser_type not in {"", "Unknown"} else "Unknown",
                "CandidateKey": UNKNOWN_CANDIDATE,
                "CommitteeKey": UNKNOWN_COMMITTEE,
                "RaceKey": UNKNOWN_RACE,
                "FEC_ID": "",
                "FinalScore": 0.0,
                "ConfidenceLevel": "Unmatched",
                "MatchSource": "No confident fuzzy match",
                "OverrideFlag": False,
                "ReviewStatus": "Unmatched",
            }
        else:
            confidence = "High" if best_score >= 0.9 else "Medium" if best_score >= 0.78 else "Low"
            row = {
                "MatchedEntityKey": best["EntityKey"],
                "MatchedEntityName": best["EntityName"],
                "EntityType": best["EntityType"],
                "CandidateKey": best["CandidateKey"] or UNKNOWN_CANDIDATE,
                "CommitteeKey": best["CommitteeKey"] or UNKNOWN_COMMITTEE,
                "RaceKey": best["RaceKey"] or UNKNOWN_RACE,
                "FEC_ID": best["FEC_ID"],
                "FinalScore": round(best_score, 3),
                "ConfidenceLevel": confidence,
                "MatchSource": "Token-blocked fuzzy match",
                "OverrideFlag": False,
                "ReviewStatus": "Auto High" if confidence == "High" else "Needs Review",
            }
        rows.append(
            {
                "AdvertiserKey": advertiser_key,
                "Advertiser": advertiser_name,
                "AdvertiserClean": advertiser_clean,
                **row,
                "LastUpdated": REFRESH_DATE,
            }
        )
    return pd.DataFrame(rows)


def build_spend_activity() -> pd.DataFrame:
    if os.environ.get("LOAD_SPEND_ACTIVITY", "").strip().lower() not in {"1", "true", "yes"}:
        return pd.DataFrame(
            columns=[
                "SpendActivityKey",
                "Advertiser",
                "AdvertiserKey",
                "State",
                "StateKey",
                "DMA",
                "DMAKey",
                "MediaType",
                "MediaTypeKey",
                "WeekOfSpendDate",
                "GrossSpending",
            ]
        )
    path = SPEND_ACTIVITY_DIR / "Cross tab_data_1.xlsx"
    if not path.exists():
        return pd.DataFrame()
    raw = pd.read_excel(path)
    out = pd.DataFrame()
    out["Advertiser"] = raw["Advertiser"].map(lambda value: clean_text(value, "Unknown"))
    out["AdvertiserKey"] = out["Advertiser"].map(lambda value: stable_key("ADV", value))
    out["State"] = raw["Election State"].map(lambda value: clean_text(value, "Unknown"))
    out["StateKey"] = out["State"].map(lambda value: stable_key("STA", value))
    out["DMA"] = raw["DMA"].map(lambda value: clean_text(value, "Unknown"))
    out["DMAKey"] = out["DMA"].map(lambda value: stable_key("DMA", value))
    out["MediaType"] = raw["ATV_MEDIA_TYPE"].map(lambda value: clean_text(value, "Unknown"))
    out["MediaTypeKey"] = out["MediaType"].map(lambda value: stable_key("MED", value))
    out["WeekOfSpendDate"] = raw["Week of Spend Date"].map(to_date)
    out["GrossSpending"] = raw["Gross Spending/Share"].map(to_number)
    out["SpendActivityKey"] = out.apply(
        lambda row: source_key(row["AdvertiserKey"], row["StateKey"], row["DMAKey"], row["MediaTypeKey"], row["WeekOfSpendDate"]),
        axis=1,
    )
    return out[out["GrossSpending"].notna()].copy()


def build_bridge_race_dma() -> pd.DataFrame:
    columns = [
        "RaceKey",
        "StateKey",
        "DMAKey",
        "Market",
        "DistrictHouseholdsInDMA",
        "DMAHouseholds",
        "CoverageNotes",
    ]
    if not DMA_RACE_COVERAGE.exists():
        return pd.DataFrame(columns=columns)
    raw = pd.read_excel(DMA_RACE_COVERAGE, dtype=str).fillna("")
    for col in columns:
        if col not in raw:
            raw[col] = ""
    out = raw[columns].copy()
    out["DistrictHouseholdsInDMA"] = out["DistrictHouseholdsInDMA"].map(to_number)
    out["DMAHouseholds"] = out["DMAHouseholds"].map(to_number)
    return out


def build_case_study_notes() -> pd.DataFrame:
    columns = [
        "RaceKey",
        "AdvertiserKey",
        "Status",
        "Owner",
        "Narrative",
        "ApprovedForSales",
        "DeckLink",
        "LastUpdated",
    ]
    if not CASE_STUDY_NOTES.exists():
        return pd.DataFrame(columns=columns)
    raw = pd.read_excel(CASE_STUDY_NOTES, dtype=str).fillna("")
    for col in columns:
        if col not in raw:
            raw[col] = ""
    return raw[columns].copy()


def build_fact_election_results() -> pd.DataFrame:
    columns = [
        "ElectionResultKey",
        "RaceKey",
        "CandidateKey",
        "ElectionDate",
        "ElectionType",
        "Votes",
        "VoteShare",
        "WinnerFlag",
        "ResultStatus",
        "CertifiedFlag",
        "Source",
    ]
    # CivicAPI provides election/contest/candidate information, but not certified
    # official results. Keep this table empty and schema-stable until a results
    # source file or API is added.
    candidate_file = CIVIC_API_DIR / "fact_election_results.csv"
    if candidate_file.exists():
        raw = pd.read_csv(candidate_file, dtype=str, keep_default_na=False)
        for col in columns:
            if col not in raw:
                raw[col] = ""
        raw["Votes"] = raw["Votes"].map(to_number)
        raw["VoteShare"] = raw["VoteShare"].map(to_number)
        return raw[columns].copy()
    return pd.DataFrame(columns=columns)


def build_source_tables(api_refresh_log: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    manifest = safe_read_csv(DATA_SOURCE_MANIFEST)
    if manifest.empty:
        manifest = pd.DataFrame(columns=["SourceName", "SourceType", "System", "Enabled", "RawLocation", "CuratedOutputs", "RefreshMode", "ApiKeyEnvVar", "Notes"])
    for col in ["SourceName", "SourceType", "System", "Enabled", "RawLocation", "CuratedOutputs", "RefreshMode", "ApiKeyEnvVar", "Notes"]:
        if col not in manifest:
            manifest[col] = ""
    source = manifest.copy()
    source["DataSourceKey"] = source["SourceName"].map(lambda value: stable_key("SRC", value))
    source["Enabled"] = source["Enabled"].map(lambda value: str(value).strip().lower() in {"true", "1", "yes", "y"})

    refresh_log = api_refresh_log.copy() if not api_refresh_log.empty else pd.DataFrame()
    required_log = ["SourceName", "SourceType", "RefreshDate", "Status", "RowsFetched", "StartedAtUtc", "FinishedAtUtc", "OutputFile", "Message"]
    for col in required_log:
        if col not in refresh_log:
            refresh_log[col] = ""
    refresh_log["RefreshLogKey"] = refresh_log.apply(
        lambda row: source_key(row.get("SourceName"), row.get("RefreshDate"), row.get("OutputFile"), row.get("Status")),
        axis=1,
    )

    latest = (
        refresh_log.sort_values(["SourceName", "FinishedAtUtc"]).drop_duplicates("SourceName", keep="last")
        if not refresh_log.empty
        else pd.DataFrame(columns=required_log)
    )
    latest_by_type = (
        refresh_log.sort_values(["SourceType", "FinishedAtUtc"]).drop_duplicates("SourceType", keep="last")
        if not refresh_log.empty
        else pd.DataFrame(columns=required_log)
    )
    health = source.merge(latest[["SourceName", "Status", "RowsFetched", "Message"]], on="SourceName", how="left")
    if not latest_by_type.empty:
        type_status = latest_by_type[["SourceType", "Status", "RowsFetched", "Message"]].rename(
            columns={"Status": "TypeStatus", "RowsFetched": "TypeRowsFetched", "Message": "TypeMessage"}
        )
        health = health.merge(type_status, on="SourceType", how="left")
        health["Status"] = health["Status"].fillna(health["TypeStatus"])
        health["RowsFetched"] = health["RowsFetched"].fillna(health["TypeRowsFetched"])
        health["Message"] = health["Message"].fillna(health["TypeMessage"])
    health["RawLocationExists"] = health["RawLocation"].map(lambda value: Path(str(value)).exists() if clean_text(value, "") else False)
    health["LastRefreshStatus"] = health["Status"].fillna("Not refreshed this run")
    health["LastRefreshMessage"] = health["Message"].fillna("")
    health["RowsFetched"] = pd.to_numeric(health["RowsFetched"], errors="coerce").astype("Int64")
    health["SourceHealthStatus"] = health.apply(
        lambda row: "OK"
        if row["RawLocationExists"] and row["LastRefreshStatus"] not in {"Error"}
        else "Check",
        axis=1,
    )
    health = health[
        [
            "DataSourceKey",
            "SourceName",
            "SourceType",
            "Enabled",
            "RawLocation",
            "RawLocationExists",
            "LastRefreshStatus",
            "RowsFetched",
            "SourceHealthStatus",
            "LastRefreshMessage",
        ]
    ]
    source_cols = ["DataSourceKey", "SourceName", "SourceType", "System", "Enabled", "RawLocation", "CuratedOutputs", "RefreshMode", "ApiKeyEnvVar", "Notes"]
    return source[source_cols], refresh_log[["RefreshLogKey", *required_log]], health


def build_qa(
    stg: pd.DataFrame,
    fact_snapshot: pd.DataFrame,
    stats: pd.DataFrame,
    bridge: pd.DataFrame,
) -> dict[str, pd.DataFrame]:
    media = stg.pivot_table(index=["SnapshotDate", "SourceFile"], columns="MediaType", values="Amount", aggfunc="sum", fill_value=0).reset_index()
    reconciliation = stats.merge(media, on=["SnapshotDate", "SourceFile"], how="left")
    for media_type in ["Broadcast", "Cable", "CTV", "Digital", "Radio"]:
        reconciliation[f"{media_type}Spend"] = reconciliation.get(media_type, 0)
    reconciliation["AdvertiserCount"] = stg.groupby(["SnapshotDate", "SourceFile"])["Advertiser"].nunique().values
    reconciliation["DMACount"] = stg.groupby(["SnapshotDate", "SourceFile"])["DMA"].nunique().values
    for metric, expected in EXPECTED_SPEND_CHECKPOINTS.items():
        reconciliation[f"Expected{metric}"] = expected
        reconciliation[f"{metric}Delta"] = reconciliation.get(metric, reconciliation.get(metric.replace("Amount", ""), 0)) - expected
    reconciliation = reconciliation.drop(columns=[c for c in ["Broadcast", "Cable", "CTV", "Digital", "Radio", "RawColumns"] if c in reconciliation])

    dupes = (
        stg.groupby(["SnapshotDate", "RowBusinessKey"], as_index=False)
        .agg(SourceRows=("Amount", "size"), Amount=("Amount", "sum"))
        .query("SourceRows > 1")
        .sort_values("SourceRows", ascending=False)
    )

    review = bridge[bridge["ReviewStatus"].isin(["Needs Review", "Unmatched"])].copy()
    low_conf = bridge[bridge["ConfidenceLevel"].isin(["Low", "Medium"])].copy()
    unmatched = bridge[bridge["ReviewStatus"].eq("Unmatched")].copy()

    missing_checks = []
    for field in ["State", "DMA", "MediaType", "Advertiser", "Amount"]:
        if field in stg:
            if field == "Amount":
                missing = int(stg[field].isna().sum())
            else:
                missing = int(stg[field].isin(["", "Unknown"]).sum())
            missing_checks.append({"Field": field, "MissingOrUnknownRows": missing})

    return {
        "qa_snapshot_reconciliation": reconciliation,
        "duplicate_key_check": dupes,
        "advertiser_match_review": review,
        "low_confidence_matches": low_conf,
        "unmatched_advertisers": unmatched,
        "missing_field_checks": pd.DataFrame(missing_checks),
    }


def write_powerbi_assets(table_map: dict[str, str]) -> None:
    unc_base = str(BASE_DIR).replace("/Users/gerritmaxwell", r"\\Mac\Home").replace("/", "\\")
    type_maps = {
        "FactSpendSnapshot": {"SnapshotDate": "type date", "Cycle": "Int64.Type", "Amount": "Currency.Type", "GrossSpending": "Currency.Type", "SourceRowCount": "Int64.Type"},
        "FactSpendCurrent": {"SnapshotDate": "type date", "Cycle": "Int64.Type", "Amount": "Currency.Type", "GrossSpending": "Currency.Type", "SourceRowCount": "Int64.Type"},
        "FactOutsideSpend": {"SpendDate": "type date", "Amount": "Currency.Type"},
        "FactPoliticalWindows": {"WindowOpenDate": "type date", "ElectionDate": "type date", "DaysToWindowOpen": "Int64.Type", "DaysToElection": "Int64.Type"},
        "FactCandidateFinance": {"Coverage_Start_Date": "type date", "Coverage_End_Date": "type date"},
        "FactSpendWeeklyActivity": {"WeekOfSpendDate": "type date", "GrossSpending": "Currency.Type"},
        "FactElectionResults": {"ElectionDate": "type date", "Votes": "Int64.Type", "VoteShare": "type number", "WinnerFlag": "type logical", "CertifiedFlag": "type logical"},
        "FactRefreshLog": {"RefreshDate": "type date", "RowsFetched": "Int64.Type"},
        "QASourceHealth": {"Enabled": "type logical", "RawLocationExists": "type logical", "RowsFetched": "Int64.Type"},
        "BridgeRaceDMA": {"DistrictHouseholdsInDMA": "Int64.Type", "DMAHouseholds": "Int64.Type"},
        "DimSnapshot": {"SnapshotDate": "type date", "SnapshotWeek": "Int64.Type", "Cycle": "Int64.Type", "IsLatestSnapshot": "type logical"},
        "BridgeAdvertiserEntity": {"FinalScore": "type number", "OverrideFlag": "type logical", "LastUpdated": "type date"},
        "DimCaseStudyNotes": {"ApprovedForSales": "type logical", "LastUpdated": "type date"},
        "DimDataSource": {"Enabled": "type logical"},
        "DimCivicElection": {"ElectionDay": "type date", "LastUpdated": "type date"},
        "FactCivicContest": {"SourceOfficial": "type logical"},
        "DimCivicCandidate": {"OrderOnBallot": "Int64.Type"},
        "FactCivicPollingLocation": {"StartDate": "type date", "EndDate": "type date", "Latitude": "type number", "Longitude": "type number"},
        "QASnapshotReconciliation": {"SnapshotDate": "type date", "Cycle": "Int64.Type", "RowsLoaded": "Int64.Type", "RowsWithAmount": "Int64.Type", "RowsWithNonZeroAmount": "Int64.Type", "TotalAmount": "Currency.Type"},
        "QADuplicateKeyCheck": {"SnapshotDate": "type date", "SourceRows": "Int64.Type", "Amount": "Currency.Type"},
        "QAAdvertiserMatchReview": {"FinalScore": "type number", "OverrideFlag": "type logical", "LastUpdated": "type date"},
        "QALowConfidenceMatches": {"FinalScore": "type number", "OverrideFlag": "type logical", "LastUpdated": "type date"},
        "QAUnmatchedAdvertisers": {"FinalScore": "type number", "OverrideFlag": "type logical", "LastUpdated": "type date"},
        "QAMissingFieldChecks": {"MissingOrUnknownRows": "Int64.Type"},
    }
    blocks = [
        "// Paste each query into Power Query Advanced Editor.\n",
        "// If Parallels maps Mac folders differently, update pProjectFolder only.\n\n",
        "// Query: pProjectFolder\n",
        "let\n",
        f'    Source = "{unc_base}"\n',
        "in\n",
        "    Source\n\n",
    ]
    for table_name, file_name in table_map.items():
        types = type_maps.get(table_name, {})
        type_expr = "{" + ", ".join(f'{{"{col}", {typ}}}' for col, typ in types.items()) + "}" if types else "{}"
        blocks.append(
            f"""// Query: {table_name}
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\\data\\curated\\{file_name}"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {type_expr}, "en-US")
in
    Typed

"""
        )
    (POWERBI_DIR / "PowerQuery_CuratedCsvLoaders.pq").write_text("".join(blocks), encoding="utf-8")

    measures = """-- Create a dedicated _Measures table, then add these measures.

Total Spend =
SUM ( FactSpendCurrent[Amount] )

Broadcast Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[MediaType] = "Broadcast" ) )

Cable Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[MediaType] = "Cable" ) )

CTV Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[MediaType] = "CTV" ) )

Digital Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[MediaType] = "Digital" ) )

Radio Spend =
CALCULATE ( [Total Spend], KEEPFILTERS ( DimMediaType[MediaType] = "Radio" ) )

TV Spend =
[Broadcast Spend] + [Cable Spend] + [CTV Spend]

Broadcast + CTV Spend =
[Broadcast Spend] + [CTV Spend]

Cable Share % =
DIVIDE ( [Cable Spend], [TV Spend] )

Broadcast + CTV Share % =
DIVIDE ( [Broadcast + CTV Spend], [TV Spend] )

Selected TV Spend Floor =
SELECTEDVALUE ( 'TV Spend Floor Slider'[Value], 11000 )

Selected Cable Share Target =
SELECTEDVALUE ( 'Cable Share Target Slider'[Value], 0.15 )

Target Cable Spend =
[TV Spend] * [Selected Cable Share Target]

Cable Opportunity $ =
MAX ( 0, [Target Cable Spend] - [Cable Spend] )

No Cable Flag =
IF ( [Broadcast + CTV Spend] > 0 && [Cable Spend] = 0, 1, 0 )

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
    [Broadcast + CTV Spend] = 0, "No TV Spend",
    [Cable Spend] = 0, "Zero Cable",
    [Cable Share %] <= [Selected Cable Share Target], "Low Cable",
    "Cable In Mix"
)

Cumulative Spend as of Snapshot =
SUM ( FactSpendSnapshot[Amount] )

Prior Snapshot Spend =
VAR CurrentSnapshot = MAX ( DimSnapshot[SnapshotDate] )
VAR PreviousSnapshot =
    CALCULATE (
        MAX ( DimSnapshot[SnapshotDate] ),
        FILTER ( ALL ( DimSnapshot[SnapshotDate] ), DimSnapshot[SnapshotDate] < CurrentSnapshot )
    )
RETURN
    CALCULATE (
        [Cumulative Spend as of Snapshot],
        REMOVEFILTERS ( DimSnapshot ),
        DimSnapshot[SnapshotDate] = PreviousSnapshot
    )

Weekly Added Spend =
[Cumulative Spend as of Snapshot] - [Prior Snapshot Spend]

Weekly Added Spend % =
DIVIDE ( [Weekly Added Spend], [Prior Snapshot Spend] )

Outside Spend =
SUM ( FactOutsideSpend[Amount] )

Outside Support Spend =
CALCULATE ( [Outside Spend], FactOutsideSpend[SupportOppose] = "Support" )

Outside Oppose Spend =
CALCULATE ( [Outside Spend], FactOutsideSpend[SupportOppose] = "Oppose" )

Net Outside Support =
[Outside Support Spend] - [Outside Oppose Spend]

District Share of DMA =
DIVIDE ( SUM ( BridgeRaceDMA[DistrictHouseholdsInDMA] ), SUM ( BridgeRaceDMA[DMAHouseholds] ) )

Estimated Broadcast Waste % =
MAX ( 0, 1 - [District Share of DMA] )

Estimated Wasted Broadcast $ =
[Broadcast Spend] * [Estimated Broadcast Waste %]

Latest Snapshot Date =
MAX ( DimSnapshot[SnapshotDate] )

Spend Snapshot Rows =
COUNTROWS ( FactSpendSnapshot )

Current Spend Rows =
COUNTROWS ( FactSpendCurrent )

Rows Loaded =
SUM ( QASnapshotReconciliation[RowsLoaded] )

Duplicate Key Count =
COUNTROWS ( QADuplicateKeyCheck )

Missing / Unknown Field Rows =
SUM ( QAMissingFieldChecks[MissingOrUnknownRows] )

Outside Spend Rows =
COUNTROWS ( FactOutsideSpend )

Political Windows Loaded =
COUNTROWS ( FactPoliticalWindows )

Civic Elections Loaded =
COUNTROWS ( DimCivicElection )

Civic Contests Loaded =
COUNTROWS ( FactCivicContest )

OpenFEC API Rows Fetched =
CALCULATE ( SUM ( FactRefreshLog[RowsFetched] ), FactRefreshLog[SourceType] = "OpenFEC API" )

Civic API Rows Fetched =
CALCULATE ( SUM ( FactRefreshLog[RowsFetched] ), FactRefreshLog[SourceType] = "Civic API" )

Unmatched Advertiser Count =
CALCULATE (
    DISTINCTCOUNT ( DimAdvertiser[AdvertiserKey] ),
    BridgeAdvertiserEntity[ReviewStatus] = "Unmatched"
)

Low Confidence Match Count =
CALCULATE (
    COUNTROWS ( BridgeAdvertiserEntity ),
    BridgeAdvertiserEntity[ConfidenceLevel] IN { "Low", "Medium" }
)

Votes =
SUM ( FactElectionResults[Votes] )

Cost Per Vote =
DIVIDE ( [Total Spend], [Votes] )

Completed Races =
CALCULATE ( DISTINCTCOUNT ( FactElectionResults[RaceKey] ), FactElectionResults[ResultStatus] = "Completed" )

Case Study Score =
VAR spendScale = LOG10 ( [Broadcast + CTV Spend] + 1 )
VAR lowCableFactor =
    MAX ( 0, 1 - DIVIDE ( COALESCE ( [Cable Share %], 0 ), [Selected Cable Share Target] ) )
VAR houseBonus = IF ( SELECTEDVALUE ( DimRaceLevel[RaceLevel] ) = "House", 1.25, 1 )
RETURN
    spendScale * lowCableFactor * houseBonus
"""
    (POWERBI_DIR / "Measures.dax").write_text(measures, encoding="utf-8")

    calculated = """_Measures =
DATATABLE ( "Measure Table", STRING, { { "_Measures" } } )

TV Spend Floor Slider =
GENERATESERIES ( 0, 250000, 1000 )

Cable Share Target Slider =
GENERATESERIES ( 0, 0.5, 0.01 )

Trend Breakdown =
{
    ( "Advertiser", NAMEOF ( DimAdvertiser[Advertiser] ), 0 ),
    ( "Candidate", NAMEOF ( DimCandidate[CandidateName] ), 1 ),
    ( "Office", NAMEOF ( DimOffice[Office] ), 2 ),
    ( "State", NAMEOF ( DimState[State] ), 3 ),
    ( "DMA", NAMEOF ( DimDMA[DMA] ), 4 ),
    ( "Race Level", NAMEOF ( DimRaceLevel[RaceLevel] ), 5 ),
    ( "Party", NAMEOF ( DimParty[Party] ), 6 ),
    ( "Media Type", NAMEOF ( DimMediaType[MediaType] ), 7 ),
    ( "Agency", NAMEOF ( DimAgency[Agency] ), 8 )
}
"""
    (POWERBI_DIR / "CalculatedTables.dax").write_text(calculated, encoding="utf-8")

    relationships = """Create single-direction one-to-many relationships:

DimAdvertiser[AdvertiserKey] -> FactSpendCurrent[AdvertiserKey]
DimAdvertiser[AdvertiserKey] -> FactSpendSnapshot[AdvertiserKey]
DimAgency[AgencyKey] -> FactSpendCurrent[AgencyKey]
DimAgency[AgencyKey] -> FactSpendSnapshot[AgencyKey]
DimMediaType[MediaTypeKey] -> FactSpendCurrent[MediaTypeKey]
DimMediaType[MediaTypeKey] -> FactSpendSnapshot[MediaTypeKey]
DimState[StateKey] -> FactSpendCurrent[StateKey]
DimState[StateKey] -> FactSpendSnapshot[StateKey]
DimDMA[DMAKey] -> FactSpendCurrent[DMAKey]
DimDMA[DMAKey] -> FactSpendSnapshot[DMAKey]
DimOffice[OfficeKey] -> FactSpendCurrent[OfficeKey]
DimOffice[OfficeKey] -> FactSpendSnapshot[OfficeKey]
DimRaceLevel[RaceLevelKey] -> FactSpendCurrent[RaceLevelKey]
DimRaceLevel[RaceLevelKey] -> FactSpendSnapshot[RaceLevelKey]
DimParty[PartyKey] -> FactSpendCurrent[PartyKey]
DimParty[PartyKey] -> FactSpendSnapshot[PartyKey]
DimStation[StationKey] -> FactSpendCurrent[StationKey]
DimStation[StationKey] -> FactSpendSnapshot[StationKey]
DimNetwork[NetworkKey] -> FactSpendCurrent[NetworkKey]
DimNetwork[NetworkKey] -> FactSpendSnapshot[NetworkKey]
DimSnapshot[SnapshotDate] -> FactSpendSnapshot[SnapshotDate]

DimAdvertiser[AdvertiserKey] -> BridgeAdvertiserEntity[AdvertiserKey]
DimCandidate[CandidateKey] -> BridgeAdvertiserEntity[CandidateKey]
DimCommittee[CommitteeKey] -> BridgeAdvertiserEntity[CommitteeKey]
DimRace[RaceKey] -> BridgeAdvertiserEntity[RaceKey]

DimCommittee[CommitteeKey] -> FactOutsideSpend[CommitteeKey]
DimCandidate[CandidateKey] -> FactOutsideSpend[CandidateKey]
DimRace[RaceKey] -> FactOutsideSpend[RaceKey]
DimState[StateKey] -> FactOutsideSpend[StateKey]

DimState[StateKey] -> FactPoliticalWindows[StateKey]
DimDMA[DMAKey] -> FactPoliticalWindows[DMAKey]

DimCandidate[CandidateKey] -> FactCandidateFinance[CandidateKey]
DimRace[RaceKey] -> BridgeRaceDMA[RaceKey]
DimState[StateKey] -> BridgeRaceDMA[StateKey]
DimDMA[DMAKey] -> BridgeRaceDMA[DMAKey]

DimRace[RaceKey] -> FactElectionResults[RaceKey]
DimCandidate[CandidateKey] -> FactElectionResults[CandidateKey]

DimCivicElection[CivicElectionKey] -> FactCivicContest[CivicElectionKey]
DimCivicElection[CivicElectionKey] -> DimCivicCandidate[CivicElectionKey]
DimCivicElection[CivicElectionKey] -> FactCivicPollingLocation[CivicElectionKey]
FactCivicContest[CivicContestKey] -> DimCivicCandidate[CivicContestKey]

DimDataSource[SourceName] -> FactRefreshLog[SourceName]
"""
    (POWERBI_DIR / "Relationships.txt").write_text(relationships, encoding="utf-8")


def dataframe_to_markdown(df: pd.DataFrame) -> str:
    if df.empty:
        return "_No rows._"
    clean = df.copy().fillna("")
    columns = list(clean.columns)
    lines = [
        "| " + " | ".join(columns) + " |",
        "| " + " | ".join(["---"] * len(columns)) + " |",
    ]
    for _, row in clean.iterrows():
        values = [str(row[col]).replace("|", "\\|") for col in columns]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def write_documentation(row_counts: dict[str, int], qa_summary: pd.DataFrame) -> None:
    readme = f"""# Political Spend Dashboard ETL

This project implements the Python-first weekly pipeline for `Political Spend Dashboard-2.pbix`.
Power BI should connect to the curated CSV layer only. Weekly spend files,
FEC bulk/API data, Google Civic Information API data, political windows, and
manual review files are all normalized here before they reach the semantic model.

## Run

From the workspace root:

```bash
'/Users/gerritmaxwell/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' 'Political Spend Dashboard/etl/build_final_weekly_model.py'
```

## Optional API Refresh

The pipeline is file-first by default so refreshes are deterministic. To pull
current API supplements before rebuilding the curated model, set:

```bash
REFRESH_FEC_API=1 FEC_API_KEY='your-openfec-key'
REFRESH_CIVIC_API=1 GOOGLE_CIVIC_API_KEY='your-google-civic-key'
```

`CivicAPI_AddressTargets.csv` controls which address/election lookups are sent
to CivicAPI. CivicAPI supplies elections, contests, candidates, and polling
location context; it does not provide certified election results, so
`fact_election_results.csv` remains schema-only until a results source is added.

## Outputs

- Curated Power BI tables: `data/curated/`
- QA outputs: `data/qa/`
- Control workbooks: `data/control/`
- Power BI scripts: `powerbi/`
- Source health: `dim_data_source.csv`, `fact_refresh_log.csv`, `qa_source_health.csv`

## Current Source Reconciliation

The new `Home_Advertiser_data (5).xlsx` source differs slightly from the older 5/11 checkpoint in row count and by $14 in total spend. The QA file keeps the actual totals and the expected checkpoint deltas visible.

{dataframe_to_markdown(qa_summary)}

## Row Counts

{chr(10).join(f'- `{name}`: {count:,}' for name, count in sorted(row_counts.items()))}
"""
    (BASE_DIR / "README.md").write_text(readme, encoding="utf-8")

    page_spec = """# Power BI Report Build Spec

Use 16:9 canvas, 1600 x 900. Move global slicers into a bookmark-driven filter drawer.

## 1. Executive Overview
KPI cards: Latest Snapshot Date, Total Spend, Broadcast + CTV Spend, Cable Spend, Cable Share %, Cable Opportunity $, Zero-Cable Advertisers, Prospects In Political Window.
Visuals: 100% stacked media bar, Top 10 Cable Opportunity table, State/DMA/Office matrix, Cable Share by Race Level.

## 2. Cable Prospect Finder
Scatter: X `[Broadcast + CTV Spend]`, Y `[Cable Share %]`, Size `[Total Spend]`, Legend `DimRaceLevel[RaceLevel]`, Details `DimAdvertiser[Advertiser]`.
Filter to `[Cable Prospect Flag] = 1`. Add TV spend floor and cable share target slicers.

## 3. Spend Trend
Line chart: X `DimSnapshot[SnapshotDate]`, Y `[Cumulative Spend as of Snapshot]`, Legend `Trend Breakdown`.
Column chart: X `DimSnapshot[SnapshotDate]`, Y `[Weekly Added Spend]`, Legend `Trend Breakdown`.

## 4. Advertiser / Candidate Detail
Make this a drillthrough page on Advertiser, Candidate, and Race. Include media mix, snapshot line, station/network table, outside spend table, and mapping block.

## 5. Race Explorer
Matrix by Race, Candidate, Party, State, District, Office, Advertiser, Total Spend, Broadcast, Cable, Cable Share, Cable Opportunity, Outside Support, Outside Oppose.

## 6. Election Calendar + Political Windows
Gantt-style visual from WindowOpenDate to ElectionDate by Market, colored by WindowStatus. Add Act Now table filtered to In Window or Opening Next 30.

## 7. PAC / FEC Spend Breakdown
Stacked bar by Committee split Support/Oppose, outside spend trend by SpendDate, race matrix, purpose/payee detail table.

## 8. Completed Elections + Cost Per Vote
Scaffold now. Do not fake election results. Use FactElectionResults when official certified results are loaded. CivicAPI can supply contest context, but not official final vote totals.

## 9. Case Study Finder
Use `[Case Study Score]` to sort likely proof points. Load `CaseStudyNotes.xlsx` for narrative status, owner, approved-for-sales, and deck link.

## 10. Data Health + Mapping Review
Cards: Latest Snapshot Date, Rows Loaded, Total Spend, Unmatched Advertisers, Low Confidence Matches, Duplicate Key Count, Political Windows Loaded, Outside Spend Rows.
Tables: snapshot reconciliation, advertiser match review, unmatched advertiser spend, missing field checks, source health, API refresh log.
"""
    (POWERBI_DIR / "ReportPageBuildSpec.md").write_text(page_spec, encoding="utf-8")


def main() -> None:
    ensure_directories()
    print("Copying source files and creating control templates...", flush=True)
    copy_source_files()
    create_control_files()

    print("Refreshing optional API sources when enabled...", flush=True)
    api_logs = concat_frames([refresh_fec_api_sources(), refresh_civic_api_sources()])
    civic_tables = read_civic_tables()

    print("Building spend snapshot facts and dimensions...", flush=True)
    stg_spend, fact_snapshot, fact_current, dim_snapshot, spend_stats = build_spend_tables()
    fact_political_windows = build_political_windows()
    fact_snapshot, market_exclusions_snapshot = apply_political_window_market_scope(fact_snapshot, fact_political_windows)
    fact_current, market_exclusions_current = apply_political_window_market_scope(fact_current, fact_political_windows)
    dims = build_spend_dimensions(fact_snapshot, dim_snapshot, fact_political_windows)
    print(
        f"Spend rows with amount: {len(stg_spend):,}; calendar-scoped fact rows: {len(fact_snapshot):,}",
        flush=True,
    )

    print("Building candidate, committee, outside-spend, race, and window tables...", flush=True)
    dim_candidate, fact_candidate_finance, candidate_races = build_candidate_tables()
    dim_committee = build_committee_table()
    fact_outside_spend = build_outside_spend()
    dim_race = build_race_table(candidate_races, fact_outside_spend)
    fact_spend_weekly_activity = build_spend_activity()
    bridge_race_dma = build_bridge_race_dma()
    dim_case_study_notes = build_case_study_notes()
    fact_election_results = build_fact_election_results()
    dim_data_source, fact_refresh_log, qa_source_health = build_source_tables(api_logs)

    print("Building advertiser-to-entity bridge...", flush=True)
    entities = build_entities(dim_candidate, dim_committee)
    bridge = build_advertiser_bridge(dims["dim_advertiser"], entities)
    bridge_fact_cols = ["AdvertiserKey", "CandidateKey", "CommitteeKey", "RaceKey", "MatchedEntityKey", "EntityType", "ConfidenceLevel", "ReviewStatus"]
    fact_snapshot = fact_snapshot.merge(bridge[bridge_fact_cols], on="AdvertiserKey", how="left")
    fact_current = fact_current.merge(bridge[bridge_fact_cols], on="AdvertiserKey", how="left")

    print("Building QA outputs and writing curated files...", flush=True)
    qa_outputs = build_qa(stg_spend, fact_snapshot, spend_stats, bridge)
    market_exclusions = pd.concat(
        [
            market_exclusions_snapshot.assign(FactTable="FactSpendSnapshot"),
            market_exclusions_current.assign(FactTable="FactSpendCurrent"),
        ],
        ignore_index=True,
        sort=False,
    )
    qa_outputs["market_scope_exclusions"] = market_exclusions

    curated_tables = {
        "fact_spend_snapshot": fact_snapshot,
        "fact_spend_current": fact_current,
        "dim_snapshot": dim_snapshot,
        "dim_advertiser": dims["dim_advertiser"],
        "dim_agency": dims["dim_agency"],
        "dim_media_type": dims["dim_media_type"],
        "dim_state": dims["dim_state"],
        "dim_dma": dims["dim_dma"],
        "dim_office": dims["dim_office"],
        "dim_party": dims["dim_party"],
        "dim_race_level": dims["dim_race_level"],
        "dim_station": dims["dim_station"],
        "dim_network": dims["dim_network"],
        "dim_candidate": dim_candidate,
        "dim_race": dim_race,
        "dim_committee": dim_committee,
        "bridge_advertiser_entity": bridge,
        "bridge_race_dma": bridge_race_dma,
        "fact_outside_spend": fact_outside_spend,
        "fact_political_windows": fact_political_windows,
        "fact_candidate_finance": fact_candidate_finance,
        "fact_spend_weekly_activity": fact_spend_weekly_activity,
        "fact_election_results": fact_election_results,
        "dim_case_study_notes": dim_case_study_notes,
        "dim_data_source": dim_data_source,
        "fact_refresh_log": fact_refresh_log,
        "qa_source_health": qa_source_health,
        "dim_civic_election": civic_tables["dim_civic_election"],
        "fact_civic_contest": civic_tables["fact_civic_contest"],
        "dim_civic_candidate": civic_tables["dim_civic_candidate"],
        "fact_civic_polling_location": civic_tables["fact_civic_polling_location"],
        "qa_snapshot_reconciliation": qa_outputs["qa_snapshot_reconciliation"],
        "qa_duplicate_key_check": qa_outputs["duplicate_key_check"],
        "qa_advertiser_match_review": qa_outputs["advertiser_match_review"],
        "qa_low_confidence_matches": qa_outputs["low_confidence_matches"],
        "qa_unmatched_advertisers": qa_outputs["unmatched_advertisers"],
        "qa_missing_field_checks": qa_outputs["missing_field_checks"],
        "qa_market_scope_exclusions": qa_outputs["market_scope_exclusions"],
    }

    row_counts = {}
    for name, df in curated_tables.items():
        write_csv(df, CURATED_DIR / f"{name}.csv")
        row_counts[name] = len(df)
    for name, df in qa_outputs.items():
        write_csv(df, QA_DIR / f"{name}.csv")
        row_counts[f"qa/{name}"] = len(df)

    table_map = {
        "FactSpendSnapshot": "fact_spend_snapshot.csv",
        "FactSpendCurrent": "fact_spend_current.csv",
        "FactOutsideSpend": "fact_outside_spend.csv",
        "FactPoliticalWindows": "fact_political_windows.csv",
        "FactCandidateFinance": "fact_candidate_finance.csv",
        "FactSpendWeeklyActivity": "fact_spend_weekly_activity.csv",
        "DimSnapshot": "dim_snapshot.csv",
        "DimAdvertiser": "dim_advertiser.csv",
        "DimAgency": "dim_agency.csv",
        "DimMediaType": "dim_media_type.csv",
        "DimState": "dim_state.csv",
        "DimDMA": "dim_dma.csv",
        "DimOffice": "dim_office.csv",
        "DimParty": "dim_party.csv",
        "DimRaceLevel": "dim_race_level.csv",
        "DimStation": "dim_station.csv",
        "DimNetwork": "dim_network.csv",
        "DimCandidate": "dim_candidate.csv",
        "DimRace": "dim_race.csv",
        "DimCommittee": "dim_committee.csv",
        "BridgeAdvertiserEntity": "bridge_advertiser_entity.csv",
        "BridgeRaceDMA": "bridge_race_dma.csv",
        "FactElectionResults": "fact_election_results.csv",
        "DimCaseStudyNotes": "dim_case_study_notes.csv",
        "DimDataSource": "dim_data_source.csv",
        "FactRefreshLog": "fact_refresh_log.csv",
        "QASourceHealth": "qa_source_health.csv",
        "DimCivicElection": "dim_civic_election.csv",
        "FactCivicContest": "fact_civic_contest.csv",
        "DimCivicCandidate": "dim_civic_candidate.csv",
        "FactCivicPollingLocation": "fact_civic_polling_location.csv",
        "QASnapshotReconciliation": "qa_snapshot_reconciliation.csv",
        "QADuplicateKeyCheck": "qa_duplicate_key_check.csv",
        "QAAdvertiserMatchReview": "qa_advertiser_match_review.csv",
        "QALowConfidenceMatches": "qa_low_confidence_matches.csv",
        "QAUnmatchedAdvertisers": "qa_unmatched_advertisers.csv",
        "QAMissingFieldChecks": "qa_missing_field_checks.csv",
        "QAMarketScopeExclusions": "qa_market_scope_exclusions.csv",
    }
    write_powerbi_assets(table_map)
    write_documentation(row_counts, qa_outputs["qa_snapshot_reconciliation"].head(5))

    print(f"ETL complete: {BASE_DIR}")
    print(f"FactSpendSnapshot rows: {len(fact_snapshot):,}")
    print(f"FactSpendCurrent rows: {len(fact_current):,}")
    print(f"Total spend: ${fact_current['Amount'].sum():,.2f}")
    print(f"Outside spend rows: {len(fact_outside_spend):,}")
    print(f"Committees: {len(dim_committee):,}")
    print(f"Advertiser matches needing review: {len(qa_outputs['advertiser_match_review']):,}")


if __name__ == "__main__":
    main()
