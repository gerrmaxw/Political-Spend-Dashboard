# Build Runbook

Step-by-step instructions to build the Political Spend Dashboard end-to-end
in your Microsoft 365 tenant, following the architecture in
[`MICROSOFT_365_PLAN.md`](./MICROSOFT_365_PLAN.md).

Time estimate: **2-3 weeks of focused work** for a single person.

---

## Phase 0 · Pre-flight (1 hour)

Verify before you start. If any of these are blocked, the corresponding
later step has a fallback noted.

### 0.1 · Tenant capability check

| Check | How | If blocked |
|---|---|---|
| Power Apps Canvas Apps available | https://make.powerapps.com loads and you can create a Canvas App | No fallback — required |
| Power Automate cloud flows | https://make.powerautomate.com loads, "Create" menu shows automated/scheduled flows | No fallback — required |
| Power Automate Desktop installable | Download page at https://learn.microsoft.com/power-automate/desktop-flows/install loads | Use Power Query (M) fallback for ETL (see 3.x note) |
| Power BI Pro license | https://app.powerbi.com loads and you can create a Workspace | No fallback — required |
| SharePoint site-creation rights | https://yourtenant.sharepoint.com → "Create site" works | Use an existing site you own |
| PCF code components enabled | In a Canvas App: Settings → Upcoming features → "Code components for canvas apps" is on | Use SharePoint-embed fallback for viewer (see Phase 7B) |
| Workflows agent in Copilot | https://m365.cloud.microsoft → Copilot → Agents → "Workflows" appears | Author Power Automate flows manually instead |

### 0.2 · API keys

You'll need these stored as Power Automate **secure inputs** or workstation
environment variables — do not commit them.

- **FEC API key** — sign up at https://api.open.fec.gov/developers
- **Google Civic API key** — Google Cloud Console → APIs & Services →
  Civic Information API → Credentials

### 0.3 · Designated ETL workstation

Pick the Windows machine that will run Power Automate Desktop. It needs to
be powered on during refresh windows. Specs: Windows 10/11, 16 GB RAM,
50 GB free disk.

---

## Phase 1 · SharePoint Foundation (2-3 hours)

### 1.1 · Create the site

1. https://yourtenant.sharepoint.com → **Create site** → **Team site**.
2. Name: `Political Spend Dashboard`. Privacy: **Private**.
3. Add yourself and any admins as Owners. No external sharing.

### 1.2 · Create document libraries

In the new site, **Site Contents → New → Document library** for each:

| Library | Purpose |
|---|---|
| `raw` | Weekly Vivvix, FEC bulk, FCC files dropped here |
| `curated` | Outputs from the ETL (`fact_*.csv`, `dim_*.csv`, `qa_*.csv`) |
| `qa` | QA snapshots, mismatch tables, source-health logs |
| `viewer-assets` | Compiled JS bundles + HTML for the SharePoint-embed viewer (only if using Phase 7B fallback) |
| `bundles` | Generated `data.bundle.js`, `political-windows.bundle.js` if you ever need them |

Set retention: 90-day version history on `raw`, infinite on `curated`.

### 1.3 · Create SharePoint lists

**Site Contents → New → List → Blank list** for each. Schemas below — add
each column via **+ Add column**.

#### `RefreshLog`
| Column | Type |
|---|---|
| Title (default, rename to `RunID`) | Single line text |
| StartedAt | Date and time |
| FinishedAt | Date and time |
| TriggeredBy | Single line text |
| Status | Choice: `Running`, `OK`, `Failed`, `Partial` |
| RowsLoaded | Number |
| Notes | Multiple lines of text |

#### `PendingMappings`
| Column | Type |
|---|---|
| Title (rename to `RawAdvertiser`) | Single line text |
| SuggestedCandidate | Single line text |
| SuggestedCommittee | Single line text |
| Confidence | Number (0-1) |
| ReviewStatus | Choice: `Pending`, `Confirmed`, `Remapped`, `Rejected` |
| ReviewerNote | Multiple lines of text |
| RunID | Single line text |

