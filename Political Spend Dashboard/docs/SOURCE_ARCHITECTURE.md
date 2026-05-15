# Source Architecture

Power BI should model, measure, filter, drill through, and publish. Python should ingest, normalize, match, snapshot, and QA.

## Source Contract

Power BI reads only `data/curated/*.csv`. Raw weekly files, FEC bulk downloads, OpenFEC API payloads, CivicAPI payloads, political-window files, and manual overrides all land upstream of the curated folder.

Core curated outputs:

- Spend: `fact_spend_snapshot.csv`, `fact_spend_current.csv`, `dim_snapshot.csv`, spend dimensions.
- FEC/outside spend: `fact_outside_spend.csv`, `dim_candidate.csv`, `dim_committee.csv`, `fact_candidate_finance.csv`.
- CivicAPI: `dim_civic_election.csv`, `fact_civic_contest.csv`, `dim_civic_candidate.csv`, `fact_civic_polling_location.csv`.
- Results scaffold: `fact_election_results.csv`.
- QA/source health: `dim_data_source.csv`, `fact_refresh_log.csv`, `qa_source_health.csv`, and the `qa_*` review tables.

## OpenFEC API

The ETL supports optional OpenFEC API refreshes through:

- `REFRESH_FEC_API=1`
- `FEC_API_KEY=<key>`

Current endpoint families:

- `candidates/search/`
- `committees/`
- `schedules/schedule_e/`

The normalized API extracts supplement the local FEC bulk files and use the same canonical columns, so the Power BI model does not change when the FEC source switches from file-only to API-plus-file.

## Google Civic Information API

The ETL supports optional CivicAPI refreshes through:

- `REFRESH_CIVIC_API=1`
- `GOOGLE_CIVIC_API_KEY=<key>`

Current endpoint families:

- `/elections`
- `/voterinfo`

`/voterinfo` requires address targets. Add approved rows to `data/control/CivicAPI_AddressTargets.csv` before enabling the Civic refresh. CivicAPI provides election, contest, candidate, polling-location, and election-administration context. It does not provide certified final vote totals, so cost-per-vote pages should stay scaffolded until `fact_election_results.csv` is populated from an official results source.

## Power BI Application

Use `powerbi/PowerQuery_CuratedCsvLoaders.pq` to replace raw-model queries with curated CSV queries. Then add:

- Calculated tables from `powerbi/CalculatedTables.dax`.
- Measures from `powerbi/Measures.dax`.
- Relationships from `powerbi/Relationships.txt`.

All dimension-to-fact relationships should remain one-to-many and single direction unless a bridge table explicitly requires otherwise.
