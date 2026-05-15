# FEC + CivicAPI Refresh Strategy

Recommendation: use Python to pull FEC and CivicAPI data on a schedule, write raw extracts, normalize into curated CSVs, and let Power BI read only the curated outputs.

Do not have Power BI call live APIs directly. API pulls need retry handling, entity consolidation, dedupe, support/oppose normalization, manual override preservation, source-health logging, and QA snapshots.

## Cadence

- Independent expenditures: daily during active political windows; weekly otherwise.
- Electioneering communications: daily during active windows; weekly otherwise.
- Communication costs: daily during active windows; weekly otherwise.
- Candidate and committee summaries: weekly, with extra pulls after major filing deadlines.
- Lobbyist and leadership files: weekly.
- Civic elections: weekly.
- Civic voterInfo address targets: only when address targets are added or election IDs change.

## Storage Pattern

The implemented ETL writes OpenFEC API supplements to:

- `data/raw/fec_api/api_candidate_summary_2026.csv`
- `data/raw/fec_api/api_committee_summary_2026.csv`
- `data/raw/fec_api/api_independent_expenditure_2026.csv`

It writes CivicAPI extracts to:

- `data/raw/civic_api/api_civic_elections.csv`
- `data/raw/civic_api/api_civic_contests.csv`
- `data/raw/civic_api/api_civic_candidates.csv`
- `data/raw/civic_api/api_civic_polling_locations.csv`

Then the ETL should promote the latest approved raw extracts into:

- `data/curated/fact_outside_spend.csv`
- `data/curated/dim_candidate.csv`
- `data/curated/dim_committee.csv`
- `data/curated/fact_candidate_finance.csv`
- `data/curated/dim_civic_election.csv`
- `data/curated/fact_civic_contest.csv`
- `data/curated/dim_civic_candidate.csv`
- `data/curated/fact_civic_polling_location.csv`
- `data/curated/dim_data_source.csv`
- `data/curated/fact_refresh_log.csv`
- `data/curated/qa_source_health.csv`
- `data/qa/*`

## Run Toggles

Default runs are file-only and deterministic. To pull APIs before the model build:

```bash
REFRESH_FEC_API=1 FEC_API_KEY='your-openfec-key' \
REFRESH_CIVIC_API=1 GOOGLE_CIVIC_API_KEY='your-google-civic-key' \
'/Users/gerritmaxwell/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' \
'Political Spend Dashboard/etl/build_final_weekly_model.py'
```

`data/control/CivicAPI_AddressTargets.csv` controls Civic voterInfo lookups. Leave it empty until there are approved addresses/election IDs to query.

## QA Rules

- Record endpoint, run timestamp, row count, and total amount by source type.
- Compare current run totals to prior run totals.
- Keep all raw files immutable by run date.
- Never overwrite manual advertiser mapping overrides.
- Surface unmatched, low-confidence, and changed entity matches in QA outputs.
- Treat CivicAPI as contest/context data, not certified results. Keep `FactElectionResults` empty until official results are loaded.