#### `AdvertiserOverrides`
| Column | Type |
|---|---|
| Title (rename to `RawAdvertiser`) | Single line text |
| OverrideTarget | Single line text |
| OverrideType | Choice: `Candidate`, `Committee`, `Issue`, `Government`, `Unknown` |
| EnteredBy | Person |
| EnteredAt | Date and time |

#### `SourceHealth`
| Column | Type |
|---|---|
| Title (rename to `Source`) | Single line text |
| LastLoadedAt | Date and time |
| RowsLoaded | Number |
| Owner | Single line text |
| Status | Choice: `Healthy`, `Stale`, `Failed` |

### 1.4 · Validate

Drop a single test file (any CSV) into `raw`. Confirm it appears. You're done with SharePoint setup.

---

## Phase 2 · ETL Runtime on the Workstation (2-3 hours)

Do these on the designated workstation from 0.3.

### 2.1 · Install Python and Git

1. Install Python 3.11+ from https://python.org (check "Add to PATH").
2. Install Git from https://git-scm.com.
3. Verify in a Command Prompt: `python --version` and `git --version`.

### 2.2 · Clone the repo

```cmd
cd C:\
git clone https://github.com/gerrmaxw/political-spend-dashboard.git
cd political-spend-dashboard
```

### 2.3 · Install Python dependencies

```cmd
python -m pip install -r "Political Spend Dashboard\etl\requirements.txt"
```

If `requirements.txt` doesn't exist yet, install the libraries the ETL
actually uses. From a Command Prompt inside the repo:

```cmd
python -m pip install pandas openpyxl xlsxwriter requests rapidfuzz python-dateutil
```

### 2.4 · Create a working folder structure

```cmd
mkdir C:\PoliticalSpendDashboard\working\raw
mkdir C:\PoliticalSpendDashboard\working\curated
mkdir C:\PoliticalSpendDashboard\working\qa
```

The Desktop flow will sync between SharePoint and these folders.

### 2.5 · Test the ETL manually

Drop a sample raw file into `C:\PoliticalSpendDashboard\working\raw`. Then:

```cmd
set FEC_API_KEY=your-key-here
set GOOGLE_CIVIC_API_KEY=your-key-here
python "Political Spend Dashboard\etl\build_final_weekly_model.py"
```

Confirm curated CSVs appear in the curated folder. Fix any errors before
moving on.

### 2.6 · Install Power Automate Desktop

Download installer from https://learn.microsoft.com/power-automate/desktop-flows/install
and sign in with your work account. Confirm you can create a blank flow.

---

## Phase 3 · Power Automate Desktop Flow (3-4 hours)

This is the flow that actually runs Python. Build it inside the PAD app.

### 3.1 · Create the flow

PAD → **New flow** → Name it `Run-Python-ETL`.

### 3.2 · Build these actions in order

| # | Action | Settings |
|---|---|---|
| 1 | `Get desktop folder` (or just hard-code path) | Variable `WorkingFolder = C:\PoliticalSpendDashboard\working` |
| 2 | `Empty folder` | `%WorkingFolder%\raw` (clean slate each run) |
| 3 | `Run subflow` | **DownloadFromSharePoint** subflow (see 3.3) — pulls latest `raw/*` from SharePoint to local |
| 4 | `Set variable` | `FEC_API_KEY = <secret>` (mark as sensitive) |
| 5 | `Set variable` | `GOOGLE_CIVIC_API_KEY = <secret>` |
| 6 | `Run DOS command` | `cd /d C:\political-spend-dashboard && set FEC_API_KEY=%FEC_API_KEY% && set GOOGLE_CIVIC_API_KEY=%GOOGLE_CIVIC_API_KEY% && python "Political Spend Dashboard\etl\build_final_weekly_model.py"` |
| 7 | `If` | Command exit code = 0 |
| 8 | `Run subflow` | **UploadToSharePoint** subflow (see 3.4) |
| 9 | `Else` | |
| 10 | `Display message` (or HTTP call to cloud flow webhook to log failure) | Log the stderr |
| 11 | `End` | |

### 3.3 · DownloadFromSharePoint subflow

