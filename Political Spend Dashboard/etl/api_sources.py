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
    CIVIC_API_DIR,
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


RETRYABLE_HTTP_ERRORS = (
    ConnectionResetError,
    ConnectionAbortedError,
    ConnectionRefusedError,
    TimeoutError,
    urllib.error.URLError,
    OSError,
)


def http_get_json(
    base_url: str,
    endpoint: str,
    params: dict[str, Any],
    timeout: int = API_TIMEOUT_SECONDS,
    max_attempts: int = 5,
) -> dict[str, Any]:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in [None, ""]}, doseq=True)
    url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "political-spend-dashboard-etl/1.0"})

    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # 4xx errors are not retryable (auth, bad params, etc) — fail fast.
            # 429 and 5xx are retryable.
            if exc.code == 429 or 500 <= exc.code < 600:
                last_exc = exc
            else:
                raise
        except RETRYABLE_HTTP_ERRORS as exc:
            last_exc = exc
        if attempt < max_attempts:
            backoff = min(2 ** (attempt - 1), 30)
            print(
                f"    HTTP error on {endpoint} attempt {attempt}/{max_attempts}: "
                f"{type(last_exc).__name__}: {last_exc}. Retrying in {backoff}s...",
                flush=True,
            )
            time.sleep(backoff)
    assert last_exc is not None
    raise last_exc


