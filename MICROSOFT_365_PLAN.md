# Microsoft 365 Build Plan

Architecture plan for the Political Spend Dashboard, constrained to tools
available in this Microsoft 365 tenant **without Azure admin access**.

## Constraints

- No Azure subscription admin (no Azure Functions, App Service, Logic Apps,
  Data Factory, Container Apps, Fabric capacity provisioning).
- Available tooling:
  - Power Apps (Canvas + PCF code components if tenant-enabled)
  - Power Automate (cloud flows, via the Copilot **Workflows agent** for
    flow authoring; Power Automate Desktop for local Python execution)
  - Power BI (Pro / Premium-per-user, dataflows, embedded tiles)
  - SharePoint Online (document libraries, lists, pages)
  - Copilot Studio / Copilot App Builder / Copilot Agent Builder
    (optional natural-language layer)
- Existing assets to preserve:
  - `Political Spend Dashboard/etl/*.py` — ~3,400 lines of Python ETL
    (Vivvix normalization, FEC + Civic API pulls, fuzzy matching, QA).
  - `Claude Political Dashboard Design/*.jsx` + `*.compiled.js` —
    ~3,300 lines of React across 10 dashboard pages.
  - `Political Spend Dashboard/powerbi/*` — DAX measures, Power Query
    loaders, Comcast theme, relationships.

## High-Level Architecture

```
SharePoint (raw weekly drops)
    │
    ▼
Power Automate cloud flow  ── triggers on file upload / weekly schedule
    │   (authored via the Workflows agent)
    ▼
Power Automate Desktop  ── runs the existing Python ETL unchanged
    │   (attended or hosted RPA on a designated workstation)
    ▼
SharePoint (curated CSVs + QA snapshots + refresh log)
    │
    ├──▶ Power BI dataflow + semantic model
    │        │
    │        ├──▶ Embedded Power BI tiles (charts, time series)
    │        └──▶ Power BI XLSX export
    │
    └──▶ React viewer (existing code, hosted in SharePoint or PCF)
             │
             ▼
        Power Apps Canvas App shell
             ├── Admin screen (upload, QA review, approvals)
             └── Viewer screen (React UI + embedded Power BI tiles)
```

## Admin Side

### Orchestration — Power Automate, authored via Workflows agent

Use the Copilot **Workflows agent** to scaffold and maintain three cloud
flows:

1. **OnUpload** — SharePoint "When a file is created" trigger on the
   `raw/` library. Inspects headers via Office Script or "Get file content,"
   classifies the source type (Vivvix, FEC Candidate Summary, FEC IE,
   Lobbyist, etc.), writes a row to the `RefreshLog` SharePoint list, then
   calls the Desktop flow.
2. **WeeklyRefresh** — Recurrence trigger (weekly during off-window, daily
   during active political windows per the existing
   `FEC_API_REFRESH_STRATEGY.md` cadence). Calls the Desktop flow with
   `REFRESH_FEC_API=1` and `REFRESH_CIVIC_API=1` parameters.
3. **OnMappingApproval** — Triggered when a reviewer approves or remaps an
   entity in the Power Apps Admin screen. Writes the override into a
   SharePoint list (`AdvertiserOverrides`) that the Python ETL reads on
   next run.

Why the Workflows agent: it generates these flows from natural-language
descriptions and keeps them up to date as the SharePoint schema evolves.
Output is a normal Power Automate flow — no lock-in.

### Python execution — Power Automate Desktop (no Azure required)

The existing Python ETL (`build_final_weekly_model.py`, `api_sources.py`,
`normalize_spend.py`) runs unchanged on a designated Windows workstation
under Power Automate Desktop's **Run Python script** action.

- **Attended PAD** (free) on a dedicated workstation that stays on during
  refresh windows. Simplest, no extra licensing.
- **Hosted RPA** (premium add-on) if the refresh must run fully
  unattended without a host machine. Does not need Azure admin.

The Desktop flow:

1. Pulls latest raw files from SharePoint to a local working folder.
2. Runs `python build_final_weekly_model.py` with the same env-var toggles
   documented in `FEC_API_REFRESH_STRATEGY.md`.
3. Uploads `data/curated/*.csv` and `data/qa/*` back to SharePoint.
4. Returns a JSON status payload to the calling cloud flow.

