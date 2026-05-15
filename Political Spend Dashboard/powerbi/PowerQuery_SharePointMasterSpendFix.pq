// Drop-in replacement for the current FactSpend_Raw query.
//
// Why this exists:
// - The current query uses Web.Contents() against a personal SharePoint URL.
//   In Power BI Service this often gets routed through gateway/web-source
//   credential handling instead of the native SharePoint cloud connector.
// - Use SharePoint.Files() and set credentials to Organizational Account /
//   OAuth2 in Power BI Service.
// - Do not set a fixed CSV column count; the master spend export may gain or
//   lose tooltip/contact columns.
//
// Power BI Service settings after publishing:
// 1. Semantic model -> Settings -> Gateway and cloud connections.
// 2. Do not bind this SharePoint Online source to an on-premises gateway.
// 3. Data source credentials -> Edit credentials.
// 4. Authentication method: OAuth2 / Organizational account.

section Section1;

shared pSharePointSite =
    "https://indiana-my.sharepoint.com/personal/gerrmaxw_iu_edu";

shared pMasterSpendFileName =
    "Home_Advertiser_data (5).csv";

shared pMasterSpendFolderContains =
    "/Documents/";

shared FactSpend_Raw =
let
    SharePointSource =
        SharePoint.Files(pSharePointSite, [ApiVersion = 15]),

    SpendFileRows =
        Table.SelectRows(
            SharePointSource,
            each [Name] = pMasterSpendFileName
                and Text.Contains([Folder Path], pMasterSpendFolderContains)
        ),

    SpendFileBinary =
        if Table.RowCount(SpendFileRows) = 1 then
            SpendFileRows{0}[Content]
        else if Table.RowCount(SpendFileRows) = 0 then
            error "Master spend file was not found in SharePoint. Check pSharePointSite, pMasterSpendFileName, and pMasterSpendFolderContains."
        else
            error "More than one matching master spend file was found in SharePoint. Narrow pMasterSpendFolderContains.",

    Source =
        Csv.Document(
            SpendFileBinary,
            [
                Delimiter = ",",
                Encoding = 65001,
                QuoteStyle = QuoteStyle.Csv
            ]
        ),

    PromotedHeaders =
        Table.PromoteHeaders(Source, [PromoteAllScalars = true]),

    ChangedType =
        Table.TransformColumnTypes(
            PromotedHeaders,
            {
                {"Election State", type text},
                {"DMA", type text},
                {"Office Type", type text},
                {"Office", type text},
                {"Team Party", type text},
                {"Advertiser", type text},
                {"Agencies", type text},
                {"Networks", type text},
                {"Station", type text},
                {"ATV_MEDIA_TYPE (copy 2)", type text},
                {"Gross Spending/Share $ Suffix ", type text},
                {"Gross Spending/Share % Suffix", type text},
                {"Gross Spending/Share", type number},
                {"no totals tooltip  website", type text},
                {"no totals tooltip address", type text},
                {"no totals tooltip agency", type text},
                {"no totals tooltip email", type text},
                {"no totals tooltip phone", type text},
                {" E-mail", type text},
                {"Agency Website", type text},
                {"Agency", type text},
                {"email_null", type text},
                {"Phone Number", type text},
                {"St Address", type text},
                {"State", type text},
                {"Suite/Unit", type text},
                {"url action website", type text},
                {"website with null", type text},
                {"Zip", Int64.Type},
                {"Amount", Currency.Type},
                {"Gross Spending", Currency.Type}
            },
            [Culture = "en-US", MissingField = MissingField.UseNull]
        ),

    RenamedColumns =
        Table.RenameColumns(
            ChangedType,
            {{"Office Type", "Race Level"}, {"Election State", "State"}, {"Gross Spending", "Gross Spend"}},
            MissingField.Ignore
        ),

    RemovedColumns =
        Table.RemoveColumns(
            RenamedColumns,
            {
                "Gross Spending/Share $ Suffix ",
                "Gross Spending/Share % Suffix",
                "Gross Spending/Share",
                "no totals tooltip  website",
                "no totals tooltip address",
                "no totals tooltip agency",
                "no totals tooltip email",
                "no totals tooltip phone",
                " E-mail",
                "Agency Website",
                "Agency",
                "email_null",
                "Phone Number",
                "St Address",
                "Suite/Unit",
                "url action website",
                "website with null",
                "Zip"
            },
            MissingField.Ignore
        ),

    RenamedColumns2 =
        Table.RenameColumns(
            RemovedColumns,
            {{"ATV_MEDIA_TYPE (copy 2)", "Media Type"}, {"Team Party", "Party"}},
            MissingField.Ignore
        ),

    ReplacedNullAmounts =
        Table.ReplaceValue(
            RenamedColumns2,
            null,
            0,
            Replacer.ReplaceValue,
            {"Amount", "Gross Spend"}
        ),

    AddedIndex =
        Table.AddIndexColumn(ReplacedNullAmounts, "RowID", 1, 1, Int64.Type),

    Final =
        Table.ReorderColumns(
            AddedIndex,
            {"RowID", "State", "DMA", "Race Level", "Office", "Party", "Advertiser", "Agencies", "Networks", "Station", "Media Type", "Amount", "Gross Spend"},
            MissingField.Ignore
        )
in
    Final;
