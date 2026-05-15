// Paste each query below into Power Query Advanced Editor.
// The pProjectFolder value is set for Parallels' default Mac shared-folder path.
// If your Windows VM maps Mac files differently, update pProjectFolder only.

// Query: pProjectFolder
let
    Source = "\\Mac\Home\Documents\Codex\2026-05-13\files-mentioned-by-the-user-election\powerbi_implementation"
in
    Source

// Query: stg_SpendClean
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\stg_SpendClean.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"Amount", Currency.Type}, {"CandidateMatchScore", type number}}, "en-US")
in
    Typed

// Query: FactSpendSnapshot
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\FactSpendSnapshot.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"Amount", Currency.Type}, {"CandidateMatchScore", type number}}, "en-US")
in
    Typed

// Query: FactSpendCurrent
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\FactSpendCurrent.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"Amount", Currency.Type}, {"CandidateMatchScore", type number}}, "en-US")
in
    Typed

// Query: FactPoliticalWindows
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\FactPoliticalWindows.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"WindowOpenDate", type date}, {"ElectionDate", type date}, {"DaysToElection", Int64.Type}}, "en-US")
in
    Typed

// Query: FactFECIndependentExpenditures
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\FactFECIndependentExpenditures.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"Amount", Currency.Type}, {"Date", type date}}, "en-US")
in
    Typed

// Query: FactElectionResults
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\FactElectionResults.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ElectionDate", type date}, {"Votes", Int64.Type}, {"VoteShare", type number}, {"Margin", type number}}, "en-US")
in
    Typed

// Query: BridgeRaceDMA
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\BridgeRaceDMA.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"DistrictDMAWeight", type number}, {"DistrictHouseholdsInDMA", type number}, {"DMAHouseholds", type number}, {"IsHouseholdShareEstimated", type logical}}, "en-US")
in
    Typed

// Query: CandidateCrosswalk
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\CandidateCrosswalk.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"CandidateMatchScore", type number}}, "en-US")
in
    Typed

// Query: UnmatchedAdvertisers
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\UnmatchedAdvertisers.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"Amount", Currency.Type}, {"Rows", Int64.Type}}, "en-US")
in
    Typed

// Query: DuplicateBusinessKeys
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DuplicateBusinessKeys.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"DuplicateRows", Int64.Type}, {"Amount", Currency.Type}}, "en-US")
in
    Typed

// Query: SnapshotFileLoad
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\SnapshotFileLoad.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"IncludeFlag", type logical}, {"RawRows", Int64.Type}, {"SpendRows", Int64.Type}, {"TotalSpend", Currency.Type}}, "en-US")
in
    Typed

// Query: DataHealthSummary
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DataHealthSummary.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ValueNumber", type number}}, "en-US")
in
    Typed

// Query: DimAdvertiser
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimAdvertiser.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimAgency
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimAgency.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimMediaType
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimMediaType.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"IsCable", type logical}, {"IsBroadcast", type logical}, {"IsCTV", type logical}, {"IsDigital", type logical}, {"IsRadio", type logical}, {"IsGeoTargetable", type logical}}, "en-US")
in
    Typed

// Query: DimState
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimState.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimDMA
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimDMA.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimOffice
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimOffice.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimRaceLevel
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimRaceLevel.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimParty
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimParty.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimStation
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimStation.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimNetwork
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimNetwork.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimCandidate
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimCandidate.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {}, "en-US")
in
    Typed

// Query: DimRace
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimRace.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"ElectionDate", type date}, {"CompletedFlag", type logical}}, "en-US")
in
    Typed

// Query: DimSnapshot
let
    Source = Csv.Document(File.Contents(pProjectFolder & "\data\curated\DimSnapshot.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"IsLatestSnapshot", type logical}}, "en-US")
in
    Typed

