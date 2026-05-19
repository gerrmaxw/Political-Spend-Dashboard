from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
SPEND_DIR = RAW_DIR / "spend_snapshots"
SPEND_ACTIVITY_DIR = RAW_DIR / "spend_activity"
FEC_DIR = RAW_DIR / "fec"
FEC_API_DIR = RAW_DIR / "fec_api"
CIVIC_API_DIR = RAW_DIR / "civic_api"
WINDOWS_DIR = RAW_DIR / "windows"
CONTROL_DIR = DATA_DIR / "control"
CURATED_DIR = DATA_DIR / "curated"
QA_DIR = DATA_DIR / "qa"
POWERBI_DIR = BASE_DIR / "powerbi"

SNAPSHOT_MANIFEST = CONTROL_DIR / "SnapshotManifest.xlsx"
DATA_SOURCE_MANIFEST = CONTROL_DIR / "DataSourceManifest.csv"
MAPPING_OVERRIDES = CONTROL_DIR / "Advertiser_Mapping_Overrides.xlsx"
RACE_MASTER_MANUAL = CONTROL_DIR / "Race_Master_Manual.xlsx"
DMA_RACE_COVERAGE = CONTROL_DIR / "DMA_Race_Coverage.xlsx"
MARKET_DMA_CROSSWALK = CONTROL_DIR / "MarketDMACrosswalk.xlsx"
CASE_STUDY_NOTES = CONTROL_DIR / "CaseStudyNotes.xlsx"

REFRESH_DATE = "2026-05-13"
CYCLE = 2026
DEFAULT_SNAPSHOT_DATE = "2026-05-13"
OPENFEC_BASE_URL = "https://api.open.fec.gov/v1"
CIVIC_BASE_URL = "https://civicapi.org/api/v2"
CIVIC_COUNTRY = "US"
FEC_API_KEY_ENV = "FEC_API_KEY"
REFRESH_FEC_API_ENV = "REFRESH_FEC_API"
REFRESH_CIVIC_API_ENV = "REFRESH_CIVIC_API"
API_TIMEOUT_SECONDS = 45

DASHBOARD_ROOT = Path(r"C:\Users\gmaxwe967\Dashboard")
ADIMPACT_DIR = DASHBOARD_ROOT / "AdImpact"
LEGACY_POLITICAL_SPEND_DIR = DASHBOARD_ROOT / "Political Spend"

SOURCE_FILES = {
    "spend_snapshot": ADIMPACT_DIR / "Home_Advertiser_data.csv",
    "spend_activity": ADIMPACT_DIR / "Cross tab_data.csv",
    "dev_cash_on_hand": ADIMPACT_DIR / "DEV cash on hand_data.csv",
    "political_windows": LEGACY_POLITICAL_SPEND_DIR / "Political Windows by Market.xlsx",
    "target_pbix": DASHBOARD_ROOT / "Political Spend Dashboard.pbix",
}

EXPECTED_SPEND_CHECKPOINTS = {
    "TotalAmount": 1855150737.0,
    "BroadcastSpend": 533564250.0,
    "CableSpend": 329476690.0,
    "CTVSpend": 469896655.0,
    "DigitalSpend": 475317741.0,
    "RadioSpend": 46895401.0,
}


def ensure_directories() -> None:
    for path in [
        RAW_DIR,
        SPEND_DIR,
        SPEND_ACTIVITY_DIR,
        FEC_DIR,
        FEC_API_DIR,
        CIVIC_API_DIR,
        WINDOWS_DIR,
        CONTROL_DIR,
        CURATED_DIR,
        QA_DIR,
        POWERBI_DIR,
    ]:
        path.mkdir(parents=True, exist_ok=True)
