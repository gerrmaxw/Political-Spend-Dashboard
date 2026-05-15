// Direct folder-based pipeline for the weekly .xlsb spend snapshots.
// Create these as separate Power Query queries in the order shown.

// Query: pSpendSnapshotsFolder
let
    Source = "\\Mac\Home\Documents\Codex\2026-05-13\files-mentioned-by-the-user-election\powerbi_implementation\data\Spend Snapshots"
in
    Source

// Query: SnapshotManifest
let
    Source = Csv.Document(File.Contents("\\Mac\Home\Documents\Codex\2026-05-13\files-mentioned-by-the-user-election\powerbi_implementation\data\SnapshotManifest.csv"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),
    PromotedHeaders = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),
    Typed = Table.TransformColumnTypes(PromotedHeaders, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}, {"IncludeFlag", type logical}}, "en-US")
in
    Typed

// Query: stg_SpendFiles
let
    Source = Folder.Files(pSpendSnapshotsFolder),
    KeepXlsb = Table.SelectRows(Source, each Text.Lower([Extension]) = ".xlsb" and not Text.StartsWith([Name], "~$")),
    MergeManifest = Table.NestedJoin(KeepXlsb, {"Name"}, SnapshotManifest, {"Name"}, "Manifest", JoinKind.Inner),
    ExpandManifest = Table.ExpandTableColumn(MergeManifest, "Manifest", {"SnapshotDate", "Cycle", "IncludeFlag"}, {"SnapshotDate", "Cycle", "IncludeFlag"}),
    Included = Table.SelectRows(ExpandManifest, each [IncludeFlag] = true),
    KeepColumns = Table.SelectColumns(Included, {"Content", "Name", "SnapshotDate", "Cycle"})
in
    KeepColumns

// Query: stg_SpendClean
let
    Source = stg_SpendFiles,
    AddWorkbook = Table.AddColumn(Source, "Workbook", each Excel.Workbook([Content], true), type table),
    ExpandWorkbook = Table.ExpandTableColumn(AddWorkbook, "Workbook", {"Name", "Data", "Item", "Kind", "Hidden"}, {"SheetName", "Data", "Item", "Kind", "Hidden"}),
    KeepSheet = Table.SelectRows(ExpandWorkbook, each [Kind] = "Sheet" and [Item] = "Home_Advertiser_data (3)"),
    ExpandData = Table.ExpandTableColumn(
        KeepSheet,
        "Data",
        {"Election State", "DMA", "Office Type", "Office", "Team Party", "Advertiser", "Agencies", "Networks", "Station", "ATV_MEDIA_TYPE (copy 2)", "Amount", "Gross Spending", "Gross Spending/Share"},
        {"State", "DMA", "Race Level", "Office", "Party", "Advertiser", "Agency", "Network", "Station", "Media Type", "AmountRaw", "GrossSpendingRaw", "GrossSpendingShareRaw"}
    ),
    CleanText = Table.TransformColumns(ExpandData, {
        {"State", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"DMA", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Race Level", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Office", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Party", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Advertiser", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Agency", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Network", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Station", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text},
        {"Media Type", each if _ = null or Text.Trim(Text.From(_)) = "" then "Unknown" else Text.Trim(Text.From(_)), type text}
    }),
    AddAmount = Table.AddColumn(CleanText, "Amount", each try Number.From([AmountRaw]) otherwise try Number.From([GrossSpendingRaw]) otherwise try Number.From([GrossSpendingShareRaw]) otherwise null, Currency.Type),
    KeepSpend = Table.SelectRows(AddAmount, each [Amount] <> null and [Amount] <> 0),
    AddRowBusinessKey = Table.AddColumn(
        KeepSpend,
        "RowBusinessKey",
        each Text.Lower(Text.Combine({[Advertiser], [State], [DMA], [Office], [Race Level], [Party], [Media Type], [Station], [Network]}, "|")),
        type text
    ),
    AddTypes = Table.TransformColumnTypes(AddRowBusinessKey, {{"SnapshotDate", type date}, {"Cycle", Int64.Type}}),
    RenameSnapshot = Table.RenameColumns(AddTypes, {{"Name", "SourceFile"}}),
    KeepColumns = Table.SelectColumns(RenameSnapshot, {"SnapshotDate", "Cycle", "SourceFile", "RowBusinessKey", "Advertiser", "Agency", "State", "DMA", "Office", "Race Level", "Party", "Media Type", "Station", "Network", "Amount"})
in
    KeepColumns

// Query: FactSpendSnapshot
let
    Source = stg_SpendClean
in
    Source

// Query: FactSpendCurrent
let
    LatestSnapshot = List.Max(FactSpendSnapshot[SnapshotDate]),
    Source = Table.SelectRows(FactSpendSnapshot, each [SnapshotDate] = LatestSnapshot)
in
    Source