If hosted RPA licensing isn't available and the workstation can't stay on,
fallback option: port the Python normalization into **Power Query (M)** in
a Power BI dataflow — Power Query has `Table.FuzzyJoin` and `Web.Contents`
for the FEC/Civic API calls. This is a larger rewrite (~2-3 weeks) and
loses some of the manual-override preservation logic; only take this path
if Desktop is blocked.

### Admin UI — Power Apps Canvas App

Replaces `Claude Political Dashboard Design/Admin.html`:

- **Upload tile** — Attachment / File control writing to SharePoint
  `raw/` library. Mirrors the auto-fingerprint chips from the existing
  Admin screen by inspecting file headers (Office Script called from
  Power Automate).
- **Refresh log table** — Bound to the `RefreshLog` SharePoint list;
  shows the same per-source status pills as the Data Health page.
- **Mapping review screen** — Bound to a `PendingMappings` SharePoint
  list populated by the Python QA step. Reviewer confirms or remaps;
  writes through the `OnMappingApproval` flow.
- **Manual refresh button** — Calls the WeeklyRefresh flow on demand.

### Curated → Semantic model — Power BI dataflow

Existing `PowerQuery_CuratedCsvLoaders.pq` is repointed at the SharePoint
curated folder. Existing `Measures.dax`, `CalculatedTables.dax`, and
`Relationships.txt` are loaded into the dataset unchanged. Refresh is
chained off the cloud flow's success step (Power BI REST `Refresh Dataset`
action).

## Viewer Side

### Shell — Power Apps Canvas App

Hosts both the Admin screen above and the Viewer screen below. Provides
AAD authentication, navigation chrome, and access control (sales reps see
viewer only; admins see both).

### Viewer rendering — existing React, embedded

Of the two embed options, pick based on tenant policy:

1. **PCF code component** (preferred when "code components" is tenant-
   enabled). The compiled bundles in `Claude Political Dashboard Design/`
   (`app.compiled.js`, `components.compiled.js`, etc.) are wrapped as a
   PCF control. Pixel-for-pixel match with the screenshots. Data is passed
   in as a dataset binding from a Power BI dataset or SharePoint list.
2. **SharePoint page + Embed web part** (fallback if PCF is disabled).
   `Political Dashboard.html` and its compiled bundles are deployed to a
   SharePoint document library; the Power Apps shell embeds that page in
   an iframe. Slightly more friction on auth and resize, but zero rebuild.

### Heavy charts — embedded Power BI tiles

Where Power BI clearly outperforms hand-rolled React (the cumulative
`Outside Spend by Snapshot` line chart, the `Spend Trend` time series,
the geographic map on the Race Explorer), embed the corresponding Power BI
tile via the Power BI JS SDK inside the React shell. The custom chrome
(KPI cards, tab strip, support/oppose bars with party pills, case-study
score slider) stays in React.

This is the "mix" — React for the parts the screenshots show that Power BI
can't replicate, Power BI for the parts where its math/drill engine wins.

### Optional NL layer — Copilot Studio or Agent Builder

Once the Power BI semantic model is published, point a Copilot Studio
agent at it for the Case Study Finder's natural-language queries
("show me Senate races in PA where cable opportunity is above $500K").
This is additive; not on the critical path.

## Implementation Phases

1. **Phase 1 — Plumbing (no UI changes).** Stand up SharePoint libraries,
   author the three Workflows-agent flows, install Power Automate Desktop
   on the chosen workstation, smoke-test a full refresh end-to-end with
   the existing Python.
2. **Phase 2 — Power BI dataflow.** Repoint `PowerQuery_CuratedCsvLoaders.pq`
   at SharePoint, load measures + relationships, publish dataset, validate
   measures against the current static bundle.
3. **Phase 3 — Admin app.** Power Apps Canvas App with upload, refresh log,
   and mapping review. Decommission `Admin.html`.
4. **Phase 4 — Viewer embed.** PCF wrap (or SharePoint embed) of the React
   bundles inside the same Canvas App. Wire data source from the curated
   CSVs (or the Power BI dataset via REST). Begin embedding Power BI tiles
   for the heavy charts.
5. **Phase 5 — NL layer (optional).** Copilot Studio agent on the published
   dataset for the Case Study Finder.

## Open Questions

1. Is "code components" (PCF) enabled in the tenant? If not, the viewer
   uses the SharePoint-embed fallback.
2. Is hosted RPA in the Power Automate Premium SKU available, or does the
   weekly refresh run on an attended workstation?
3. Does the audience need write-back (annotate races, flag case studies)?
   If yes, the Power Apps shell adds SharePoint-list-backed forms next to
   the React viewer.