Use the **Browser automation → SharePoint** actions, or the simpler
**Run PowerShell script** approach using the PnP module:

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser -Force
Connect-PnPOnline -Url https://yourtenant.sharepoint.com/sites/PoliticalSpendDashboard -Interactive
Get-PnPFolderItem -FolderSiteRelativeUrl "raw" | ForEach-Object {
  Get-PnPFile -Url $_.ServerRelativeUrl -Path "C:\PoliticalSpendDashboard\working\raw" -FileName $_.Name -AsFile -Force
}
```

### 3.4 · UploadToSharePoint subflow

```powershell
Get-ChildItem "C:\PoliticalSpendDashboard\working\curated" | ForEach-Object {
  Add-PnPFile -Path $_.FullName -Folder "curated" -Values @{} 
}
Get-ChildItem "C:\PoliticalSpendDashboard\working\qa" | ForEach-Object {
  Add-PnPFile -Path $_.FullName -Folder "qa" -Values @{}
}
```

### 3.5 · Test the Desktop flow

Run it manually from PAD. Confirm:
- raw files arrive in working folder,
- Python completes,
- curated CSVs land back in SharePoint `curated/`.

Iterate on errors. Once green, move on.

---

## Phase 4 · Cloud Flows via the Workflows Agent (2-3 hours)

Open Microsoft 365 Copilot → Agents → **Workflows**. Use these exact
prompts; review the generated flow before saving.

### 4.1 · OnUpload flow

Prompt to give the Workflows agent:

> Create a Power Automate flow named **OnUpload-ClassifyAndKick**. Trigger:
> "When a file is created in a SharePoint folder," site
> `Political Spend Dashboard`, folder `raw`. Steps:
> 1. Read the first 2 KB of the file.
> 2. Use a switch on detected header text to classify the source:
>    - contains `Advertiser` and `Spend (USD)` → `Vivvix`
>    - contains `cand_id,cand_name` → `FEC Candidate Summary`
>    - contains `cmte_id,cmte_nm` → `FEC Committee Summary`
>    - contains `sup_opp,can_id` → `FEC Independent Expenditure`
>    - contains `lobbyist` → `Lobbyist`
>    - else → `Unknown`
> 3. Create an item in SharePoint list `RefreshLog` with `RunID =
>    <utcNow as yyyyMMddHHmmss>`, `Status = Running`, `TriggeredBy =
>    upload`, `Notes = detected <source type>`.
> 4. Trigger the Power Automate Desktop flow `Run-Python-ETL`.
> 5. On Desktop-flow success, update the same RefreshLog item to
>    `Status = OK`, `FinishedAt = utcNow`.
> 6. On failure, set `Status = Failed` and post a Teams message to
>    `#political-dashboard-alerts`.

Save, test by uploading a file to `raw`, confirm `RefreshLog` gets a new
row and the Desktop flow runs.

### 4.2 · WeeklyRefresh flow

Prompt:

> Create a Power Automate flow named **WeeklyRefresh**. Trigger:
> Recurrence, weekly on Sunday 06:00 ET. Steps:
> 1. Create a `RefreshLog` item with `RunID = <utcNow>`,
>    `TriggeredBy = schedule`, `Status = Running`.
> 2. Run the Power Automate Desktop flow `Run-Python-ETL` with input
>    parameters `REFRESH_FEC_API=1`, `REFRESH_CIVIC_API=1`.
> 3. On success, call the Power BI REST API
>    `POST /v1.0/myorg/groups/{workspaceId}/datasets/{datasetId}/refreshes`
>    to refresh the dataset.
> 4. Update RefreshLog with `Status = OK`, `FinishedAt = utcNow`.
> 5. On failure, post Teams alert.

You'll fill in workspace and dataset IDs after Phase 5.

### 4.3 · OnMappingApproval flow

Prompt:

> Create a flow named **OnMappingApproval**. Trigger: SharePoint list
> `PendingMappings`, "When an item is modified," only when
> `ReviewStatus` becomes `Confirmed` or `Remapped`. Steps:
> 1. If `ReviewStatus = Confirmed`, create an `AdvertiserOverrides`
>    item with `RawAdvertiser = <RawAdvertiser>`,
>    `OverrideTarget = <SuggestedCandidate or SuggestedCommittee>`,
>    `EnteredBy = current user`, `EnteredAt = utcNow`.
> 2. If `ReviewStatus = Remapped`, expect the reviewer to have edited
>    the suggested target field; use that value.
> 3. Send a confirmation email to the reviewer.

