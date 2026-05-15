# Political Spend Dashboard ETL

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

| SourceFile | SnapshotDate | Cycle | RowsLoaded | RowsWithAmount | RowsWithNonZeroAmount | TotalAmount | BroadcastSpend | CableSpend | CTVSpend | DigitalSpend | RadioSpend | AdvertiserCount | DMACount | ExpectedTotalAmount | TotalAmountDelta | ExpectedBroadcastSpend | BroadcastSpendDelta | ExpectedCableSpend | CableSpendDelta | ExpectedCTVSpend | CTVSpendDelta | ExpectedDigitalSpend | DigitalSpendDelta | ExpectedRadioSpend | RadioSpendDelta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-13_Home_Advertiser_data_5.xlsx | 2026-05-13 | 2026 | 403465 | 80693 | 79218 | 1855150751.0 | 533564250.0 | 329476689.0 | 469896661.0 | 475317748.0 | 46895403.0 | 4282 | 218 | 1855150737.0 | 14.0 | 533564250.0 | 0.0 | 329476690.0 | -1.0 | 469896655.0 | 6.0 | 475317741.0 | 7.0 | 46895401.0 | 2.0 |

## Row Counts

- `bridge_advertiser_entity`: 1,173
- `bridge_race_dma`: 0
- `dim_advertiser`: 1,173
- `dim_agency`: 308
- `dim_candidate`: 4,018
- `dim_case_study_notes`: 0
- `dim_civic_candidate`: 0
- `dim_civic_election`: 0
- `dim_committee`: 14,591
- `dim_data_source`: 5
- `dim_dma`: 61
- `dim_media_type`: 4
- `dim_network`: 784
- `dim_office`: 21
- `dim_party`: 3
- `dim_race`: 529
- `dim_race_level`: 4
- `dim_snapshot`: 1
- `dim_state`: 63
- `dim_station`: 1,848
- `fact_candidate_finance`: 4,017
- `fact_civic_contest`: 0
- `fact_civic_polling_location`: 0
- `fact_election_results`: 0
- `fact_outside_spend`: 6,490
- `fact_political_windows`: 508
- `fact_refresh_log`: 4
- `fact_spend_current`: 18,357
- `fact_spend_snapshot`: 18,357
- `fact_spend_weekly_activity`: 0
- `qa/advertiser_match_review`: 977
- `qa/duplicate_key_check`: 6,667
- `qa/low_confidence_matches`: 519
- `qa/market_scope_exclusions`: 1,106
- `qa/missing_field_checks`: 5
- `qa/qa_snapshot_reconciliation`: 1
- `qa/unmatched_advertisers`: 458
- `qa_advertiser_match_review`: 977
- `qa_duplicate_key_check`: 6,667
- `qa_low_confidence_matches`: 519
- `qa_market_scope_exclusions`: 1,106
- `qa_missing_field_checks`: 5
- `qa_snapshot_reconciliation`: 1
- `qa_source_health`: 5
- `qa_unmatched_advertisers`: 458
