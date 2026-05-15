# Political Spend Power BI Implementation Pack

Generated for: `/Users/gerritmaxwell/Downloads/Political Spend Dashboard-1.pbix`

## What was implemented

- Seeded `Spend Snapshots` folder with `Election Spend 5.11.xlsb`.
- Created `SnapshotManifest.csv` with `SnapshotDate = 2026-05-11`, `Cycle = 2026`, and `IncludeFlag = TRUE`.
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

- Raw spend rows read: 354,995
- Spend rows with nonzero amount: 69,648
- Blank/zero amount rows skipped: 285,347
- Seed snapshot total spend: $1,855,150,737.00

## Curated table row counts

- `BridgeRaceDMA`: 522
- `CandidateCrosswalk`: 10,994
- `DataHealthSummary`: 7
- `DimAdvertiser`: 4,273
- `DimAgency`: 616
- `DimCandidate`: 3,575
- `DimDMA`: 218
- `DimMediaType`: 5
- `DimNetwork`: 1,128
- `DimOffice`: 23
- `DimParty`: 3
- `DimRace`: 510
- `DimRaceLevel`: 5
- `DimSnapshot`: 1
- `DimState`: 53
- `DimStation`: 5,267
- `DuplicateBusinessKeys`: 514
- `FactElectionResults`: 26
- `FactFECIndependentExpenditures`: 457
- `FactPoliticalWindows`: 508
- `FactSpendCurrent`: 69,648
- `FactSpendSnapshot`: 69,648
- `SnapshotFileLoad`: 1
- `UnmatchedAdvertisers`: 22,786
- `stg_SpendClean`: 69,648