Save and test by manually flipping a `PendingMappings` row to `Confirmed`
and checking that `AdvertiserOverrides` gets a new row.

### 4.4 · Wire RefreshLog into the ETL

The Python ETL needs to read `AdvertiserOverrides` at run time. In
`Political Spend Dashboard/etl/build_final_weekly_model.py`, add a
download step at the top of the run that fetches the list as CSV (the
Desktop flow can do this in step 3 of 3.2 by adding
`Export-PnPListAsCSV -Identity AdvertiserOverrides` before invoking
Python). Save the CSV at `data/control/AdvertiserOverrides.csv`.

---

## Phase 5 · Power BI Model (4-6 hours)

### 5.1 · Workspace + dataflow

1. https://app.powerbi.com → **Workspaces → Create**. Name:
   `Political Spend Dashboard`.
2. In the workspace: **+ New → Dataflow → Add new tables**.
3. Choose **SharePoint folder** connector. URL: site URL from Phase 1.
4. Paste the contents of
   `Political Spend Dashboard/powerbi/PowerQuery_CuratedCsvLoaders.pq`
   into the advanced editor for each table. Repoint the source from
   the original path to `curated/` in SharePoint.
5. **Save & close**, refresh, schedule daily refresh (will be triggered
   by WeeklyRefresh anyway).

### 5.2 · Semantic model

1. In the workspace: **+ New → Semantic model → From dataflow**, pick the
   dataflow above, select all curated tables.
2. Open the dataset in the Power BI service or Power BI Desktop.
3. Paste relationships from
   `Political Spend Dashboard/powerbi/Relationships.txt` — one-to-many,
   single direction.
4. Paste DAX from `Political Spend Dashboard/powerbi/Measures.dax` into
   a new Measures table.
5. Paste calculated tables from
   `Political Spend Dashboard/powerbi/CalculatedTables.dax`.
6. Apply theme from
   `Political Spend Dashboard/powerbi/ComcastAdvertisingTheme.json`:
   **View → Themes → Browse for themes**.
7. Publish back to the workspace.

### 5.3 · Build the chart-only report

Create a thin Power BI report containing ONLY the visuals you plan to
embed in the React shell. From
`Political Spend Dashboard/powerbi/ReportPageBuildSpec.md`, start with:
- Outside Spend by Snapshot (line chart)
- Spend Trend by Week (line/area)
- State map (filled map of total spend by state)

Each visual on its own page. Save and publish.

### 5.4 · Capture IDs

You'll need these for embedding:
- Workspace ID (URL: `/groups/<workspaceId>/`)
- Report ID (URL: `/reports/<reportId>/`)
- Dataset ID (Settings → Datasets → about)

Paste them into the WeeklyRefresh flow (Phase 4.2 step 3).

---

## Phase 6 · Power Apps Admin Shell (6-8 hours)

### 6.1 · Create the Canvas App

https://make.powerapps.com → **+ Create → Blank canvas app** → Tablet
layout → Name: `Political Spend Dashboard`.

### 6.2 · Connect data sources

**Data → Add data**, add:
- SharePoint → site → lists: `RefreshLog`, `PendingMappings`,
  `AdvertiserOverrides`, `SourceHealth`.
- SharePoint → site → libraries: `raw`, `curated`.
- Power BI → workspace → dataset.
- Power Automate → the three flows from Phase 4.

### 6.3 · Build the navigation shell

Add a left nav with two buttons:
- **Admin** → `Navigate(AdminScreen)`
- **Viewer** → `Navigate(ViewerScreen)`

Gate the Admin button with `User().Email in AdminAllowlist`, where
`AdminAllowlist` is a collection you initialize in `App.OnStart`:

```powerfx
Set(AdminAllowlist, ["you@comcast.com", "admin2@comcast.com"])
```

### 6.4 · Build the Admin screen

Mirror the layout from `Admin.html`. Four panels:

