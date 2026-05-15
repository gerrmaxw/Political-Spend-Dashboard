// Paste each query into Power Query Advanced Editor.
// If Parallels maps Mac folders differently, update pProjectFolder only.

// Query: pProjectFolder
let
    Source = "\\Mac\Home\Documents\Codex\2026-05-13\files-mentioned-by-the-user-election\Political Spend Dashboard"
in
    Source

// Query: FactSpendSnapshot
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_spend_snapshot.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"Amount", Currency.Type}, {"GrossSpending", Currency.Type}, {"SourceRowCount", Int64.Type}}, "en-US")
in
    Typed

// Query: FactSpendCurrent
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_spend_current.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"Amount", Currency.Type}, {"GrossSpending", Currency.Type}, {"SourceRowCount", Int64.Type}}, "en-US")
in
    Typed

// Query: FactOutsideSpend
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_outside_spend.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SpendDate", type date}, {"Amount", Currency.Type}}, "en-US")
in
    Typed

// Query: FactPoliticalWindows
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_political_windows.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"WindowOpenDate", type date}, {"ElectionDate", type date}, {"DaysToWindowOpen", Int64.Type}, {"DaysToElection", Int64.Type}}, "en-US")
in
    Typed

// Query: FactCandidateFinance
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_candidate_finance.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"Coverage_Start_Date", type date}, {"Coverage_End_Date", type date}}, "en-US")
in
    Typed

// Query: FactSpendWeeklyActivity
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_spend_weekly_activity.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"WeekOfSpendDate", type date}, {"GrossSpending", Currency.Type}}, "en-US")
in
    Typed

// Query: DimSnapshot
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_snapshot.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"SnapshotWeek", Int64.Type}, {"Cycle", Int64.Type}, {"IsLatestSnapshot", type logical}}, "en-US")
in
    Typed

// Query: DimAdvertiser
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_advertiser.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimAgency
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_agency.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimMediaType
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_media_type.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimState
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_state.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimDMA
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_dma.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimOffice
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_office.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimParty
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_party.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimRaceLevel
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_race_level.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimStation
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_station.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimNetwork
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_network.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimCandidate
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_candidate.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimRace
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_race.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimCommittee
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_committee.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: BridgeAdvertiserEntity
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\bridge_advertiser_entity.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"FinalScore", type number}, {"OverrideFlag", type logical}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: BridgeRaceDMA
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\bridge_race_dma.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"DistrictHouseholdsInDMA", Int64.Type}, {"DMAHouseholds", Int64.Type}}, "en-US")
in
    Typed

// Query: FactElectionResults
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_election_results.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ElectionDate", type date}, {"Votes", Int64.Type}, {"VoteShare", type number}, {"WinnerFlag", type logical}, {"CertifiedFlag", type logical}}, "en-US")
in
    Typed

// Query: DimCaseStudyNotes
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_case_study_notes.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ApprovedForSales", type logical}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: DimDataSource
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_data_source.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"Enabled", type logical}}, "en-US")
in
    Typed

// Query: FactRefreshLog
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_refresh_log.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"RefreshDate", type date}, {"RowsFetched", Int64.Type}}, "en-US")
in
    Typed

// Query: QASourceHealth
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_source_health.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"Enabled", type logical}, {"RawLocationExists", type logical}, {"RowsFetched", Int64.Type}}, "en-US")
in
    Typed

// Query: DimCivicElection
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_civic_election.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ElectionDay", type date}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: FactCivicContest
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_civic_contest.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SourceOfficial", type logical}}, "en-US")
in
    Typed

// Query: DimCivicCandidate
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\dim_civic_candidate.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"OrderOnBallot", Int64.Type}}, "en-US")
in
    Typed

// Query: FactCivicPollingLocation
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\fact_civic_polling_location.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"StartDate", type date}, {"EndDate", type date}, {"Latitude", type number}, {"Longitude", type number}}, "en-US")
in
    Typed

// Query: QASnapshotReconciliation
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_snapshot_reconciliation.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"RowsLoaded", Int64.Type}, {"RowsWithAmount", Int64.Type}, {"RowsWithNonZeroAmount", Int64.Type}, {"TotalAmount", Currency.Type}}, "en-US")
in
    Typed

// Query: QADuplicateKeyCheck
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_duplicate_key_check.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"SourceRows", Int64.Type}, {"Amount", Currency.Type}}, "en-US")
in
    Typed

// Query: QAAdvertiserMatchReview
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_advertiser_match_review.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"FinalScore", type number}, {"OverrideFlag", type logical}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: QALowConfidenceMatches
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_low_confidence_matches.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"FinalScore", type number}, {"OverrideFlag", type logical}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: QAUnmatchedAdvertisers
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_unmatched_advertisers.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"FinalScore", type number}, {"OverrideFlag", type logical}, {"LastUpdated", type date}}, "en-US")
in
    Typed

// Query: QAMissingFieldChecks
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_missing_field_checks.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"MissingOrUnknownRows", Int64.Type}}, "en-US")
in
    Typed

// Query: QAMarketScopeExclusions
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\qa_market_scope_exclusions.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

