from __future__ import annotations

import hashlib
import re
from pathlib import Path

import pandas as pd


SPEND_COLUMN_MAP = {
    "Election State": "State",
    "Market or State": "State",
    "DMA": "DMA",
    "Office Type": "RaceLevel",
    "Office": "Office",
    "Election": "Election",
    "Team Party": "Party",
    "Advertiser Type": "AdvertiserType",
    "Advertiser": "Advertiser",
    "Agencies": "Agency",
    "In Current Cycle?": "InCurrentCycle",
    "Networks": "Network",
    "Station": "Station",
    "ATV_MEDIA_TYPE (copy 2)": "MediaType",
    "ATV_MEDIA_TYPE": "MediaType",
    "Amount": "Amount",
    "Gross Spending": "GrossSpending",
    "Gross Spending/Share": "GrossSpending",
}

TEXT_DEFAULTS = {
    "State": "Unknown",
    "DMA": "Unknown",
    "RaceLevel": "Unknown",
    "Office": "Unknown",
    "Election": "Unknown",
    "Party": "Unknown",
    "AdvertiserType": "Unknown",
    "Advertiser": "Unknown",
    "Agency": "Unknown",
    "Network": "Unknown",
    "Station": "Unknown",
    "MediaType": "Unknown",
}


def clean_text(value, default: str = "Unknown") -> str:
    if value is None:
        return default
    if isinstance(value, float) and pd.isna(value):
        return default
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "n/a", "na"}:
        return default
    return re.sub(r"\s+", " ", text)


def clean_key_text(value) -> str:
    text = clean_text(value, "")
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def stable_key(prefix: str, *parts) -> str:
    base = "|".join(clean_key_text(part) for part in parts)
    if not base.strip("|"):
        base = "unknown"
    digest = hashlib.sha1(base.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}_{digest}"


def normalize_party(value) -> str:
    key = clean_key_text(value)
    mapping = {
        "dem": "Democratic",
        "democrat": "Democratic",
        "democratic": "Democratic",
        "democratic party": "Democratic",
        "rep": "Republican",
        "republican": "Republican",
        "republican party": "Republican",
        "gop": "Republican",
        "ind": "Independent",
        "independent": "Independent",
        "npa": "Nonpartisan",
        "nonpartisan": "Nonpartisan",
    }
    return mapping.get(key, clean_text(value))


def normalize_media(value) -> str:
    key = clean_key_text(value)
    mapping = {
        "broadcast": "Broadcast",
        "cable": "Cable",
        "ctv": "CTV",
        "digital": "Digital",
        "radio": "Radio",
    }
    return mapping.get(key, clean_text(value))


def read_spend_workbook(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix == ".xlsb":
        return pd.read_excel(path, sheet_name=0, engine="pyxlsb")
    return pd.read_excel(path, sheet_name=0)


def normalize_spend_file(path: Path, snapshot_date: str, cycle: int, source_file: str | None = None) -> tuple[pd.DataFrame, dict]:
    raw = read_spend_workbook(path)
    raw_columns = list(raw.columns)
    rename_map = {col: SPEND_COLUMN_MAP[col] for col in raw.columns if col in SPEND_COLUMN_MAP}
    missing_required = [
        source
        for source in ["Advertiser", "Amount"]
        if source not in raw.columns and SPEND_COLUMN_MAP.get(source, source) not in rename_map.values()
    ]
    if missing_required:
        raise ValueError(f"{path.name} is missing required spend columns: {missing_required}")

    renamed = raw.rename(columns=rename_map)
    normalized = pd.DataFrame(index=renamed.index)
    for col, default in TEXT_DEFAULTS.items():
        normalized[col] = renamed[col].map(lambda value: clean_text(value, default)) if col in renamed.columns else default

    normalized["Party"] = normalized["Party"].map(normalize_party)
    normalized["MediaType"] = normalized["MediaType"].map(normalize_media)
    normalized["Amount"] = pd.to_numeric(renamed.get("Amount"), errors="coerce")
    normalized["GrossSpending"] = pd.to_numeric(renamed.get("GrossSpending"), errors="coerce")
    normalized["SnapshotDate"] = pd.to_datetime(snapshot_date).date().isoformat()
    normalized["Cycle"] = int(cycle)
    normalized["SourceFile"] = source_file or path.name
    normalized["SourceRowNumber"] = normalized.index + 2

    rows_loaded = len(normalized)
    rows_with_amount = int(normalized["Amount"].notna().sum())
    rows_nonzero_amount = int((normalized["Amount"].fillna(0) != 0).sum())
    normalized = normalized[normalized["Amount"].notna()].copy()

    key_specs = [
        ("AdvertiserKey", "ADV", ["Advertiser"]),
        ("AgencyKey", "AGY", ["Agency"]),
        ("StateKey", "STA", ["State"]),
        ("DMAKey", "DMA", ["DMA"]),
        ("OfficeKey", "OFF", ["Office"]),
        ("RaceLevelKey", "RLV", ["RaceLevel"]),
        ("PartyKey", "PTY", ["Party"]),
        ("MediaTypeKey", "MED", ["MediaType"]),
        ("StationKey", "STN", ["Station"]),
        ("NetworkKey", "NET", ["Network"]),
    ]
    for key_col, prefix, source_cols in key_specs:
        normalized[key_col] = normalized.apply(lambda row: stable_key(prefix, *(row[col] for col in source_cols)), axis=1)

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
    normalized["RowBusinessKey"] = normalized[row_key_fields].agg("|".join, axis=1)
    normalized["RowBusinessKeyHash"] = normalized["RowBusinessKey"].map(
        lambda value: hashlib.sha1(value.encode("utf-8")).hexdigest()[:16].upper()
    )

    stats = {
        "SourceFile": source_file or path.name,
        "SnapshotDate": snapshot_date,
        "Cycle": cycle,
        "RowsLoaded": rows_loaded,
        "RowsWithAmount": rows_with_amount,
        "RowsWithNonZeroAmount": rows_nonzero_amount,
        "TotalAmount": float(normalized["Amount"].sum()),
        "RawColumns": raw_columns,
    }
    return normalized, stats


def build_spend_facts(stg_spend: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    fact_cols = [
        "SnapshotDate",
        "Cycle",
        "SourceFile",
        "RowBusinessKey",
        "RowBusinessKeyHash",
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
        "Advertiser",
        "AdvertiserType",
        "Agency",
        "State",
        "DMA",
        "Office",
        "Election",
        "RaceLevel",
        "Party",
        "MediaType",
        "Station",
        "Network",
    ]
    fact = (
        stg_spend.groupby(fact_cols, dropna=False, as_index=False)
        .agg(Amount=("Amount", "sum"), GrossSpending=("GrossSpending", "sum"), SourceRowCount=("Amount", "size"))
        .sort_values(["SnapshotDate", "Advertiser", "State", "DMA", "MediaType"])
        .reset_index(drop=True)
    )
    latest_snapshot = fact["SnapshotDate"].max()
    current = fact[fact["SnapshotDate"] == latest_snapshot].copy().reset_index(drop=True)
    return fact, current