#### Upload panel
- **Add attachments** control bound to a hidden form on the `raw` library.
  OnChange: `Patch('raw', Defaults('raw'), {Title: AttachmentControl.Attachments[1].Name})`
- Below it, show the file-type chips. Generate them by reading the file
  headers via the `OnUpload` flow's classification result — the flow
  writes detected source type into RefreshLog, which the app reads.

#### Refresh log table
- Gallery bound to `Sort(RefreshLog, StartedAt, Descending)`.
- Status pill: a label with `Fill = If(ThisItem.Status="OK", Green, ThisItem.Status="Failed", Red, Orange)`.

#### Mapping review table
- Gallery bound to `Filter(PendingMappings, ReviewStatus="Pending")`.
- Two buttons per row: **Confirm** → `Patch(PendingMappings, ThisItem, {ReviewStatus: "Confirmed"})` and **Remap…** → opens a popup with a text input bound to `SuggestedCandidate`.

#### Manual refresh button
- `WeeklyRefresh.Run()`.

### 6.5 · Test

1. Upload a file → confirm RefreshLog row appears, Desktop flow fires,
   curated files appear in SharePoint.
2. Force a low-confidence match in the Python QA step → confirm it
   shows up in the mapping review table.
3. Confirm an override → confirm `AdvertiserOverrides` gets a new row
   and the next ETL run uses it.

---

## Phase 7 · Viewer Embed

Two paths. Try 7A first; fall back to 7B if PCF is disabled.

### Phase 7A · PCF Code Component (preferred, 1-2 days)

#### 7A.1 · Install tooling on a dev machine

```cmd
npm install -g pac-cli
pac auth create --url https://yourtenant.crm.dynamics.com
```

#### 7A.2 · Scaffold the control

```cmd
mkdir PoliticalDashboardControl && cd PoliticalDashboardControl
pac pcf init --namespace ComcastPolitical --name PoliticalDashboard --template field
npm install
```

#### 7A.3 · Wire in the React bundles

Copy these files from the repo into the PCF `assets/` folder:
- `Claude Political Dashboard Design/app.compiled.js`
- `Claude Political Dashboard Design/components.compiled.js`
- `Claude Political Dashboard Design/overview.compiled.js`
- `Claude Political Dashboard Design/prospects.compiled.js`
- `Claude Political Dashboard Design/trend-detail.compiled.js`
- `Claude Political Dashboard Design/race-calendar.compiled.js`
- `Claude Political Dashboard Design/pac-completed.compiled.js`
- `Claude Political Dashboard Design/casestudy-health.compiled.js`
- `Claude Political Dashboard Design/styles.css`

In `index.ts`, in `init()`:

```ts
const container = document.createElement("div");
container.id = "dashboard-root";
this.container.appendChild(container);

// inject the existing data the React app expects
(window as any).__pbBundle = JSON.parse(context.parameters.bundleJson.raw || "{}");
(window as any).__politicalWindowCalendar = JSON.parse(context.parameters.calendarJson.raw || "{}");

// load styles + bundles
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "./styles.css";
this.container.appendChild(link);

["app.compiled.js","components.compiled.js","overview.compiled.js",
 "prospects.compiled.js","trend-detail.compiled.js","race-calendar.compiled.js",
 "pac-completed.compiled.js","casestudy-health.compiled.js"].forEach(src => {
  const s = document.createElement("script");
  s.src = src;
  this.container.appendChild(s);
});
```

Declare `bundleJson` and `calendarJson` as input properties in
`ControlManifest.Input.xml`.

#### 7A.4 · Build and import

```cmd
pac pcf push --publisher-prefix comcast
```

In Power Apps, edit the Canvas App → **Insert → Code components** →
add `PoliticalDashboard`. Bind `bundleJson` to a Power Fx expression that
serializes the Power BI dataset rows to JSON.

### Phase 7B · SharePoint Embed (fallback, 4 hours)

#### 7B.1 · Upload viewer assets

Upload to SharePoint library `viewer-assets`:
- `Claude Political Dashboard Design/Political Dashboard.html`
- All `*.compiled.js` files
- `styles.css`
- `assets/comcast-advertising-logo.png`

#### 7B.2 · Update Political Dashboard.html data source

