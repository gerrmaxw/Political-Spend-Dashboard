# Report Page Build Spec

## Executive Overview
- KPI cards: `[Total Spend]`, `[TV Spend]`, `[Cable Share %]`, `[Cable Opportunity $]`, `[Estimated Wasted Broadcast $]`, `[Zero Cable Count]`.
- Media mix: 100% stacked bar by `DimMediaType[Media Type]` and `[Total Spend]`.
- Detail table: State, DMA, Office, Race Level, Advertiser, Broadcast, Cable, CTV, Total Spend, Cable Share, Opportunity.
- Notes box: prospect logic uses selected TV spend floor and selected cable share target.

## Cable Prospect Finder
- Scatter: X `[Broadcast + CTV Spend]`, Y `[Cable Share %]`, size `[Total Spend]`, legend `DimRaceLevel[Race Level]`.
- Visual filter: `[Cable Prospect Flag] = 1`.
- Reference lines: `[Selected TV Spend Floor]` on X and `[Selected Cable Share Target]` on Y.
- Ranking table: State, DMA, Office, Race Level, Advertiser, Broadcast, CTV, Cable, Cable Share, Opportunity, Waste %, ElectionDate, WindowStatus.

## Advertiser / Candidate Detail
- Drillthrough filters: `DimAdvertiser[Advertiser]`, `DimRace[RaceName]`.
- Cards: Total Spend, Cable Share, Estimated Wasted Broadcast, PAC Support, PAC Oppose.
- Visuals: media mix stacked bar, snapshot line using `[Cumulative Spend as of Snapshot]`, station/network table, election results panel.

## Race Explorer
- Matrix columns: State, DMA, Office, District, ElectionDate, Candidate, Party, Total, Broadcast, Cable, Cable Share, Opportunity, PAC Support, PAC Oppose, Result, Cost Per Vote.
- Add `Trend Breakdown` parameter as grouping switcher.
- Slicers: Cycle, CompletedFlag, Cable Prospect Label.

## Election Calendar / Political Windows
- Gantt/stacked bar: `FactPoliticalWindows[WindowOpenDate]` to `FactPoliticalWindows[ElectionDate]`, grouped by State/DMA.
- Color by `WindowStatus`.
- Detail table: DMA, State, WindowOpenDate, ElectionDate, DaysToElection, current spend, Cable Share, top prospects.

## PAC / FEC Spend Breakdown
- Stacked bar by `FactFECIndependentExpenditures[CommitteeName]`, split by `SupportOppose`.
- Trend line by Date when transaction-level dates are available.
- Matrix by Race/Candidate: paid media spend, PAC support, PAC oppose, net support.

## Completed Elections & Cost Per Vote
- Scatter: X `[Cable Share %]`, Y `[Cost Per Vote]`, size `[Total Spend]`, color `FactElectionResults[Result]`.
- Detail matrix: Candidate, Party, State, Office, Votes, Vote Share, Result, Total Spend, Cost Per Vote.

## Case Study Finder
- Table sorted by `[Case Study Score]`.
- Filters: Office, Result, Party, Cost Per Vote buckets.
- Selection cards: Broadcast waste, targeted efficiency, cost per vote, vote share.

## Data Health / Refresh QA
- Cards: `[Last Snapshot Date]`, `[Current Snapshot Rows]`, `[Unmatched Advertiser Rows]`, `[Unmatched Advertiser %]`, `[Total Spend vs Prior Snapshot]`.
- Tables: `SnapshotFileLoad`, `CandidateCrosswalk`, `UnmatchedAdvertisers`, `DuplicateBusinessKeys`, `DataHealthSummary`.
