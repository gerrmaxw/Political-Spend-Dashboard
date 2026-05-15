# Political Spend Dashboard

Static Comcast Advertising-style political spend dashboard prototype, Python
ETL, and Power BI build assets.

This repository is packaged for Microsoft Copilot App Builder / Power Apps
handoff. It includes the app shell, React source, compiled browser scripts,
Power BI DAX/Power Query assets, Comcast theme JSON, and ETL code. Large raw
spend/FEC files and generated production datasets are intentionally excluded
from GitHub; load those privately through SharePoint, Power BI, or the included
Admin page.

## What To Give Copilot App Builder

Use these files first:

- `Claude Political Dashboard Design/Political Dashboard.html`
- `Claude Political Dashboard Design/Admin.html`
- `Claude Political Dashboard Design/styles.css`
- `Claude Political Dashboard Design/*.jsx`
- `Claude Political Dashboard Design/*.compiled.js`
- `Claude Political Dashboard Design/data.js`
- `Claude Political Dashboard Design/etl.js`
- `Claude Political Dashboard Design/civic-api.js`
- `Claude Political Dashboard Design/assets/comcast-advertising-logo.png`

The default `data.bundle.js` and `political-windows.bundle.js` in this repo are
small sample bundles so the app boots. Replace them with the real generated
bundles, or use `Admin.html` to upload the weekly source files locally.

## Local Preview

```bash
cd "Claude Political Dashboard Design"
python3 serve_dashboard.py
```

Then open:

- Viewer: `http://127.0.0.1:8765/Political%20Dashboard.html`
- Admin uploader: `http://127.0.0.1:8765/Admin.html`

## Data Workflow

1. Keep raw weekly files in SharePoint or another private Microsoft 365
   location.
2. Use `Claude Political Dashboard Design/Admin.html` for browser-side bundle
   creation, or use the Python ETL under `Political Spend Dashboard/etl`.
3. Deploy the generated `data.bundle.js` privately with the app, or connect
   Power BI to the curated workbook/CSV output.
4. Keep CivicAPI enrichment enabled for certified result guidance, then review
   case-study candidates manually.

## Included Power BI Assets

- `Political Spend Dashboard/powerbi/Measures.dax`
- `Political Spend Dashboard/powerbi/ServiceDaxQueryViewInput.dax`
- `Political Spend Dashboard/powerbi/PowerQuery_CuratedCsvLoaders.pq`
- `Political Spend Dashboard/powerbi/ComcastAdvertisingTheme.json`
- `Political Spend Dashboard/powerbi/ReportPageBuildSpec.md`

## Excluded From GitHub

The following are excluded on purpose:

- raw Vivvix/Home Advertiser files
- raw FEC exports
- generated full fact/dimension CSVs
- generated Power BI workbooks
- PBIX files
- local browser/cache/temp files

Those files can contain private, licensed, or bulky data and should stay in
Microsoft 365 storage with appropriate permissions.
