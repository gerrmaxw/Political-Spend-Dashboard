# Claude Design Brief: Overview and Cable Prospect Pages

## Goal

Design and build the first two Power BI report pages for the Political Spend Dashboard:

1. Executive Overview
2. Cable Prospect Finder

The dashboard is for Comcast Advertising sales teams. It should help sellers quickly understand where political advertisers are spending, where cable is underrepresented, and which advertiser/market opportunities should be acted on first.

Use the curated Power BI model. Dashboard-facing State and DMA fields should come from the political window calendar market list, not raw unmatched spend DMAs.

## Comcast Advertising Theme Direction

Use a clean Comcast Advertising-inspired style: modern, simple, high-contrast, sales-friendly, and not overly decorative.

Use these colors from the existing Power BI theme:

- Page background: `#F5F7FA`
- Visual background: `#FFFFFF`
- Primary text: `#111827`
- Secondary text: `#4B5563`
- Borders and dividers: `#E5E7EB`
- Primary accent blue: `#005EB8`
- Green positive/action accent: `#00A859`
- Yellow caution accent: `#FFB600`
- Orange opportunity accent: `#F37021`
- Red alert accent: `#E4002B`
- Purple secondary accent: `#6A1B9A`

General styling:

- Canvas: 16:9, 1600 x 900.
- Use Segoe UI or the closest available Power BI default.
- Use white visual surfaces with 4 px radius and light borders.
- Keep cards and charts aligned to an 8 px grid.
- Use concise visual titles and one-sentence descriptions on every visual.
- Format currency as `$0.0M` or `$0.0K` depending on scale.
- Format percentages as `0.0%`.
- Do not use pie or donut charts.
- Avoid decorative gradients, large hero blocks, or marketing-page layouts.
- Make all chart titles understandable without training.
- Use clear sales language: "opportunity", "prospect", "in window", "low cable share", "broadcast/CTV spend".

## Global Page Structure

Each page should follow this structure:

- Top header bar, 56 px high.
- Header title on the left.
- Last snapshot date and current filter summary on the right when possible.
- KPI row under the header, about 100 px high.
- Main visual area in the middle.
- Action/detail table at the bottom.
- Slicers in a compact left or right filter drawer.

Global slicers to use on these two pages:

- State: `DimState[State]`
- DMA / Market: `DimDMA[DMA]`
- Office: `DimOffice[Office]`
- Race Level: `DimRaceLevel[RaceLevel]`
- Party: `DimParty[Party]`
- Advertiser: `DimAdvertiser[Advertiser]`
- Agency: `DimAgency[Agency]`
- Window Status: `FactPoliticalWindows[WindowStatus]`

Do not use `DimMediaType[MediaType]` as a slicer on the Cable Prospect Finder page.

## Required Measures

Use these existing measures where available:

- `[Latest Snapshot Date]`
- `[Total Spend]`
- `[Broadcast Spend]`
- `[Cable Spend]`
- `[CTV Spend]`
- `[Digital Spend]`
- `[Radio Spend]`
- `[TV Spend]`
- `[Broadcast + CTV Spend]`
- `[Cable Share %]`
- `[Selected TV Spend Floor]`
- `[Selected Cable Share Target]`
- `[Target Cable Spend]`
- `[Cable Opportunity $]`
- `[No Cable Flag]`
- `[Cable Prospect Flag]`
- `[Cable Prospect Label]`
- `[Political Windows Loaded]`
- `[Outside Spend]`
- `[Unmatched Advertiser Count]`

Add these if they do not already exist:

```DAX
Zero-Cable Advertisers =
CALCULATE (
    DISTINCTCOUNT ( DimAdvertiser[AdvertiserKey] ),
    FILTER ( VALUES ( DimAdvertiser[AdvertiserKey] ), [No Cable Flag] = 1 )
)

Cable Prospects =
CALCULATE (
    DISTINCTCOUNT ( DimAdvertiser[AdvertiserKey] ),
    FILTER ( VALUES ( DimAdvertiser[AdvertiserKey] ), [Cable Prospect Flag] = 1 )
)

Prospect Total Spend =
CALCULATE (
    [Total Spend],
    FILTER ( VALUES ( DimAdvertiser[AdvertiserKey] ), [Cable Prospect Flag] = 1 )
)

Prospect Cable Opportunity $ =
CALCULATE (
    [Cable Opportunity $],
    FILTER ( VALUES ( DimAdvertiser[AdvertiserKey] ), [Cable Prospect Flag] = 1 )
)
```

