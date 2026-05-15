# Copilot App Builder Handoff

Build a Microsoft 365 app that recreates the static dashboard in
`Claude Political Dashboard Design/Political Dashboard.html`.

## App Goals

- Comcast Advertising visual style: white canvas, light gray panels, blue
  action color, orange opportunity accent, restrained typography.
- Main pages: Executive Overview, Cable Prospect Finder, Spend Trend,
  Advertiser/Candidate Detail, Race Explorer, Election Calendar, PAC/FEC
  Breakdown, Completed Elections, Case Study Finder, Data Health.
- Preserve the Admin upload workflow so weekly source files can produce a new
  dashboard bundle without exposing raw data externally.

## Required UI Behaviors

- Cable Prospect Finder must include a Cable Opportunity slider.
- Cable Prospect Finder must not use a media-type filter.
- Prospects must be filtered to Comcast political-window markets.
- Completed/lost primary races should be excluded from active prospect lists.
- Agency is supplemental; do not exclude advertisers with missing agency.
- Include an Entity Type filter with Candidate, Committee/PAC, Issue/Ballot,
  Government/Other, Unknown.
- Election Calendar uses the maintained political-window workbook, not CivicAPI.
- CivicAPI is used for certified result guidance and case-study triage.
- State map may show all 50 states; other pages focus on calendar markets.

## Data Contract

The viewer expects:

- `window.__pbBundle` from `data.bundle.js`
- `window.__politicalWindowCalendar` from `political-windows.bundle.js`

Core advertiser fields:

- `advertiser`, `advertiserType`, `agency`, `state`, `dma`, `office`
- `raceLevel`, `party`
- `broadcast`, `cable`, `ctv`, `digital`, `radio`, `total`
- `tvSpend`, `bcCtvSpend`, `cableShare`
- `windowStatus`, `daysToElection`, `inWindow`
- optional CivicAPI result fields: `electionResult`, `civicRace`

The included bundles are synthetic samples. In production, generate replacements
from private weekly files using `Admin.html` or the Python ETL.
