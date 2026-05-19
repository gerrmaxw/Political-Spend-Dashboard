# Political Spend Dashboard ETL

This project implements the Python-first weekly pipeline for `Political Spend Dashboard-2.pbix`.
Power BI should connect to the curated CSV layer only. Weekly spend files,
FEC bulk/API data, civicapi.org race + results data, political windows, and
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
REFRESH_CIVIC_API=1
```

civicapi.org is unauthenticated, so no Civic key is needed. The refresh hits
`/getElectionDates`, `/race/search` (US, current cycle), and then `/race/<built-in function id>`
for each completed race to populate `fact_election_results.csv` with certified
vote totals and winner flags.

## Outputs

- Curated Power BI tables: `data/curated/`
- QA outputs: `data/qa/`
- Control workbooks: `data/control/`
- Power BI scripts: `powerbi/`
- Source health: `dim_data_source.csv`, `fact_refresh_log.csv`, `qa_source_health.csv`

## Current Source Reconciliation

The new `Home_Advertiser_data (5).xlsx` source differs slightly from the older 5/11 checkpoint in row count and by $14 in total spend. The QA file keeps the actual totals and the expected checkpoint deltas visible.

| SourceFile | SnapshotDate | Cycle | RowsLoaded | RowsWithAmount | RowsWithNonZeroAmount | TotalAmount | BroadcastSpend | CableSpend | CTVSpend | DigitalSpend | RadioSpend | AdvertiserCount | DMACount | ExpectedTotalAmount | TotalAmountDelta | ExpectedBroadcastSpend | BroadcastSpendDelta | ExpectedCableSpend | CableSpendDelta | ExpectedCTVSpend | CTVSpendDelta | ExpectedDigitalSpend | DigitalSpendDelta | ExpectedRadioSpend | RadioSpendDelta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home_Advertiser_data.csv | 2026-05-13 | 2026 | 403540 | 80708 | 79232 | 1855211028.0 | 533624526.0 | 329476689.0 | 469896661.0 | 475317749.0 | 46895403.0 | 4283 | 218 | 1855150737.0 | 60291.0 | 533564250.0 | 60276.0 | 329476690.0 | -1.0 | 469896655.0 | 6.0 | 475317741.0 | 8.0 | 46895401.0 | 2.0 |

## Row Counts

- `bridge_advertiser_entity`: 1,174
- `bridge_race_dma`: 0
- `dim_advertiser`: 1,174
- `dim_agency`: 308
- `dim_candidate`: 3,955
- `dim_case_study_notes`: 0
- `dim_civic_candidate`: 40,780
- `dim_civic_election`: 102
- `dim_committee`: 19,678
- `dim_data_source`: 5
- `dim_dma`: 61
- `dim_media_type`: 4
- `dim_network`: 784
- `dim_office`: 21
- `dim_party`: 3
- `dim_race`: 521
- `dim_race_level`: 4
- `dim_snapshot`: 1
- `dim_state`: 63
- `dim_station`: 1,848
- `fact_candidate_finance`: 3,954
- `fact_civic_contest`: 26,971
- `fact_election_results`: 16,015
- `fact_outside_spend`: 0
- `fact_political_windows`: 508
- `fact_refresh_log`: 7
- `fact_spend_current`: 18,365
- `fact_spend_snapshot`: 18,365
- `fact_spend_weekly_activity`: 0
- `qa/advertiser_match_review`: 930
- `qa/duplicate_key_check`: 6,669
- `qa/low_confidence_matches`: 529
- `qa/market_scope_exclusions`: 1,106
- `qa/missing_field_checks`: 5
- `qa/qa_snapshot_reconciliation`: 1
- `qa/unmatched_advertisers`: 401
- `qa_advertiser_match_review`: 930
- `qa_duplicate_key_check`: 6,669
- `qa_low_confidence_matches`: 529
- `qa_market_scope_exclusions`: 1,106
- `qa_missing_field_checks`: 5
- `qa_snapshot_reconciliation`: 1
- `qa_source_health`: 5
- `qa_unmatched_advertisers`: 401