Edit it so instead of looking for `window.__pbBundle`, it fetches from
the SharePoint `curated/` folder via the REST endpoint:

```html
<script>
  fetch("/sites/PoliticalSpendDashboard/_api/web/GetFolderByServerRelativeUrl('curated')/Files",
        {headers: {Accept: "application/json;odata=verbose"}})
    .then(r => r.json())
    .then(loadCurated);
</script>
```

#### 7B.3 · Embed in Power Apps

In the Canvas App ViewerScreen, add an **HTML text** control or a
**Power Apps web part / iframe**:

```
<iframe src="https://yourtenant.sharepoint.com/sites/PoliticalSpendDashboard/viewer-assets/Political%20Dashboard.html"
        width="100%" height="900" frameborder="0"></iframe>
```

---

## Phase 8 · Embed Power BI Tiles (2-3 hours)

Inside the React shell (PCF or SharePoint-hosted HTML), replace the
hand-rolled SVG chart on each Power BI–friendly panel with a Power BI
embed:

```html
<div id="outside-spend-line" style="height:300px"></div>
<script>
  const config = {
    type: "tile",
    tokenType: 1, // AAD
    accessToken: "<from Power BI REST>",
    embedUrl: "https://app.powerbi.com/embed?...",
    id: "<reportId>",
    settings: { panes: { filters: { visible: false } } }
  };
  powerbi.embed(document.getElementById("outside-spend-line"), config);
</script>
```

Use the **embed for your organization** model. Power Apps' Power BI
control handles AAD token plumbing automatically — easier than wiring
JS embed by hand.

Where to swap React → Power BI:
- Page 03 Spend Trend → embed the Spend Trend visual.
- Page 07 PAC/FEC Breakdown → embed the Outside Spend by Snapshot line.
- Page 05 Race Explorer → embed the state map.

Leave KPI cards, tab strip, support/oppose bars, sliders in React.

---

## Phase 9 · End-to-end validation (1 day)

Walk through this checklist before declaring done:

- [ ] Drop a fresh weekly Vivvix file into SharePoint `raw/`. OnUpload
      fires, RefreshLog row appears with `Status = Running`, then `OK`.
- [ ] Curated CSVs land in SharePoint `curated/` with current date.
- [ ] Power BI dataflow refresh completes; semantic model row counts
      match the curated CSV row counts.
- [ ] Power Apps Admin screen shows the new RefreshLog row with green
      pill.
- [ ] Pending mapping reviewer flow: low-confidence row appears,
      reviewer confirms, `AdvertiserOverrides` gets a row.
- [ ] Viewer renders all 10 pages with current-week data. KPI cards,
      slicers, and the support/oppose bars match the screenshot designs.
- [ ] Embedded Power BI tiles render inside the viewer with no auth
      prompt for in-tenant users.
- [ ] Triggering WeeklyRefresh manually completes end-to-end in <30 min.

---

## Phase 10 · Optional Natural-language Layer (1-2 days)

Only after Phase 9 is green.

1. Copilot Studio → **+ Create → New agent**.
2. Add knowledge source → **Power BI dataset** → pick the dataset from
   Phase 5.
3. Add starter prompts: "Show me Senate races where cable opportunity is
   above $500K", "Which advertisers in PA are spending the most on
   broadcast?", "List won primary candidates with general elections in
   the next 30 days."
4. Publish to Teams. Test with three real sales-rep questions.

---

## Quick reference

| What | Where |
|---|---|
| Site root | `https://yourtenant.sharepoint.com/sites/PoliticalSpendDashboard` |
| ETL repo on workstation | `C:\political-spend-dashboard` |
| Working folder | `C:\PoliticalSpendDashboard\working\{raw,curated,qa}` |
| Desktop flow name | `Run-Python-ETL` |
| Cloud flow names | `OnUpload-ClassifyAndKick`, `WeeklyRefresh`, `OnMappingApproval` |
| Canvas App name | `Political Spend Dashboard` |
| Power BI workspace | `Political Spend Dashboard` |

If anything breaks, RefreshLog and SourceHealth lists are the first
place to look. The Python ETL also writes `qa_source_health.csv` to
SharePoint `qa/` on every run.
