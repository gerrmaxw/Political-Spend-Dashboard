# Power BI Report Build Spec

Use 16:9 canvas, 1600 x 900. Move global slicers into a bookmark-driven filter drawer.

## 1. Executive Overview
KPI cards: Latest Snapshot Date, Total Spend, Broadcast + CTV Spend, Cable Spend, Cable Share %, Cable Opportunity $, Zero-Cable Advertisers, Prospects In Political Window.
Visuals: 100% stacked media bar, Top 10 Cable Opportunity table, State/DMA/Office matrix, Cable Share by Race Level.

## 2. Cable Prospect Finder
Scatter: X `[Broadcast + CTV Spend]`, Y `[Cable Share %]`, Size `[Total Spend]`, Legend `DimRaceLevel[RaceLevel]`, Details `DimAdvertiser[Advertiser]`.
Filter to `[Cable Prospect Flag] = 1`. Add TV spend floor and cable share target slicers.

## 3. Spend Trend
Line chart: X `DimSnapshot[SnapshotDate]`, Y `[Cumulative Spend as of Snapshot]`, Legend `Trend Breakdown`.
Column chart: X `DimSnapshot[SnapshotDate]`, Y `[Weekly Added Spend]`, Legend `Trend Breakdown`.

## 4. Advertiser / Candidate Detail
Make this a drillthrough page on Advertiser, Candidate, and Race. Include media mix, snapshot line, station/network table, outside spend table, and mapping block.

## 5. Race Explorer
Matrix by Race, Candidate, Party, State, District, Office, Advertiser, Total Spend, Broadcast, Cable, Cable Share, Cable Opportunity, Outside Support, Outside Oppose.

## 6. Election Calendar + Political Windows
Gantt-style visual from WindowOpenDate to ElectionDate by Market, colored by WindowStatus. Add Act Now table filtered to In Window or Opening Next 30.

## 7. PAC / FEC Spend Breakdown
Stacked bar by Committee split Support/Oppose, outside spend trend by SpendDate, race matrix, purpose/payee detail table.

## 8. Completed Elections + Cost Per Vote
Scaffold now. Do not fake election results. Use FactElectionResults when official certified results are loaded. CivicAPI can supply contest context, but not official final vote totals.

## 9. Case Study Finder
Use `[Case Study Score]` to sort likely proof points. Load `CaseStudyNotes.xlsx` for narrative status, owner, approved-for-sales, and deck link.

## 10. Data Health + Mapping Review
Cards: Latest Snapshot Date, Rows Loaded, Total Spend, Unmatched Advertisers, Low Confidence Matches, Duplicate Key Count, Political Windows Loaded, Outside Spend Rows.
Tables: snapshot reconciliation, advertiser match review, unmatched advertiser spend, missing field checks, source health, API refresh log.