def _format_duration(seconds: float) -> str:
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    minutes, secs = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m{secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h{minutes:02d}m{secs:02d}s"


def openfec_paginated(endpoint: str, params: dict[str, Any], api_key: str, max_pages: int | None = None) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page = 1
    per_page = int(params.pop("per_page", 100))
    start = time.monotonic()
    last_log = start
    total_pages: int | None = None
    while True:
        payload = http_get_json(
            OPENFEC_BASE_URL,
            endpoint,
            {**params, "api_key": api_key, "page": page, "per_page": per_page},
        )
        page_records = payload.get("results") or []
        records.extend(page_records)
        pagination = payload.get("pagination") or {}
        if total_pages is None:
            total_pages = int(pagination.get("pages") or page)
        now = time.monotonic()
        elapsed = now - start
        should_log = (
            page == 1
            or page >= total_pages
            or (now - last_log) >= 15
        )
        if should_log:
            if total_pages and total_pages > 1 and elapsed > 0:
                rate_pages_per_sec = page / elapsed
                remaining_pages = max(total_pages - page, 0)
                eta_seconds = remaining_pages / rate_pages_per_sec if rate_pages_per_sec > 0 else 0
                pct = (page / total_pages) * 100
                print(
                    f"  [{endpoint}] page {page}/{total_pages} ({pct:5.1f}%)  "
                    f"rows={len(records):,}  elapsed={_format_duration(elapsed)}  eta={_format_duration(eta_seconds)}",
                    flush=True,
                )
            else:
                print(
                    f"  [{endpoint}] page {page}/{total_pages or '?'}  rows={len(records):,}  elapsed={_format_duration(elapsed)}",
                    flush=True,
                )
            last_log = now
        if page >= (total_pages or page) or not page_records:
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


def normalize_openfec_electioneering(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "CANDIDATE_ID",
        "CANDIDATE_NAME",
        "CANDIDATE_OFFICE",
        "CANDIDATE_STATE",
        "CANDIDATE_DISTRICT",
        "COMMITTEE_ID",
        "COMMITTEE_NAME",
        "SB_IMAGE_NUM",
        "PAYEE_NAME",
        "PAYEE_STREET",
        "PAYEE_CITY",
        "PAYEE_STATE",
        "DISBURSEMENT_DESCRIPTION",
        "DISBURSEMENT_DATE",
        "COMMUNICATION_DATE",
        "PUBLIC_DISBURSEMENT_DATE",
        "REPORTED_DISBURSEMENT_AMOUNT",
        "NUMBER_OF_CANDIDATES",
        "CALCULATED_CANDIDATE_SHARE",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        rows.append(
            {
                "CANDIDATE_ID": clean_text(get_first(record, "candidate_id")),
                "CANDIDATE_NAME": clean_text(get_first(record, "candidate_name")),
                "CANDIDATE_OFFICE": clean_text(get_first(record, "candidate_office")),
                "CANDIDATE_STATE": clean_text(get_first(record, "candidate_office_state", "candidate_state")),
                "CANDIDATE_DISTRICT": clean_text(get_first(record, "candidate_office_district", "candidate_district")),
                "COMMITTEE_ID": clean_text(get_first(record, "committee_id")),
                "COMMITTEE_NAME": clean_text(get_first(record, "committee_name")),
                "SB_IMAGE_NUM": clean_text(get_first(record, "sb_image_num", "image_number")),
                "PAYEE_NAME": clean_text(get_first(record, "payee_name")),
                "PAYEE_STREET": clean_text(get_first(record, "payee_street_1", "payee_street")),
                "PAYEE_CITY": clean_text(get_first(record, "payee_city")),
                "PAYEE_STATE": clean_text(get_first(record, "payee_state")),
                "DISBURSEMENT_DESCRIPTION": clean_text(get_first(record, "disbursement_description", "purpose_description")),
                "DISBURSEMENT_DATE": to_date(get_first(record, "disbursement_date")),
                "COMMUNICATION_DATE": to_date(get_first(record, "communication_date")),
                "PUBLIC_DISBURSEMENT_DATE": to_date(get_first(record, "public_distribution_date", "public_disbursement_date")),
                "REPORTED_DISBURSEMENT_AMOUNT": to_number(get_first(record, "disbursement_amount", "reported_disbursement_amount")),
                "NUMBER_OF_CANDIDATES": to_number(get_first(record, "number_of_candidates")),
                "CALCULATED_CANDIDATE_SHARE": to_number(get_first(record, "calculated_candidate_share")),
                "SourceSystem": "OpenFEC API",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def normalize_openfec_leadership_pacs(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "Committee_Id",
        "Committee_Name",
        "Link_Image",
        "Sponsor_Name",
        "Cash_on_Hand",
        "Coverage_End_Date",
        "Total_Disbursement",
        "Total_Receipt",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        committee_id = clean_text(get_first(record, "committee_id"))
        sponsor = ""
        sponsor_candidates = record.get("sponsor_candidate_list") or []
        if sponsor_candidates:
            first = sponsor_candidates[0] or {}
            sponsor = clean_text(first.get("candidate_name") or first.get("name"))
        if not sponsor:
            sponsor = clean_text(get_first(record, "sponsor_candidate_name", "sponsor_name"))
        rows.append(
            {
                "Committee_Id": committee_id,
                "Committee_Name": clean_text(get_first(record, "name", "committee_name")),
                "Link_Image": f"http://docquery.fec.gov/cgi-bin/fecimg/?{committee_id}" if committee_id else "",
                "Sponsor_Name": sponsor,
                "Cash_on_Hand": to_number(get_first(record, "cash_on_hand_end_period", "cash_on_hand")),
                "Coverage_End_Date": to_date(get_first(record, "coverage_end_date", "last_report_year_total_disbursements_end_date")),
                "Total_Disbursement": to_number(get_first(record, "disbursements", "total_disbursements")),
                "Total_Receipt": to_number(get_first(record, "receipts", "total_receipts")),
                "SourceSystem": "OpenFEC API",
            }
        )
    return pd.DataFrame(rows, columns=columns)


def normalize_openfec_lobbyist_pacs(records: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "Link_Image",
        "Committee_Name",
        "Committee_Id",
        "Date_Filed",
        "Is_Lobbyist",
        "SourceSystem",
    ]
    rows = []
    for record in records:
        committee_id = clean_text(get_first(record, "committee_id"))
        last_file_date = to_date(get_first(record, "last_file_date", "last_f1_date", "first_file_date"))
        rows.append(
            {
                "Link_Image": f"http://docquery.fec.gov/cgi-bin/fecimg/?{committee_id}" if committee_id else "",
                "Committee_Name": clean_text(get_first(record, "name", "committee_name")),
                "Committee_Id": committee_id,
                "Date_Filed": last_file_date,
                "Is_Lobbyist": "Y",
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
    skip_ie = env_truthy("SKIP_FEC_IE")
    ie_min_date = os.environ.get("FEC_IE_MIN_DATE", "").strip()

    ie_params: dict[str, Any] = {"two_year_transaction_period": CYCLE, "sort": "-expenditure_date"}
    if ie_min_date:
        ie_params["min_date"] = ie_min_date

    endpoint_specs = [
        ("OpenFEC Candidates", "candidates/search/", {"election_year": CYCLE}, normalize_openfec_candidates, f"api_candidate_summary_{CYCLE}.csv"),
        ("OpenFEC Committees", "committees/", {"cycle": CYCLE}, normalize_openfec_committees, f"api_committee_summary_{CYCLE}.csv"),
    ]
    if not skip_ie:
        endpoint_specs.append(
            (
                "OpenFEC Independent Expenditures",
                "schedules/schedule_e/",
                ie_params,
                normalize_openfec_independent_expenditures,
                f"api_independent_expenditure_{CYCLE}.csv",
            )
        )
    endpoint_specs.extend([
        (
            "OpenFEC Electioneering Communications",
            "electioneering/",
            {"cycle": CYCLE, "sort": "-disbursement_date"},
            normalize_openfec_electioneering,
            f"api_electioneering_communications_{CYCLE}.csv",
        ),
        (
            "OpenFEC Leadership PACs",
            "committees/",
            {"cycle": CYCLE, "organization_type": "L", "designation": "D"},
            normalize_openfec_leadership_pacs,
            f"api_leadership_pacs_{CYCLE}.csv",
        ),
        (
            "OpenFEC Lobbyist Registrant PACs",
            "committees/",
            {"cycle": CYCLE, "lobbyist_registrant_pac": "true"},
            normalize_openfec_lobbyist_pacs,
            f"api_lobbyist_pacs_{CYCLE}.csv",
        ),
    ])

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

    if skip_ie:
        print("[FEC] SKIP_FEC_IE=1 -> skipping Independent Expenditures", flush=True)
        rows.append(
            {
                "SourceName": "OpenFEC Independent Expenditures",
                "SourceType": "OpenFEC API",
                "RefreshDate": REFRESH_DATE,
                "Status": "Skipped",
                "RowsFetched": 0,
                "Message": "Skipped via SKIP_FEC_IE=1",
            }
        )

    for source_name, endpoint, params, normalizer, output_name in endpoint_specs:
        started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        print(f"[FEC] Pulling {source_name}...", flush=True)
        try:
            records = openfec_paginated(endpoint, dict(params), api_key)
            print(f"[FEC] {source_name}: {len(records):,} rows", flush=True)
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
        except (*RETRYABLE_HTTP_ERRORS, ValueError, json.JSONDecodeError) as exc:
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


def civic_empty_tables() -> dict[str, pd.DataFrame]:
    return {
        "dim_civic_election": empty_df(
            ["CivicElectionKey", "ElectionId", "ElectionName", "ElectionDay", "Country", "StateKey", "RaceCount", "SourceSystem", "LastUpdated"]
        ),
        "fact_civic_contest": empty_df(
            [
                "CivicContestKey",
                "CivicElectionKey",
                "ElectionId",
                "StateKey",
                "DistrictName",
                "Municipality",
                "Office",
                "ContestType",
                "ElectionType",
                "ElectionDate",
                "Seats",
                "PercentReporting",
                "HasBreakdown",
                "HasMap",
                "SourceOfficial",
                "SourceSystem",
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
                "Color",
                "Votes",
                "Percent",
                "Winner",
                "Incumbent",
                "MajorCandidate",
                "OrderOnBallot",
                "SourceSystem",
            ]
        ),
        "fact_civic_polling_location": empty_df(
            ["CivicPollingLocationKey", "CivicElectionKey", "ElectionId", "StateKey", "SourceSystem"]
        ),
        "fact_election_results": empty_df(
            [
                "ElectionResultKey",
                "CivicContestKey",
                "CivicCandidateKey",
                "ElectionId",
                "StateKey",
                "DistrictName",
                "Office",
                "ElectionType",
                "ElectionDate",
                "CandidateName",
                "Party",
                "Votes",
                "Percent",
                "Winner",
                "Incumbent",
                "MajorCandidate",
                "PercentReporting",
                "LastUpdated",
                "SourceSystem",
            ]
        ),
    }


def _race_to_contest_row(race: dict[str, Any]) -> dict[str, Any]:
    race_id = clean_text(race.get("id"))
    election_date = to_date(race.get("election_date"))
    province = clean_text(race.get("province"))
    election_key = source_key(election_date, race.get("country"), province)
    return {
        "CivicContestKey": race_id,
        "CivicElectionKey": election_key,
        "ElectionId": election_key,
        "StateKey": province,
        "DistrictName": clean_text(race.get("district")),
        "Municipality": clean_text(race.get("municipality")),
        "Office": clean_text(race.get("election_type")) or clean_text(race.get("type")),
        "ContestType": clean_text(race.get("type")),
        "ElectionType": clean_text(race.get("election_type")),
        "ElectionDate": election_date,
        "Seats": to_number(race.get("seats")),
        "PercentReporting": to_number(race.get("percent_reporting")),
        "HasBreakdown": to_number(race.get("has_breakdown")),
        "HasMap": to_number(race.get("has_map")),
        "SourceOfficial": True,
        "SourceSystem": "civicapi.org",
    }


def _candidate_to_dim_row(race_id: str, election_key: str, idx: int, candidate: dict[str, Any]) -> dict[str, Any]:
    name = clean_text(candidate.get("name"))
    return {
        "CivicCandidateKey": source_key(race_id, idx, name),
        "CivicContestKey": race_id,
        "CivicElectionKey": election_key,
        "ElectionId": election_key,
        "CandidateName": name,
        "Party": clean_text(candidate.get("party")),
        "Color": clean_text(candidate.get("color")),
        "Votes": to_number(candidate.get("votes")),
        "Percent": to_number(candidate.get("percent")),
        "Winner": bool(candidate.get("winner")),
        "Incumbent": bool(candidate.get("incumbent")),
        "MajorCandidate": bool(candidate.get("major_candidate")),
        "OrderOnBallot": idx + 1,
        "SourceSystem": "civicapi.org",
    }


def normalize_civicapi_race_search(payload: dict[str, Any]) -> dict[str, pd.DataFrame]:
    contest_rows: list[dict[str, Any]] = []
    candidate_rows: list[dict[str, Any]] = []
    election_rows: dict[str, dict[str, Any]] = {}
    for race in payload.get("races") or []:
        race_id = clean_text(race.get("id"))
        if not race_id:
            continue
        contest = _race_to_contest_row(race)
        contest_rows.append(contest)
        election_key = contest["CivicElectionKey"]
        if election_key and election_key not in election_rows:
            election_rows[election_key] = {
                "CivicElectionKey": election_key,
                "ElectionId": election_key,
                "ElectionName": f"{clean_text(race.get('country'))} {contest['ElectionDate']}",
                "ElectionDay": contest["ElectionDate"],
                "Country": clean_text(race.get("country")),
                "StateKey": contest["StateKey"],
                "RaceCount": 0,
                "SourceSystem": "civicapi.org",
                "LastUpdated": REFRESH_DATE,
            }
        if election_key in election_rows:
            election_rows[election_key]["RaceCount"] = int(election_rows[election_key]["RaceCount"]) + 1
        for idx, candidate in enumerate(race.get("candidates") or []):
            candidate_rows.append(_candidate_to_dim_row(race_id, election_key, idx, candidate))
    schemas = civic_empty_tables()
    return {
        "dim_civic_election": pd.DataFrame(election_rows.values(), columns=schemas["dim_civic_election"].columns),
        "fact_civic_contest": pd.DataFrame(contest_rows, columns=schemas["fact_civic_contest"].columns),
        "dim_civic_candidate": pd.DataFrame(candidate_rows, columns=schemas["dim_civic_candidate"].columns),
    }


def normalize_civicapi_race_detail(race_id: str, payload: dict[str, Any]) -> pd.DataFrame:
    schemas = civic_empty_tables()
    election_date = to_date(payload.get("election_date"))
    province = clean_text(payload.get("province"))
    election_key = source_key(election_date, payload.get("country"), province)
    office = clean_text(payload.get("election_type")) or clean_text(payload.get("election_scope"))
    percent_reporting = to_number(payload.get("percent_reporting"))
    last_updated = clean_text(payload.get("last_updated")) or REFRESH_DATE
    rows: list[dict[str, Any]] = []
    for idx, candidate in enumerate(payload.get("candidates") or []):
        name = clean_text(candidate.get("name"))
        candidate_key = source_key(race_id, idx, name)
        rows.append(
            {
                "ElectionResultKey": source_key(race_id, name),
                "CivicContestKey": race_id,
                "CivicCandidateKey": candidate_key,
                "ElectionId": election_key,
                "StateKey": province,
                "DistrictName": clean_text(payload.get("district")),
                "Office": office,
                "ElectionType": clean_text(payload.get("election_type")),
                "ElectionDate": election_date,
                "CandidateName": name,
                "Party": clean_text(candidate.get("party")),
                "Votes": to_number(candidate.get("votes")),
                "Percent": to_number(candidate.get("percent")),
                "Winner": bool(candidate.get("winner")),
                "Incumbent": bool(candidate.get("incumbent")),
                "MajorCandidate": bool(candidate.get("major_candidate")),
                "PercentReporting": percent_reporting,
                "LastUpdated": last_updated,
                "SourceSystem": "civicapi.org",
            }
        )
    return pd.DataFrame(rows, columns=schemas["fact_election_results"].columns)


def _is_race_completed(race: dict[str, Any]) -> bool:
    election_date_str = to_date(race.get("election_date"))
    if not election_date_str:
        return False
    try:
        election_date = datetime.strptime(election_date_str, "%Y-%m-%d").date()
    except ValueError:
        return False
    if election_date >= datetime.utcnow().date():
        return False
    percent_reporting = to_number(race.get("percent_reporting")) or 0.0
    has_winner = any(bool(c.get("winner")) for c in race.get("candidates") or [])
    return percent_reporting >= 95 or has_winner


def _log_row(source_name: str, output_file: str, status: str, started: str, rows: int, message: str = "") -> dict[str, Any]:
    return {
        "SourceName": source_name,
        "SourceType": "civicapi.org",
        "RefreshDate": REFRESH_DATE,
        "Status": status,
        "RowsFetched": rows,
        "StartedAtUtc": started,
        "FinishedAtUtc": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "OutputFile": output_file,
        "Message": message,
    }


def refresh_civic_api_sources() -> pd.DataFrame:
    CIVIC_API_DIR.mkdir(parents=True, exist_ok=True)
    refresh_enabled = env_truthy(REFRESH_CIVIC_API_ENV)
    skip_civic = env_truthy("SKIP_CIVIC_API")
    schemas = civic_empty_tables()

    if skip_civic or not refresh_enabled:
        reason = (
            "Set SKIP_CIVIC_API=0 to re-enable; using political_windows file instead."
            if skip_civic
            else f"Set {REFRESH_CIVIC_API_ENV}=1 to refresh. civicapi.org requires no API key."
        )
        for path, df in [
            (CIVIC_API_DIR / "api_civic_elections.csv", schemas["dim_civic_election"]),
            (CIVIC_API_DIR / "api_civic_contests.csv", schemas["fact_civic_contest"]),
            (CIVIC_API_DIR / "api_civic_candidates.csv", schemas["dim_civic_candidate"]),
            (CIVIC_API_DIR / "api_civic_polling_locations.csv", schemas["fact_civic_polling_location"]),
        ]:
            if not path.exists():
                write_csv(df, path)
        return pd.DataFrame(
            [
                _log_row(
                    "civicapi.org",
                    "api_civic_*.csv",
                    "Skipped",
                    datetime.utcnow().isoformat(timespec="seconds") + "Z",
                    0,
                    reason,
                )
            ]
        )

    logs: list[dict[str, Any]] = []

    # 1. Election dates for the cycle year
    started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    try:
        dates_payload = http_get_json(CIVIC_BASE_URL, "getElectionDates", {"country": "US", "year": CYCLE})
        write_jsonl([dates_payload], CIVIC_API_DIR / "api_civic_election_dates.jsonl")
        total = int(dates_payload.get("total_unique_dates") or 0)
        logs.append(_log_row("civicapi.org Election Dates", "api_civic_election_dates.jsonl", "Loaded", started, total))
    except (*RETRYABLE_HTTP_ERRORS, ValueError, json.JSONDecodeError) as exc:
        logs.append(_log_row("civicapi.org Election Dates", "api_civic_election_dates.jsonl", "Error", started, 0, str(exc)))

    # 2. All US races in the cycle
    started = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    cycle_start = f"{CYCLE}-01-01"
    cycle_end = f"{CYCLE}-12-31"
    try:
        race_payload = http_get_json(
            CIVIC_BASE_URL,
            "race/search",
            {"country": "US", "startDate": cycle_start, "endDate": cycle_end, "limit": 50000},
        )
        write_jsonl([race_payload], CIVIC_API_DIR / "api_civic_races_search.jsonl")
        normalized = normalize_civicapi_race_search(race_payload)
        write_csv(normalized["dim_civic_election"], CIVIC_API_DIR / "api_civic_elections.csv")
        write_csv(normalized["fact_civic_contest"], CIVIC_API_DIR / "api_civic_contests.csv")
        write_csv(normalized["dim_civic_candidate"], CIVIC_API_DIR / "api_civic_candidates.csv")
        # Polling locations not provided by civicapi.org; emit empty for downstream schema.
        write_csv(schemas["fact_civic_polling_location"], CIVIC_API_DIR / "api_civic_polling_locations.csv")
        logs.append(_log_row("civicapi.org Race Search", "api_civic_contests.csv", "Loaded", started, len(normalized["fact_civic_contest"])))
    except (*RETRYABLE_HTTP_ERRORS, ValueError, json.JSONDecodeError) as exc:
        logs.append(_log_row("civicapi.org Race Search", "api_civic_contests.csv", "Error", started, 0, str(exc)))
        return pd.DataFrame(logs)

    # 3. Detailed pulls for completed races -> certified results
    completed_races = [race for race in race_payload.get("races") or [] if _is_race_completed(race)]
    detail_frames: list[pd.DataFrame] = []
    detail_raw: list[dict[str, Any]] = []
    detail_errors = 0
    total_completed = len(completed_races)
    detail_start = time.monotonic()
    detail_last_log = detail_start
    print(f"[Civic] Fetching certified results for {total_completed} completed races...", flush=True)
    for idx, race in enumerate(completed_races, start=1):
        race_id = clean_text(race.get("id"))
        if not race_id:
            continue
        started_detail = datetime.utcnow().isoformat(timespec="seconds") + "Z"
        try:
            detail = http_get_json(CIVIC_BASE_URL, f"race/{race_id}", {})
            detail_raw.append({"race_id": race_id, "response": detail})
            detail_frames.append(normalize_civicapi_race_detail(race_id, detail))
            time.sleep(0.15)
        except (*RETRYABLE_HTTP_ERRORS, ValueError, json.JSONDecodeError) as exc:
            detail_errors += 1
            logs.append(_log_row(f"civicapi.org Race {race_id}", "fact_election_results.csv", "Error", started_detail, 0, str(exc)))
        now = time.monotonic()
        if idx == 1 or idx == total_completed or (now - detail_last_log) >= 15:
            elapsed = now - detail_start
            pct = (idx / total_completed) * 100 if total_completed else 100.0
            rate = idx / elapsed if elapsed > 0 else 0
            eta = (total_completed - idx) / rate if rate > 0 else 0
            print(
                f"  [Civic race detail] {idx}/{total_completed} ({pct:5.1f}%)  "
                f"errors={detail_errors}  elapsed={_format_duration(elapsed)}  eta={_format_duration(eta)}",
                flush=True,
            )
            detail_last_log = now
    if detail_raw:
        write_jsonl(detail_raw, CIVIC_API_DIR / "api_civic_race_details.jsonl")
    fact_results = pd.concat(detail_frames, ignore_index=True) if detail_frames else schemas["fact_election_results"]
    write_csv(fact_results, CIVIC_API_DIR / "fact_election_results.csv")
    summary_status = "Loaded" if detail_frames or not completed_races else "Partial"
    logs.append(
        _log_row(
            "civicapi.org Certified Results",
            "fact_election_results.csv",
            summary_status,
            started,
            len(fact_results),
            f"{detail_errors} race detail errors" if detail_errors else "",
        )
    )
    return pd.DataFrame(logs)


def read_civic_tables() -> dict[str, pd.DataFrame]:
    tables = civic_empty_tables()
    file_map = {
        "dim_civic_election": CIVIC_API_DIR / "api_civic_elections.csv",
        "fact_civic_contest": CIVIC_API_DIR / "api_civic_contests.csv",
        "dim_civic_candidate": CIVIC_API_DIR / "api_civic_candidates.csv",
        "fact_civic_polling_location": CIVIC_API_DIR / "api_civic_polling_locations.csv",
        "fact_election_results": CIVIC_API_DIR / "fact_election_results.csv",
    }
    for table, path in file_map.items():
        if path.exists():
            tables[table] = pd.read_csv(path, dtype=str, keep_default_na=False)
    return tables