## Cable Opportunity Slider

Add a numeric what-if / disconnected parameter table named:

`Cable Opportunity Floor Slider`

Suggested values:

- Minimum: `0`
- Maximum: `250000`
- Increment: `5000`
- Default: `25000`

Create these measures:

```DAX
Selected Cable Opportunity Floor =
SELECTEDVALUE ( 'Cable Opportunity Floor Slider'[Value], 25000 )

Meets Cable Opportunity Floor Flag =
IF ( [Cable Opportunity $] >= [Selected Cable Opportunity Floor], 1, 0 )
```

On the Cable Prospect Finder page, show this as a horizontal slider labeled:

Title: `Minimum Cable Opportunity`

Description: `Only show advertisers with at least this much estimated cable upside.`

Use this flag as a visual-level filter on the scatter and prospect table:

`[Meets Cable Opportunity Floor Flag] = 1`

## Page 1: Executive Overview

### Page Purpose

Give leadership and sales managers a fast read on total political spend, media mix, cable share, and the biggest cable opportunity areas.

### Header

Title:

`Executive Overview`

Subtitle:

`Current political spend, media mix, and cable opportunity across markets in the political window calendar.`

Header right text:

`Latest snapshot: [Latest Snapshot Date]`

### KPI Cards

Create six KPI cards across the top. Each card must have a title and a short description/caption.

1. Title: `Total Spend`
   Description: `All current spend in calendar-matched political markets.`
   Value: `[Total Spend]`

2. Title: `Broadcast + CTV Spend`
   Description: `TV-style spend that can indicate cable targeting upside.`
   Value: `[Broadcast + CTV Spend]`

3. Title: `Cable Spend`
   Description: `Current spend already allocated to cable.`
   Value: `[Cable Spend]`

4. Title: `Cable Share`
   Description: `Cable as a share of broadcast, cable, and CTV spend.`
   Value: `[Cable Share %]`

5. Title: `Cable Opportunity`
   Description: `Estimated spend needed to reach the selected cable share target.`
   Value: `[Cable Opportunity $]`

6. Title: `Zero-Cable Advertisers`
   Description: `Advertisers with broadcast or CTV spend and no cable spend.`
   Value: `[Zero-Cable Advertisers]`

Card styling:

- White background.
- Light gray border.
- KPI value in charcoal.
- Use orange accent for `Cable Opportunity`.
- Use red accent for `Zero-Cable Advertisers`.
- Use green accent only for favorable or action-ready metrics.

### Main Visuals

#### Visual 1: Media Mix By Spend

Visual type:

100% stacked bar chart.

Title:

`Media Mix By Spend`

Description:

`Shows how current political spend is distributed across broadcast, cable, CTV, digital, and radio.`

Fields:

- Axis: `DimMediaType[MediaType]`
- Value: `[Total Spend]`

Notes:

- Do not use a pie chart.
- Sort by spend descending.
- Use the theme colors consistently.
- Add data labels as percentages if readable.

#### Visual 2: Top Cable Opportunities

Visual type:

Table or matrix.

Title:

`Top Cable Opportunities`

Description:

`Advertisers with the largest estimated gap between current cable spend and target cable mix.`

Columns:

- `DimAdvertiser[Advertiser]`
- `DimState[State]`
- `DimDMA[DMA]`
- `DimOffice[Office]`
- `[Broadcast Spend]`
- `[CTV Spend]`
- `[Cable Spend]`
- `[Cable Share %]`
- `[Cable Opportunity $]`
- `[Cable Prospect Label]`

Sorting:

- Sort descending by `[Cable Opportunity $]`.

Conditional formatting:

- `[Cable Share %]`: red below target, yellow near target, green above target.
- `[Cable Opportunity $]`: orange data bars.
- `[Cable Prospect Label]`: use labels `Zero Cable`, `Low Cable`, `Cable In Mix`, `No TV Spend`.

#### Visual 3: Market Opportunity Matrix

Visual type:

Matrix.

Title:

`Market Opportunity Matrix`

Description:

`Compares spend and cable share by state, market, and office so sellers can prioritize territories.`

