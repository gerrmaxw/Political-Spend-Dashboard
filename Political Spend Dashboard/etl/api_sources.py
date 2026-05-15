from __future__ import annotations

import csv
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from config import (
    API_TIMEOUT_SECONDS,
    CIVIC_ADDRESS_TARGETS,
    CIVIC_API_DIR,
    CIVIC_API_KEY_ENV,
    CIVIC_BASE_URL,
    CYCLE,
    FEC_API_DIR,
    FEC_API_KEY_ENV,
    OPENFEC_BASE_URL,
    REFRESH_CIVIC_API_ENV,
    REFRESH_DATE,
    REFRESH_FEC_API_ENV,
)


def env_truthy(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "y", "on"}


def clean_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, float) and pd.isna(value):
        return default
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "n/a", "na"}:
        return default
    return " ".join(text.split())


def to_number(value: Any) -> float | None:
    text = clean_text(value, "")
    if not text:
        return None
    try:
        return float(text.replace("$", "").replace(",", ""))
    except ValueError:
        return None


def to_date(value: Any) -> str:
    text = clean_text(value, "")
    if not text:
        return ""
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return ""
    return parsed.date().isoformat()


def source_key(*parts: Any) -> str:
    raw = "|".join(clean_text(part, "") for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16].upper()


def get_first(record: dict[str, Any], *names: str, default: Any = "") -> Any:
    for name in names:
        if name in record and clean_text(record.get(name), "") != "":
            return record.get(name)
    return default


def write_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, quoting=csv.QUOTE_MINIMAL)


def write_jsonl(records: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, sort_keys=True, default=str) + "\n")


def empty_df(columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=columns)


def http_get_json(base_url: str, endpoint: str, params: dict[str, Any], timeout: int = API_TIMEOUT_SECONDS) -> dict[str, Any]:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in [None, ""]}, doseq=True)
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "political-spend-dashboard-etl/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def openfec_paginated(endpoint: str, params: dict[str, Any], api_key: str, max_pages: int | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page = 1
    per_page = int(params.pop("per_page", 100))
    while True:
        payload = http_get_json(
            OPENFEC_BASE_URL,
            endpoint,
            {**params, "api_key": api_key, "page": page, "per_page": per_page},
        )
        page_records = payload.get("results") or []
        records.extend(page_records)
        pagination = payload.get("pagination") or {}
        pages = int(pagination.get("pages") or page)
        if page >= pages or not page_records:
            break
        if max_pages is not None and page >= max_pages:
            break
        page += 1
        time.sleep(0.2)
    return records