Rows:

- `DimState[State]`
- `DimDMA[DMA]`
- `DimOffice[Office]`

Values:

- `[Total Spend]`
- `[Broadcast Spend]`
- `[CTV Spend]`
- `[Cable Spend]`
- `[Cable Share %]`
- `[Cable Opportunity $]`

Notes:

- Keep row density high but readable.
- Use subtle alternating row shading.
- Freeze or keep headers visible if possible.

#### Visual 4: Cable Share By Race Level

Visual type:

Bar chart.

Title:

`Cable Share By Race Level`

Description:

`Highlights which race types are relying less on cable within the TV media mix.`

Fields:

- Axis: `DimRaceLevel[RaceLevel]`
- Value: `[Cable Share %]`

Reference line:

- Add a constant/reference line for `[Selected Cable Share Target]` if Power BI supports it.

### Overview Page Notes Box

Add a small text box near the bottom or side:

Title:

`How To Read Opportunity`

Description:

`Cable opportunity is calculated for advertisers spending on broadcast or CTV whose cable share is below the selected target. It is intended as a prioritization signal, not a booked-revenue forecast.`

## Page 2: Cable Prospect Finder

### Page Purpose

This is the main weekly sales action page. It should answer:

- Which advertisers are spending materially on broadcast or CTV?
- Which advertisers have low or zero cable?
- Which prospects are inside or near political windows?
- Which accounts should sellers contact first?

### Header

Title:

`Cable Prospect Finder`

Subtitle:

`Prioritized advertiser opportunities based on broadcast/CTV spend, cable share, and political window timing.`

Header right text:

`Latest snapshot: [Latest Snapshot Date]`

### Required Change: Remove Media Type Filter

Do not show a media type slicer on this page.

Do not add `DimMediaType[MediaType]` as a page filter.

Reason:

`The page compares media types inside the measures. Filtering to one media type would break cable share and opportunity logic.`

If a media type filter exists from a copied page, remove it.

### Required Sliders

Add three compact controls in the filter/control area.

1. Title: `Minimum TV Spend`
   Description: `Sets the minimum broadcast plus CTV spend needed to qualify as a prospect.`
   Field: `TV Spend Floor Slider[Value]`
   Measure: `[Selected TV Spend Floor]`

2. Title: `Cable Share Target`
   Description: `Sets the target cable share used to calculate opportunity.`
   Field: `Cable Share Target Slider[Value]`
   Measure: `[Selected Cable Share Target]`

3. Title: `Minimum Cable Opportunity`
   Description: `Filters to advertisers with at least this much estimated cable upside.`
   Field: `Cable Opportunity Floor Slider[Value]`
   Measure: `[Selected Cable Opportunity Floor]`

Make the Cable Opportunity slider visually prominent enough for sellers to find quickly. Use orange accent `#F37021`.

### KPI Cards

Create six KPI cards across the top.

1. Title: `Cable Prospects`
   Description: `Advertisers meeting the spend, cable share, and opportunity thresholds.`
   Value: `[Cable Prospects]`

2. Title: `Zero-Cable Prospects`
   Description: `Prospects with broadcast or CTV spend and no cable spend.`
   Value: `[Zero-Cable Advertisers]`

3. Title: `Prospect Spend`
   Description: `Total current spend from filtered cable prospects.`
   Value: `[Prospect Total Spend]`

4. Title: `Broadcast + CTV Spend`
   Description: `Prospect spend currently weighted toward broadcast and CTV.`
   Value: `[Broadcast + CTV Spend]`

5. Title: `Cable Opportunity`
   Description: `Estimated cable upside after applying the selected target and floor.`
   Value: `[Prospect Cable Opportunity $]`

6. Title: `Average Cable Share`
   Description: `Average cable share across the visible prospect set.`
   Value: `[Cable Share %]`

### Main Scatter Plot

Visual type:

Scatter chart.

Title:

`Broadcast/CTV Spend vs. Cable Share`

Description:

`Each dot is an advertiser. The best prospects are high on broadcast/CTV spend and low on cable share.`

Fields:

- X-axis: `[Broadcast + CTV Spend]`
- Y-axis: `[Cable Share %]`
- Size: `[Total Spend]`
- Legend: `DimRaceLevel[RaceLevel]`
- Details: `DimAdvertiser[Advertiser]`
- Tooltips:
  - `DimAdvertiser[Advertiser]`
  - `DimAgency[Agency]`
  - `DimState[State]`
  - `DimDMA[DMA]`
  - `DimOffice[Office]`
  - `[Broadcast Spend]`
  - `[CTV Spend]`
  - `[Cable Spend]`
  - `[Cable Share %]`
  - `[Cable Opportunity $]`
  - `FactPoliticalWindows[WindowStatus]`

Visual filters:

- `[Cable Prospect Flag] = 1`
- `[Meets Cable Opportunity Floor Flag] = 1`

Reference lines:

- Vertical line: `[Selected TV Spend Floor]`
- Horizontal line: `[Selected Cable Share Target]`

Axis labels:

- X-axis: `Broadcast + CTV Spend`
- Y-axis: `Cable Share`

Formatting:

- Use blue `#005EB8` and orange `#F37021` prominently.
- Keep dots semi-transparent enough to handle overlap.
- Do not use media type as legend or filter.

### Prospect Action Table

Visual type:

Table or matrix.

Title:

`Ranked Prospect List`

Description:

`Seller action list sorted by estimated cable opportunity. Use this table for account prioritization.`

Columns:

- `DimAdvertiser[Advertiser]`
- `DimAgency[Agency]`
- `DimState[State]`
- `DimDMA[DMA]`
- `DimOffice[Office]`
- `DimRaceLevel[RaceLevel]`
- `[Broadcast Spend]`
- `[CTV Spend]`
- `[Cable Spend]`
- `[Cable Share %]`
- `[Cable Opportunity $]`
- `[Cable Prospect Label]`
- `FactPoliticalWindows[WindowStatus]`
- `FactPoliticalWindows[DaysToElection]`

Sorting:

- Sort descending by `[Cable Opportunity $]`.

Visual filters:

- `[Cable Prospect Flag] = 1`
- `[Meets Cable Opportunity Floor Flag] = 1`

Conditional formatting:

- `[Cable Opportunity $]`: orange data bars.
- `[Cable Share %]`: red below selected target.
- `[Cable Prospect Label]`: red for `Zero Cable`, orange for `Low Cable`, gray for `Cable In Mix`.
- `WindowStatus`: green for `In Window`, yellow for `Opening Next 30`, gray for `Future`, muted gray for `Completed`.

### Secondary Visual: Prospect Mix By Market

Visual type:

Bar chart or matrix.

Title:

`Prospects By Market`

Description:

`Shows where the most actionable cable opportunities are concentrated.`

Fields:

- Axis/Rows: `DimDMA[DMA]`
- Values:
  - `[Cable Prospects]`
  - `[Cable Opportunity $]`

Sort:

- Descending by `[Cable Opportunity $]`.

### Cable Prospect Notes Box

Add a plain text explanation box:

Title:

`Prospect Logic`

Description:

`A cable prospect has enough broadcast plus CTV spend to matter, a cable share at or below the selected target, and cable opportunity above the selected floor. Media type filtering is intentionally removed because the page compares media types inside the measures.`

## Titles And Descriptions Standard

Every visual must have:

- A short title.
- A one-sentence description in smaller secondary text.
- Clear axis labels.
- Clear table column names.
- Tooltips that explain the seller-relevant context.

Use title case for visual titles. Use sentence case for descriptions.

Examples:

- Good title: `Top Cable Opportunities`
- Good description: `Advertisers with the largest estimated gap between current cable spend and target cable mix.`
- Avoid: `Sum of Amount by MediaType`
- Avoid: unexplained acronyms unless they are already common to Comcast Advertising sellers.

## Final Acceptance Checklist

Before considering the two pages complete:

- Executive Overview uses only calendar-scoped State and DMA/Market fields.
- Cable Prospect Finder has no media type slicer or media type page filter.
- Cable Prospect Finder includes the `Minimum Cable Opportunity` slider.
- Scatter plot filters to cable prospects and the selected opportunity floor.
- Every KPI, chart, table, slicer, and notes box has a title and plain-English description.
- All currency and percentage formatting is seller-ready.
- The page looks consistent with the Comcast Advertising-inspired theme.
- No pie or donut charts are used.
- Tables are sorted by action priority, not alphabetically by default.