def normalize_openfec_candidates(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "Cand_Id",
        "Cand_Name",
        "Cand_Office",
        "Cand_Office_St",
        "Cand_Office_Dist",
        "Cand_Party_Affiliation",
        "Cand_Incumbent_Challenger_Open_Seat",
        "Coverage_Start_Date",
        "Coverage_End_Date",
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
        "Link_Image",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        rows.append(
            {
                "Cand_Id": clean_text(get_first(record, "candidate_id", "candidate_id_full")),
                "Cand_Name": clean_text(get_first(record, "name", "candidate_name")),
                "Cand_Office": clean_text(get_first(record, "office")),
                "Cand_Office_St": clean_text(get_first(record, "state", "candidate_state")),
                "Cand_Office_Dist": clean_text(get_first(record, "district", "candidate_district")),
                "Cand_Party_Affiliation": clean_text(get_first(record, "party", "party_full")),
                "Cand_Incumbent_Challenger_Open_Seat": clean_text(get_first(record, "incumbent_challenge", "incumbent_challenge_full")),
                "Coverage_Start_Date": "",
                "Coverage_End_Date": "",
                "Total_Receipt": to_number(get_first(record, "receipts", "total_receipts")),
                "Total_Disbursement": to_number(get_first(record, "disbursements", "total_disbursements")),
                "Cash_On_Hand_COP": to_number(get_first(record, "cash_on_hand_end_period", "cash_on_hand")),
                "Debt_Owed_By_Committee": to_number(get_first(record, "debts_owed_by_committee")),
                "Individual_Contribution": to_number(get_first(record, "individual_contributions")),
                "Other_Committee_Contribution": to_number(get_first(record, "other_political_committee_contributions")),
                "Party_Committee_Contribution": to_number(get_first(record, "party_committee_contributions")),
                "Total_Contribution": to_number(get_first(record, "contributions")),
                "Operating_Expenditure": to_number(get_first(record, "operating_expenditures")),
                "Net_Contribution": None,
                "Net_Operating_Expenditure": None,
                "Link_Image": clean_text(get_first(record, "candidate_id", "candidate_id_full")),
                "SourceSystem": "OpenFEC API",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def normalize_openfec_committees(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "CMTE_ID",
        "CMTE_NM",
        "CMTE_TP",
        "CMTE_DSGN",
        "TRES_NM",
        "CAND_ID",
        "COH_COP",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        rows.append(
            {
                "CMTE_ID": clean_text(get_first(record, "committee_id")),
                "CMTE_NM": clean_text(get_first(record, "name", "committee_name")),
                "CMTE_TP": clean_text(get_first(record, "committee_type")),
                "CMTE_DSGN": clean_text(get_first(record, "designation")),
                "TRES_NM": clean_text(get_first(record, "treasurer_name")),
                "CAND_ID": clean_text(get_first(record, "candidate_ids", "candidate_id")),
                "COH_COP": to_number(get_first(record, "cash_on_hand_end_period", "cash_on_hand")),
                "SourceSystem": "OpenFEC API",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def normalize_openfec_independent_expenditures(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "spe_id",
        "spe_nam",
        "cand_id",
        "cand_name",
        "can_office",
        "can_office_state",
        "can_office_dis",
        "ele_type",
        "exp_date",
        "exp_amo",
        "sup_opp",
        "pur",
        "pay",
        "file_num",
        "tran_id",
        "image_num",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        rows.append(
            {
                "spe_id": clean_text(get_first(record, "committee_id", "spender_committee_id")),
                "spe_nam": clean_text(get_first(record, "committee_name", "spender_committee_name", "committee")),
                "cand_id": clean_text(get_first(record, "candidate_id")),
                "cand_name": clean_text(get_first(record, "candidate_name")),
                "can_office": clean_text(get_first(record, "candidate_office")),
                "can_office_state": clean_text(get_first(record, "candidate_state")),
                "can_office_dis": clean_text(get_first(record, "candidate_district")),
                "ele_type": clean_text(get_first(record, "election_type", "election_type_full")),
                "exp_date": to_date(get_first(record, "expenditure_date", "disbursement_date")),
                "exp_amo": to_number(get_first(record, "expenditure_amount", "disbursement_amount", "amount")),
                "sup_opp": clean_text(get_first(record, "support_oppose_indicator", "support_oppose")),
                "pur": clean_text(get_first(record, "purpose", "expenditure_purpose_full")),
                "pay": clean_text(get_first(record, "payee_name", "payee")),
                "file_num": clean_text(get_first(record, "file_number")),
                "tran_id": clean_text(get_first(record, "transaction_id")),
                "image_num": clean_text(get_first(record, "image_number")),
                "SourceSystem": "OpenFEC API",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def refresh_fec_api_sources() -> pd.DataFrame:
    FEC_API_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    refresh_enabled = env_truthy(REFRESH_FEC_API_ENV)
    api_key = os.environ.get(FEC_API_KEY_ENV, "").strip()
    endpoint_specs = [
        ("OpenFEC Candidates", "candidates/search/", {"election_year": CYCLE}, normalize_openfec_candidates, f"api_candidate_summary_{CYCLE}.csv"),
        ("OpenFEC Committees", "committees/", {"cycle": CYCLE}, normalize_openfec_committees, f"api_committee_summary_{CYCLE}.csv"),
        (
            "OpenFEC Independent Expenditures",
            "schedules/schedule_e/",
            {"two_year_transaction_period": CYCLE, "sort": "-expenditure_date"},
            normalize_openfec_independent_expenditures,
            f"api_independent_expenditure_{CYCLE}.csv",
        ),
    ]

    if not refresh_enabled:
        return pd.DataFrame(
            [
                {
                    "SourceName": spec[0],
                    "SourceType": "OpenFEC API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Skipped",
                    "RowsFetched": 0,
                    "Message": f"Set {REFRESH_FEC_API_ENV}=1 and {FEC_API_KEY_ENV} to refresh.",
                }
                for spec in endpoint_specs
            ]
        )
    if not api_key:
        return pd.DataFrame(
            [
                {
                    "SourceName": spec[0],
                    "SourceType": "OpenFEC API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Skipped",
                    "RowsFetched": 0,
                    "Message": f"{FEC_API_KEY_ENV} is not set.",
                }
                for spec in endpoint_specs
            ]
        )

    for source_name, endpoint, params, normalizer, output_name in endpoint_specs:
        started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        try:
            records = openfec_paginated(endpoint, dict(params), api_key)
            write_jsonl(records, FEC_API_DIR / f"{output_name}.jsonl")
            normalized = normalizer(records)
            write_csv(normalized, FEC_API_DIR / output_name)
            rows.append(
                {
                    "SourceName": source_name,
                    "SourceType": "OpenFEC API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Loaded",
                    "RowsFetched": len(records),
                    "StartedAtUtc": started,
                    "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "OutputFile": output_name,
                    "Message": "",
                }
            )
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            rows.append(
                {
                    "SourceName": source_name,
                    "SourceType": "OpenFEC API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Error",
                    "RowsFetched": 0,
                    "StartedAtUtc": started,
                    "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "OutputFile": output_name,
                    "Message": str(exc),
                }
            )
    return pd.DataFrame(rows)


def ensure_civic_address_targets() -> None:
    if CIVIC_ADDRESS_TARGETS.exists():
        return
    columns = ["AddressTargetKey", "StateKey", "DMA", "Market", "Address", "ElectionId", "IncludeFlag", "Notes"]
    write_csv(pd.DataFrame(columns=columns), CIVIC_ADDRESS_TARGETS)


def normalize_civic_elections(payload: dict[str, Any]) -> pd.DataFrame:
    rows = []
    for election in payload.get("elections") or []:
        rows.append(
            {
                "CivicElectionKey": clean_text(election.get("id")),
                "ElectionId": clean_text(election.get("id")),
                "ElectionName": clean_text(election.get("name")),
                "ElectionDay": to_date(election.get("electionDay")),
                "SourceSystem": "Google Civic Information API",
                "LastUpdated": REFRESH_DATE,
            }
        )
    return pd.DataFrame(rows, columns=["CivicElectionKey", "ElectionId", "ElectionName", "ElectionDay", "SourceSystem", "LastUpdated"])


def normalize_voterinfo_response(target: dict[str, Any], payload: dict[str, Any]) -> dict[str, pd.DataFrame]:
    contests = []
    candidates = []
    polling = []
    election = payload.get("election") or {}
    election_id = clean_text(election.get("id"), clean_text(target.get("ElectionId"), ""))
    address_key = clean_text(target.get("AddressTargetKey"), "") or source_key(target.get("Address"), target.get("ElectionId"))
    for contest_idx, contest in enumerate(payload.get("contests") or []):
        contest_key = source_key(election_id, address_key, contest_idx, contest.get("office"), contest.get("district", {}).get("name"))
        district = contest.get("district") or {}
        contests.append(
            {
                "CivicContestKey": contest_key,
                "CivicElectionKey": election_id,
                "ElectionId": election_id,
                "AddressTargetKey": address_key,
                "StateKey": clean_text(target.get("StateKey"), ""),
                "DMA": clean_text(target.get("DMA"), ""),
                "Market": clean_text(target.get("Market"), ""),
                "Office": clean_text(contest.get("office")),
                "ContestType": clean_text(contest.get("type")),
                "DistrictName": clean_text(district.get("name")),
                "OcdDivisionId": clean_text(district.get("id")),
                "NumberElected": clean_text(contest.get("numberElected")),
                "NumberVotingFor": clean_text(contest.get("numberVotingFor")),
                "BallotPlacement": clean_text(contest.get("ballotPlacement")),
                "SourceOfficial": any(bool(source.get("official")) for source in contest.get("sources") or []),
            }
        )
        for candidate_idx, candidate in enumerate(contest.get("candidates") or []):
            channels = candidate.get("channels") or []
            candidates.append(
                {
                    "CivicCandidateKey": source_key(contest_key, candidate_idx, candidate.get("name")),
                    "CivicContestKey": contest_key,
                    "CivicElectionKey": election_id,
                    "ElectionId": election_id,
                    "CandidateName": clean_text(candidate.get("name")),
                    "Party": clean_text(candidate.get("party")),
                    "CandidateUrl": clean_text(candidate.get("candidateUrl")),
                    "Phone": clean_text(candidate.get("phone")),
                    "Email": clean_text(candidate.get("email")),
                    "OrderOnBallot": candidate_idx + 1,
                    "Channels": "; ".join(
                        f"{clean_text(channel.get('type'))}: {clean_text(channel.get('id'))}"
                        for channel in channels
                        if clean_text(channel.get("id"), "")
                    ),
                }
            )
    for location_idx, location in enumerate(payload.get("pollingLocations") or []):
        address = location.get("address") or {}
        polling.append(
            {
                "CivicPollingLocationKey": source_key(election_id, address_key, location_idx, address.get("line1")),
                "CivicElectionKey": election_id,
                "ElectionId": election_id,
                "AddressTargetKey": address_key,
                "LocationName": clean_text(address.get("locationName")),
                "Line1": clean_text(address.get("line1")),
                "City": clean_text(address.get("city")),
                "StateKey": clean_text(address.get("state"), clean_text(target.get("StateKey"), "")),
                "Zip": clean_text(address.get("zip")),
                "PollingHours": clean_text(location.get("pollingHours")),
                "StartDate": to_date(location.get("startDate")),
                "EndDate": to_date(location.get("endDate")),
                "Latitude": to_number(location.get("latitude")),
                "Longitude": to_number(location.get("longitude")),
            }
        )
    return {
        "fact_civic_contest": pd.DataFrame(contests),
        "dim_civic_candidate": pd.DataFrame(candidates),
        "fact_civic_polling_location": pd.DataFrame(polling),
    }


def refresh_civic_api_sources() -> pd.DataFrame:
    CIVIC_API_DIR.mkdir(parents=True, exist_ok=True)
    ensure_civic_address_targets()
    refresh_enabled = env_truthy(REFRESH_CIVIC_API_ENV)
    api_key = os.environ.get(CIVIC_API_KEY_ENV, "").strip()
    if not refresh_enabled:
        return pd.DataFrame(
            [
                {
                    "SourceName": "Google Civic Information API",
                    "SourceType": "Civic API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Skipped",
                    "RowsFetched": 0,
                    "Message": f"Set {REFRESH_CIVIC_API_ENV}=1 and {CIVIC_API_KEY_ENV} to refresh.",
                }
            ]
        )
    if not api_key:
        return pd.DataFrame(
            [
                {
                    "SourceName": "Google Civic Information API",
                    "SourceType": "Civic API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Skipped",
                    "RowsFetched": 0,
                    "Message": f"{CIVIC_API_KEY_ENV} is not set.",
                }
            ]
        )

    logs = []
    started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    try:
        election_payload = http_get_json(CIVIC_BASE_URL, "elections", {"key": api_key})
        write_jsonl([election_payload], CIVIC_API_DIR / "api_civic_elections.jsonl")
        elections = normalize_civic_elections(election_payload)
        write_csv(elections, CIVIC_API_DIR / "api_civic_elections.csv")
        logs.append(
            {
                "SourceName": "Google Civic Elections",
                "SourceType": "Civic API",
                "RefreshDate": REFRESH_DATE,
                "Status": "Loaded",
                "RowsFetched": len(elections),
                "StartedAtUtc": started,
                "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "OutputFile": "api_civic_elections.csv",
                "Message": "",
            }
        )
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        logs.append(
            {
                "SourceName": "Google Civic Elections",
                "SourceType": "Civic API",
                "RefreshDate": REFRESH_DATE,
                "Status": "Error",
                "RowsFetched": 0,
                "StartedAtUtc": started,
                "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "OutputFile": "api_civic_elections.csv",
                "Message": str(exc),
            }
        )

    targets = pd.read_csv(CIVIC_ADDRESS_TARGETS, dtype=str, keep_default_na=False)
    if not targets.empty:
        targets["IncludeFlag"] = targets["IncludeFlag"].map(lambda value: clean_text(value).lower() in {"true", "1", "yes", "y"})
    included = targets[targets.get("IncludeFlag", pd.Series(dtype=bool)).eq(True)].copy() if not targets.empty else pd.DataFrame()

    contest_frames = []
    candidate_frames = []
    polling_frames = []
    raw_responses = []
    for _, target in included.iterrows():
        address = clean_text(target.get("Address"), "")
        if not address:
            continue
        params = {"key": api_key, "address": address}
        if clean_text(target.get("ElectionId"), ""):
            params["electionId"] = clean_text(target.get("ElectionId"))
        started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        try:
            payload = http_get_json(CIVIC_BASE_URL, "voterinfo", params)
            raw_responses.append({"target": target.to_dict(), "response": payload})
            normalized = normalize_voterinfo_response(target.to_dict(), payload)
            contest_frames.append(normalized["fact_civic_contest"])
            candidate_frames.append(normalized["dim_civic_candidate"])
            polling_frames.append(normalized["fact_civic_polling_location"])
            logs.append(
                {
                    "SourceName": f"Google Civic VoterInfo: {address[:40]}",
                    "SourceType": "Civic API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Loaded",
                    "RowsFetched": len(normalized["fact_civic_contest"]),
                    "StartedAtUtc": started,
                    "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "OutputFile": "api_civic_voterinfo_*.csv",
                    "Message": "",
                }
            )
        except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            logs.append(
                {
                    "SourceName": f"Google Civic VoterInfo: {address[:40]}",
                    "SourceType": "Civic API",
                    "RefreshDate": REFRESH_DATE,
                    "Status": "Error",
                    "RowsFetched": 0,
                    "StartedAtUtc": started,
                    "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    "OutputFile": "api_civic_voterinfo_*.csv",
                    "Message": str(exc),
                }
            )
    if raw_responses:
        write_jsonl(raw_responses, CIVIC_API_DIR / "api_civic_voterinfo.jsonl")
    write_csv(pd.concat(contest_frames, ignore_index=True) if contest_frames else civic_empty_tables()["fact_civic_contest"], CIVIC_API_DIR / "api_civic_contests.csv")
    write_csv(pd.concat(candidate_frames, ignore_index=True) if candidate_frames else civic_empty_tables()["dim_civic_candidate"], CIVIC_API_DIR / "api_civic_candidates.csv")
    write_csv(pd.concat(polling_frames, ignore_index=True) if polling_frames else civic_empty_tables()["fact_civic_polling_location"], CIVIC_API_DIR / "api_civic_polling_locations.csv")
    return pd.DataFrame(logs)


def civic_empty_tables() -> dict[str, pd.DataFrame]:
    return {
        "dim_civic_election": empty_df(["CivicElectionKey", "ElectionId", "ElectionName", "ElectionDay", "SourceSystem", "LastUpdated"]),
        "fact_civic_contest": empty_df(
            [
                "CivicContestKey",
                "CivicElectionKey",
                "ElectionId",
                "AddressTargetKey",
                "StateKey",
                "DMA",
                "Market",
                "Office",
                "ContestType",
                "DistrictName",
                "OcdDivisionId",
                "NumberElected",
                "NumberVotingFor",
                "BallotPlacement",
                "SourceOfficial",
            ]
        ),
        "dim_civic_candidate": empty_df(
            [
                "CivicCandidateKey",
                "CivicContestKey",
                "CivicElectionKey",
                "ElectionId",
                "CandidateName",
                "Party",
                "CandidateUrl",
                "Phone",
                "Email",
                "OrderOnBallot",
                "Channels",
            ]
        ),
        "fact_civic_polling_location": empty_df(
            [
                "CivicPollingLocationKey",
                "CivicElectionKey",
                "ElectionId",
                "AddressTargetKey",
                "LocationName",
                "Line1",
                "City",
                "StateKey",
                "Zip",
                "PollingHours",
                "StartDate",
                "EndDate",
                "Latitude",
                "Longitude",
            ]
        ),
    }


def read_civic_tables() -> dict[str, pd.DataFrame]:
    tables = civic_empty_tables()
    file_map = {
        "dim_civic_election": CIVIC_API_DIR / "api_civic_elections.csv",
        "fact_civic_contest": CIVIC_API_DIR / "api_civic_contests.csv",
        "dim_civic_candidate": CIVIC_API_DIR / "api_civic_candidates.csv",
        "fact_civic_polling_location": CIVIC_API_DIR / "api_civic_polling_locations.csv",
    }
    for table, path in file_map.items():
        if path.exists():
            tables[table] = pd.read_csv(path, dtype=str, keep_default_na=False)
    return tables

