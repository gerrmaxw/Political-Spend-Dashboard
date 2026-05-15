# Power BI Build Instructions — Political Spend Dashboard

**For:** Claude Cowork, building inside Power BI Desktop
**Files to use:**

- `uploads/Political Spend Dashboard-2.pbix` — the existing workbook. Open this; do not start a new file.
- `uploads/Political_Spend_Curated_Model_2026-05-13_PowerBI_NamedTables.xlsx` — the curated model data. Already wired to the .pbix; only re-import if the data model is missing the tables listed below.
- `uploads/ComcastAdvertisingTheme.json` — the dashboard theme. Import via **View → Themes → Browse for themes…**
- `assets/comcast-advertising-logo.png` — header logo. Drop into Page 1 + Page 2 via **Insert → Image**.

**Reference design:** `Political Dashboard.html` in this project shows the exact target layout for both pages. Open it side-by-side while building.

**Scope of this brief:** only the first two report pages — **01 Executive Overview** and **02 Cable Prospect Finder**. Leave the other tabs (Spend Trend, Advertiser Detail, Race Explorer, Election Calendar, PAC/FEC, Completed Elections, Case Study, Data Health) as empty placeholders for now.

---

## 0. Pre-flight

1. Open `Political Spend Dashboard-2.pbix`.
2. Confirm these tables exist in the **Fields** pane. If any are missing, stop and flag — the curated model is stale:
   - `DimAdvertiser`, `DimAgency`, `DimDMA`, `DimOffice`, `DimState`, `DimRaceLevel`, `DimParty`, `DimMediaType`, `DimSnapshot`, `FactPoliticalWindows`, `FactSpendSnapshot`
3. Confirm these measures exist (they live on `FactSpendSnapshot` or a `_Measures` table). List below in section 1 — anything missing, create using the DAX provided there.
4. Apply the theme: **View → Themes → Browse for themes…** → select `ComcastAdvertisingTheme.json`. Save.
5. Set canvas size on both pages: **Format pane (page background) → Canvas settings → Type: Custom, Width: 1600, Height: 900**. Vertical alignment: Top. Page background: `#F5F7FA`.

---

## 1. Required measures

Verify each is present. If a measure is missing, create it on the `_Measures` table using the DAX below. Naming must match exactly — the theme and conditional formatting rules reference the names verbatim.

### Already in the model (verify only)

```
[Latest Snapshot Date]
[Total Spend]
[Broadcast Spend]
[Cable Spend]
[CTV Spend]
[Digital Spend]
[Radio Spend]
[TV Spend]                         // = [Broadcast Spend] + [Cable Spend] + [CTV Spend]
[Broadcast + CTV Spend]
[Cable Share %]                    // DIVIDE([Cable Spend], [TV Spend])
[Selected TV Spend Floor]
[Selected Cable Share Target]
[Target Cable Spend]
[Cable Opportunity $]
[No Cable Flag]
[Cable Prospect Flag]
[Cable Prospect Label]
[Political Windows Loaded]
[Outside Spend]
[Unmatched Advertiser Count]
```

### Add if not present

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

### Cable Opportunity Floor Slider — new what-if parameter

**Modeling tab → New parameter → Numeric range.**

- Name: `Cable Opportunity Floor Slider`
- Data type: Whole number
- Minimum: `0`
- Maximum: `250000`
- Increment: `5000`
- Default: `25000`
- **Check "Add slicer to this page" = OFF.** We'll place it manually on page 2.

After Power BI generates the parameter table, add these two measures on it:

```DAX
Selected Cable Opportunity Floor =
SELECTEDVALUE ( 'Cable Opportunity Floor Slider'[Cable Opportunity Floor Slider], 25000 )

Meets Cable Opportunity Floor Flag =
IF ( [Cable Opportunity $] >= [Selected Cable Opportunity Floor], 1, 0 )
```

Verify the two existing slider parameters are also present: `TV Spend Floor Slider` and `Cable Share Target Slider`. If either is missing, re-create with:

- TV Spend Floor: min 0, max 500000, increment 5000, default 50000
- Cable Share Target: min 0.05, max 0.50, increment 0.01, default 0.20

---

## 2. Global page-level scaffolding (both pages)

Each page gets the same chrome before any visuals.

### 2.1 Top header bar (56–64 px tall, full width)

Insert a **Rectangle shape** at `X=0, Y=0, W=1600, H=64`. Fill `#FFFFFF`, border `#E5E7EB` 1 px bottom only (use a 1 px high `#E5E7EB` rectangle at `Y=63` if Power BI doesn't allow per-side border).

Inside the header:
1. **Insert → Image →** `assets/comcast-advertising-logo.png`. Place at `X=24, Y=14, H=36, W=auto` (the asset is ~3.9:1 so width ≈ 140). Maintain aspect.
2. **Insert → Text box** for page title at `X=190, Y=18`:
   - Page 1 text: `Political Spend Dashboard`, Segoe UI Semibold 14, color `#111827`
   - On second line in the same text box, smaller: `Political & Issue · v3.2 · curated PBI model`, Segoe UI 10, color `#4B5563`
3. **Insert → Text box** at the far right (`X=1280, Y=20, W=300`), right-aligned. Bind the latest snapshot text by inserting a **Card** instead and using `[Latest Snapshot Date]` formatted as `MMM d, yyyy` — set Card category label OFF, callout 11 pt Semibold `#111827`, prefix with literal "Latest snapshot · " via a text box overlay if needed.

### 2.2 Page tabs (bottom, 36 px)

Power BI's native page tabs are fine — just rename them so the displayed names match the design:

- `01 Executive Overview`
- `02 Cable Prospect Finder`
- `03 Spend Trend` (hide or leave blank for now)
- … through `10 Data Health`

Hide page numbers if they appear duplicated. Active tab visual is Power BI default; do not custom-style.

### 2.3 Slicer drawer (left, 240 px wide)

Insert a white rectangle from `X=0, Y=64, W=240, H=836` (covers from below header to top of native tab strip). Border right `#E5E7EB`, no fill change.

Inside, place these slicers vertically stacked. Each slicer:
- Type: **Dropdown** (single-select unless noted)
- Header off
- Visual title via separate text box above, Segoe UI Semibold 10, `#4B5563`, uppercase, letter-spacing 0.04em
- Height ~26 px

Slicers, top to bottom (Y positions start at 90, spacing 56 px per slicer including label):

1. `State`           — field `DimState[State]`
2. `DMA / Market`    — field `DimDMA[DMA]`
3. `Office`          — field `DimOffice[Office]`
4. `Race Level`      — field `DimRaceLevel[RaceLevel]`
5. `Party`           — field `DimParty[Party]`
6. `Agency`          — field `DimAgency[Agency]`
7. `Window Status`   — field `FactPoliticalWindows[WindowStatus]`

**Critical:** on **Page 2 (Cable Prospect Finder), do NOT add a `DimMediaType[MediaType]` slicer.** If one exists from a copied page, delete it. The cable share and opportunity measures compare media types internally; filtering to one would break the math.

At the bottom of the drawer (Y≈770), insert a text box:

> **Scope** Calendar-matched markets only. Unmatched spend is excluded from page-level KPIs.
>
> Political windows loaded: `[Political Windows Loaded]`
> Unmatched advertisers: `[Unmatched Advertiser Count]`

(Use inline cards or measure-bound text boxes for the two numbers.)

---

## 3. Page 1 — Executive Overview

Place the main content in the area `X=240..1600, Y=64..864` (left of slicers covered above, above tabs).

### 3.1 Page title block (Y=72..140)

Two text boxes inside the content area:

- `Executive Overview` — Segoe UI Semibold 20, `#111827`
- `Current political spend, media mix, and cable opportunity across markets in the political window calendar.` — Segoe UI 11, `#4B5563`, max width 760 px

Right-aligned at Y=72: a measure-bound text box showing `Latest snapshot [Latest Snapshot Date]`.

### 3.2 KPI row (Y=146..246, six cards equally distributed across X=256..1584)

Use **Card** visuals (not multi-row card). Each card:

- Background `#FFFFFF`, border `#E5E7EB` 1 px, corner radius 4
- Width 220 px, height 96 px, gap 8 px
- Title text via **separate text box** above the data label (Power BI cards don't have a true title slot above) — Segoe UI Semibold 11, `#111827`
- Data label: Segoe UI Semibold 24, font color per accent below
- Category label OFF
- Description text via small text box at bottom of card: Segoe UI 10, `#4B5563`

| # | Title                  | Measure                          | Value color | Description                                                              |
|---|------------------------|----------------------------------|-------------|--------------------------------------------------------------------------|
| 1 | Total Spend            | `[Total Spend]`                  | `#111827`   | All current spend in calendar-matched political markets.                 |
| 2 | Broadcast + CTV Spend  | `[Broadcast + CTV Spend]`        | `#111827`   | TV-style spend that signals cable targeting upside.                      |
| 3 | Cable Spend            | `[Cable Spend]`                  | `#111827`   | Current spend already allocated to cable.                                |
| 4 | Cable Share            | `[Cable Share %]`                | `#111827`   | Cable as a share of broadcast, cable, and CTV spend.                     |
| 5 | Cable Opportunity      | `[Cable Opportunity $]`          | `#F37021`   | Estimated spend needed to reach the selected cable share target.         |
| 6 | Zero-Cable Advertisers | `[Zero-Cable Advertisers]`       | `#E4002B`   | Advertisers with broadcast or CTV spend and no cable spend.              |

Cards 5 and 6 also get a 3 px left accent stripe in their respective colors. Achieve via a small rectangle shape `W=3, H=96, X=cardLeft` on top of the card border.

**Currency format:** `$0.0,,"M"` for millions, switch to `$0.0,"K"` if value < 1M. (Cards in PBI: Format pane → Callout value → Display units = Auto, Decimal places = 1.)
**Percent format:** `0.0%`.

### 3.3 Visual 1 — Media Mix By Spend (Y=258..458, X=256..900)

- **Visual type:** Stacked bar chart (horizontal), single bar, set to 100% stacked.
  - Power BI doesn't have a true single-row 100% bar — the cleanest equivalent is **100% Stacked Bar Chart** with one constant on Y-axis. Trick: in Power Query, add a calculated column `One = 1` on `DimMediaType` and put `One` on the Y-axis. Sort the legend by `[Total Spend]` descending.
- **Title text box** above visual: `Media Mix By Spend` (Segoe UI Semibold 12, `#111827`)
- **Description text box** below title: `How current political spend distributes across broadcast, cable, CTV, digital, and radio.` (Segoe UI 10.5, `#4B5563`)
- **Y-axis:** `One`. Hide labels.
- **X-axis:** `[Total Spend]`. Hide.
- **Legend:** `DimMediaType[MediaType]`, position Bottom-center.
- **Data colors** (legend):
  - Broadcast `#008CC3`
  - Cable `#00A859`
  - CTV `#6A1B9A`
  - Digital `#F37021`
  - Radio `#FFB600`
- **Data labels:** ON, position Center, percent of total, decimals 1, color white.

Below the 100% bar, add a small **Table** visual with 5 rows showing each media type, its `[Total Spend]` $, and its share %. Borderless, alternating row 0 shading. This duplicates the legend in seller-readable form.

**Do NOT use a pie or donut chart.**

### 3.4 Visual 2 — Cable Share By Race Level (Y=258..458, X=916..1584)

- **Visual type:** Bar chart (horizontal).
- Title: `Cable Share By Race Level`
- Description: `Race types relying less on cable within the TV media mix. Dashed line is the selected cable share target.`
- **Y-axis:** `DimRaceLevel[RaceLevel]`. Show all categories.
- **X-axis:** `[Cable Share %]`, format `0.0%`.
- **Sort:** by `[Cable Share %]` descending.
- **Bar colors:** map each race level to the palette in `RACE_COLORS` below. Easiest: in Power BI, set Data colors → Conditional formatting → Field value → bind to a `RaceLevelColor` column on `DimRaceLevel` (add this column if missing).

  ```
  Federal Senate     #005EB8
  Federal House      #6A1B9A
  Governor           #00A859
  Statewide Office   #F37021
  State Legislature  #FFB600
  Mayor / Local      #4B5563
  Ballot Measure     #E4002B
  ```

- **Reference line:** Analytics pane → Constant line. Value = `[Selected Cable Share Target]`. Style: dashed, color `#4B5563`, label "Cable share target" on right side. Power BI only allows static constants on this line, so create a measure-driven version: add the measure to a separate text annotation overlaid at the correct X position. If Power BI build supports dynamic reference lines via Analytics pane (Pro/Premium), use `[Selected Cable Share Target]` directly.

### 3.5 Visual 3 — Top Cable Opportunities table (Y=474..864, X=256..900)

- **Visual type:** Table (NOT matrix).
- Title: `Top Cable Opportunities`
- Description: `Advertisers with the largest estimated gap between current cable spend and the target cable mix. Sorted by opportunity.`
- **Columns** (in order):
  1. `DimAdvertiser[Advertiser]`
  2. `DimState[State]`
  3. `DimDMA[DMA]`
  4. `[Broadcast Spend]` (rename column header to `Bcast $`)
  5. `[CTV Spend]` (`CTV $`)
  6. `[Cable Spend]` (`Cable $`)
  7. `[Cable Opportunity $]` (`Cable Opp ↓`)
  8. `[Cable Prospect Label]` (`Label`)
- **Sort:** `[Cable Opportunity $]` descending.
- **Visual-level filter:** `[Cable Opportunity $]` is > 0. Top N: top 12 by `[Cable Opportunity $]`.
- **Header style:** background `#111827`, text `#FFFFFF`, Segoe UI Semibold 10. Values row Segoe UI 10, alternating row background `#FAFBFC`.
- **Conditional formatting:**
  - `[Cable Opportunity $]` → Data bars, color `#F37021`, fill direction Left to right, transparency 80%, hide axis.
  - `[Cable Prospect Label]` → Background by rule:
    - `Zero Cable` → bg `#FBD7DE`, text `#E4002B`, bold
    - `Low Cable` → bg `#FDE3D2`, text `#B14A0D`, bold
    - `Cable In Mix` → bg `#F3F4F6`, text `#4B5563`, bold
    - `No TV Spend` → bg `#F3F4F6`, text `#6B7280`, bold
    - Render as pill: cell border-radius 10 px isn't supported in PBI tables, so accept rectangular chip style.
  - `[Cable Share %]` not in this table (intentional — see Page 2 for the seller deep dive).

### 3.6 Visual 4 — Market Opportunity Matrix (Y=474..864, X=916..1584)

- **Visual type:** Matrix.
- Title: `Market Opportunity Matrix`
- Description: `Spend and cable share by state, market, and office. Sorted by cable opportunity within each parent.`
- **Rows:** `DimState[State]` → `DimDMA[DMA]` → `DimOffice[Office]` (drill-down hierarchy).
- **Values:**
  1. `[Total Spend]`
  2. `[Broadcast Spend]`
  3. `[CTV Spend]`
  4. `[Cable Spend]`
  5. `[Cable Share %]`
  6. `[Cable Opportunity $]`
- **Sort:** within each level, descending by `[Cable Opportunity $]`.
- **Row headers:** show all three levels expanded (`+` icon collapsed by default optional). Stepped layout OFF so each level indents. State row bg `#EEF2F7`, DMA row bg `#F7F9FC`, office row bg `#FFFFFF` with row text color `#4B5563`.
- **Conditional formatting on `[Cable Share %]`:** background color rule (against target `[Selected Cable Share Target]`):
  - `< target * 0.6` → `#FBD7DE` bg, `#E4002B` text
  - `< target` → `#FFF3D6` bg, `#8A6500` text
  - `>= target` → `#E0F4EA` bg, `#06633B` text
- **Conditional formatting on `[Cable Opportunity $]`:** text color `#F37021`, bold.
- Subtotals OFF on State and DMA rows (the parent row already shows the aggregate).

### 3.7 Notes box — How To Read Opportunity (Y=872..900 or in unused corner)

Insert a thin **Text box** at the bottom of the content area, full width minus drawer.

- Background `#FAFBFC`, border-left 3 px `#005EB8`, border `#E5E7EB` 1 px other sides, corner radius 4.
- Title: `How To Read Opportunity` — Segoe UI Semibold 11, `#111827`
- Body: `Cable opportunity is calculated for advertisers spending on broadcast or CTV whose cable share is below the selected target. It is a prioritization signal for sellers, not a booked-revenue forecast.` Segoe UI 10.5, `#4B5563`.

---

## 4. Page 2 — Cable Prospect Finder

Same header + slicer drawer as Page 1 (copy-paste, then **remove any MediaType slicer** as noted above).

### 4.1 Page title block (Y=72..140)

- Title: `Cable Prospect Finder` — Segoe UI Semibold 20
- Subtitle: `Prioritized advertiser opportunities based on broadcast/CTV spend, cable share, and political window timing.`
- Right: `Latest snapshot [Latest Snapshot Date]`

### 4.2 KPI row (Y=146..246, six cards)

Same card style as Page 1. Use these values:

| # | Title                  | Measure                            | Value color  | Description                                                              |
|---|------------------------|------------------------------------|--------------|--------------------------------------------------------------------------|
| 1 | Cable Prospects        | `[Cable Prospects]`                | `#008CC3`    | Advertisers meeting the spend, cable share, and opportunity thresholds.  |
| 2 | Zero-Cable Prospects   | `[Zero-Cable Advertisers]` *       | `#E4002B`    | Prospects with broadcast or CTV spend and no cable spend.                |
| 3 | Prospect Spend         | `[Prospect Total Spend]`           | `#111827`    | Total current spend from filtered cable prospects.                       |
| 4 | Broadcast + CTV Spend  | `[Broadcast + CTV Spend]` *        | `#111827`    | Prospect spend currently weighted toward broadcast and CTV.              |
| 5 | Cable Opportunity      | `[Prospect Cable Opportunity $]`   | `#F37021`    | Estimated cable upside after applying the selected target and floor.     |
| 6 | Average Cable Share    | `[Cable Share %]`                  | `#111827`    | Average cable share across the visible prospect set.                     |

\* Cards 2 and 4 are subject to the same page-level filter as the page itself (see §4.6) — they automatically scope to prospects when that filter is applied. For card 6, prefer `[Cable Share %]` evaluated over the prospect set. If a separate `Prospect Cable Share %` measure is more accurate, create one:

```DAX
Prospect Cable Share % =
CALCULATE (
    [Cable Share %],
    FILTER ( VALUES ( DimAdvertiser[AdvertiserKey] ), [Cable Prospect Flag] = 1 )
)
```

### 4.3 Slider row (Y=258..328, three controls)

Three **horizontal slicer** visuals, single-value slider mode (not range). Each slicer is its own card-styled container ~440 px wide:

1. **Minimum TV Spend** — slicer on `'TV Spend Floor Slider'[TV Spend Floor Slider]`. Format value as `$0.0,"K"`. Description text box below: `Sets the minimum broadcast plus CTV spend needed to qualify as a prospect.`
2. **Cable Share Target** — slicer on `'Cable Share Target Slider'[Cable Share Target Slider]`. Format as `0%`. Description: `Sets the target cable share used to calculate opportunity.`
3. **Minimum Cable Opportunity** — slicer on `'Cable Opportunity Floor Slider'[Cable Opportunity Floor Slider]`. Format `$0.0,"K"`. Description: `Only show advertisers with at least this much estimated cable upside.`

**Slider #3 is visually prominent:** border `1 px solid #F37021`, outer glow 0 0 0 1 px `#FDE3D2`, slider handle color `#F37021`, value label color `#F37021` Semibold 13. Sliders #1 and #2 use default blue (`#008CC3`).

Each slicer title text (above the bar) is `Segoe UI Semibold 11` `#111827`. Disable the slicer's built-in header.

### 4.4 Main grid (Y=340..664)

Three quadrants:

#### 4.4.1 Scatter — Broadcast/CTV Spend vs. Cable Share (left half full height, X=256..960)

- **Visual type:** Scatter chart.
- Title: `Broadcast/CTV Spend vs. Cable Share`
- Description: `Each dot is an advertiser. The best prospects are high on broadcast/CTV spend and low on cable share — the orange zone in the upper right.`
- **Details:** `DimAdvertiser[Advertiser]` (so each advertiser is one bubble).
- **X-axis:** `[Broadcast + CTV Spend]`. Label: `Broadcast + CTV Spend`. Format `$0,"K"`.
- **Y-axis:** `[Cable Share %]`. Label: `Cable Share`. Format `0%`. Set max to `[Selected Cable Share Target] * 1.6` or 0.30, whichever is greater.
- **Size:** `[Total Spend]`.
- **Legend:** `DimRaceLevel[RaceLevel]`. Colors per the table in §3.4. Position: bottom.
- **Visual-level filters:**
  - `[Cable Prospect Flag] = 1`
  - `[Meets Cable Opportunity Floor Flag] = 1`
- **Reference lines** (Analytics pane):
  - Vertical line on X at `[Selected TV Spend Floor]` — color `#F37021`, dashed, label "TV floor" top-right of line.
  - Horizontal line on Y at `[Selected Cable Share Target]` — color `#F37021`, dashed, label "target" right end.
  - Power BI doesn't render dynamic measure-driven reference lines in all SKUs; if blocked, set a Constant line equal to the slider default and document that it won't reflect slider movement in tooltips.
- **Marker formatting:** transparency 38%, border 1 px white.
- **Tooltip page:** create a custom tooltip page (or set per-data-point tooltip fields) containing in order — Advertiser, Agency, State, DMA, Office, Broadcast Spend, CTV Spend, Cable Spend, Cable Share %, Cable Opportunity $, Window Status.
- **Do NOT include `DimMediaType[MediaType]` anywhere on this visual.**

#### 4.4.2 Prospects By Market (top-right, X=976..1584, Y=340..504)

- **Visual type:** Bar chart (horizontal) or matrix.
- Title: `Prospects By Market`
- Description: `Top markets where actionable cable opportunities concentrate. Sorted by cable opportunity.`
- **Y-axis:** `DimDMA[DMA]`
- **X-axis:** `[Prospect Cable Opportunity $]` (rename column header to `Cable Opp`)
- **Secondary values:** `[Cable Prospects]` shown as data label on the right or as a second column if matrix.
- **Sort:** descending by `[Prospect Cable Opportunity $]`. Top N filter = 6.
- **Bar color:** `#F37021` solid.
- **Visual-level filter:** same as scatter — `[Cable Prospect Flag] = 1` AND `[Meets Cable Opportunity Floor Flag] = 1`.

#### 4.4.3 Prospect Logic notes (bottom-right, X=976..1584, Y=512..664)

Text box / multi-row card explainer. Static-ish content:

- Title: `Prospect Logic`
- Body composed of 3 rules + a footnote:
  - 1️⃣ **Enough TV spend** — Broadcast + CTV ≥ `[Selected TV Spend Floor]`
  - 2️⃣ **Under target cable share** — Cable share ≤ `[Selected Cable Share Target]`
  - 3️⃣ **Actionable opportunity size** — Cable opportunity ≥ `[Selected Cable Opportunity Floor]` (highlight rule 3 in orange `#F37021`)
- Footnote: `Media type filtering is intentionally removed because cable share and opportunity are computed across media types inside the measures.` Segoe UI 10, `#4B5563`.

If text boxes can't embed measure values, build this as a small **matrix** with three rows (rule num, label, value) where the value column is bound to measures.

### 4.5 Ranked Prospect List table (Y=672..892, full width X=256..1584)

- **Visual type:** Table.
- Title: `Ranked Prospect List`
- Description: `Seller action list sorted by estimated cable opportunity. Filtered by the three sliders above plus current slicers.`
- **Columns** (in order):
  1. `DimAdvertiser[Advertiser]` (`Advertiser`)
  2. `DimAgency[Agency]` (`Agency`)
  3. `DimState[State]` (`State`)
  4. `DimDMA[DMA]` (`DMA`)
  5. `DimOffice[Office]` (`Office`)
  6. `[Cable Prospect Label]` (`Race` — yes, the label column despite the header; this matches the design's compressed view)
  7. `[Broadcast Spend]` (`Broadcast`)
  8. `[CTV Spend]` (`CTV`)
  9. `[Cable Spend]` (`Cable`)
  10. `[Cable Share %]` (`Cable %`)
  11. `[Cable Opportunity $]` (`Cable Opp ↓`)
  12. `FactPoliticalWindows[WindowStatus]` (`Window`) — with `FactPoliticalWindows[DaysToElection]` formatted as `Xd to election` shown on a second line beneath the chip if PBI tables support cell linebreak; if not, add `DaysToElection` as a 13th column.
- **Sort:** descending by `[Cable Opportunity $]`.
- **Visual-level filters:**
  - `[Cable Prospect Flag] = 1`
  - `[Meets Cable Opportunity Floor Flag] = 1`
- **Conditional formatting:**
  - `[Cable Opportunity $]` → data bars `#F37021`, transparency 80%.
  - `[Cable Share %]` → background by rules vs. `[Selected Cable Share Target]`:
    - `< target * 0.6` → `#FBD7DE` bg, `#E4002B` text bold
    - `< target` → `#FFF3D6` bg, `#8A6500` text bold
    - `>= target` → `#E0F4EA` bg, `#06633B` text bold
  - `[Cable Prospect Label]` (Race column) → background by rule:
    - `Zero Cable` → `#FBD7DE` / `#E4002B`
    - `Low Cable` → `#FDE3D2` / `#B14A0D`
    - `Cable In Mix` → `#F3F4F6` / `#4B5563`
    - `No TV Spend` → `#F3F4F6` / `#6B7280`
  - `FactPoliticalWindows[WindowStatus]` → background by rule:
    - `In Window` → `#E0F4EA` / `#06633B`
    - `Opening Next 30` → `#FFF3D6` / `#8A6500`
    - `Future` → `#F3F4F6` / `#4B5563`
    - `Completed` → `#F3F4F6` / `#6B7280` (muted)
- **Header style:** background `#111827`, text `#FFFFFF`, Segoe UI Semibold 10.
- **Row count visible:** ~8–10 with vertical scroll for the rest.

### 4.6 Optional page filter (cleaner than per-visual)

If maintaining per-visual filters becomes repetitive, instead apply at page level on the **Filters pane → Filters on this page**:

- `[Cable Prospect Flag]` is `1`
- `[Meets Cable Opportunity Floor Flag]` is `1`

Then remove those filters from each individual visual. The KPI cards remain valid because the prospect-specific measures (`[Prospect Cable Opportunity $]`, etc.) already encode the prospect filter. Verify KPI numbers still tie out vs. the design HTML reference before shipping.

---

## 5. Theme + cosmetic polish

After all visuals are placed:

1. **Re-apply theme** to flush any stale colors — `ComcastAdvertisingTheme.json`.
2. **Snap to grid:** View → Show gridlines + Snap to grid; the design uses an 8 px grid. Nudge every visual to align.
3. **Corner radius:** all visual backgrounds use radius **4 px** (Format → Effects → Visual border → Rounded corners = 4 if available; the theme JSON sets this globally).
4. **Title fonts:** every visual title is `Segoe UI Semibold` 12 px `#111827`. Every visual description is `Segoe UI` 10.5 px `#4B5563`. If a visual lacks a built-in subtitle, add a sibling text box.
5. **Currency formatting** on all $ measures: positive `$0.0,,"M"` (millions), or `$0.0,"K"` (thousands) where smaller. Decimals 1.
6. **Percentage formatting** on all `%` measures: `0.0%`.
7. **Sort indicators** in table headers (`↓`) — add manually to the header label of the column the table is sorted by.

---

## 6. Acceptance checklist (run before committing)

Reference: the HTML prototype in this project at `Political Dashboard.html` is the ground truth for layout.

- [ ] Both pages render at 1600 × 900 with the header, slicer drawer, content area, and tab strip positioned as in the design.
- [ ] Comcast Advertising logo appears in the header on both pages, ~38 px tall, with the small subtitle reading `Political & Issue · v3.2 · curated PBI model`.
- [ ] Theme primary blue is the Comcast Advertising blue `#008CC3` (logo color), with deeper `#005EB8` used only for the Federal Senate race-level swatch.
- [ ] **Page 1** has all 6 KPI cards, the 100% stacked media mix, cable share by race level with target reference line, the Top Cable Opportunities table, the State→DMA→Office matrix, and the How To Read Opportunity note.
- [ ] **Page 1** State and DMA fields come from `DimState[State]` and `DimDMA[DMA]` joined through the calendar (calendar-matched markets only).
- [ ] **Page 2** has all 6 KPI cards, three sliders (with the orange-prominent Minimum Cable Opportunity), the scatter plot with both reference lines, Prospects By Market, Prospect Logic explainer, and the Ranked Prospect List.
- [ ] **Page 2 has NO media type slicer and NO `DimMediaType[MediaType]` page filter.**
- [ ] Scatter plot uses `[Cable Prospect Flag] = 1` AND `[Meets Cable Opportunity Floor Flag] = 1` as visual filters.
- [ ] Every KPI, chart, table, slicer, and notes box has a title and a plain-English one-sentence description.
- [ ] All currency formats display as `$0.0M` or `$0.0K`. All percentages as `0.0%`.
- [ ] No pie or donut charts anywhere.
- [ ] Both tables are sorted descending by `[Cable Opportunity $]`, not alphabetically.
- [ ] Moving the Minimum Cable Opportunity slider on Page 2 visibly updates the Cable Prospects KPI, the scatter dot count, the Prospects By Market bars, and the Ranked Prospect List row count.
- [ ] Save the `.pbix` as `Political Spend Dashboard-3.pbix` and leave the original `-2.pbix` untouched.

---

## 7. Pages 3–10 (added in v3 of this spec)

Sections 0–6 above cover pages 01 and 02 in detail. The remaining 8 pages now have working prototypes in `Political Dashboard.html` — open it and use it as the visual ground truth for layout, exact column orders, colors, and copy. The notes below are the Power BI-specific build instructions that **complement** the prototype.

All eight pages reuse the same header bar, slicer drawer, and tab strip from §2. Apply the same canvas size (1600×900), theme, and 8 px grid. The required global slicers stay the same; per-page deviations are flagged below.

### 7.1 — Page 03 Spend Trend

**Page filters:** none beyond global.

**KPIs (4 cards):** `Snapshots Loaded` (`COUNTROWS ( DimSnapshot )`), `Cumulative Spend` (`[Total Spend]` filtered to `[Latest Snapshot Date]`), `Last Week Added` (new measure: `[Weekly Added Spend]` filtered to latest snapshot), `Pace vs. Prior Week` (computed from latest two `[Weekly Added Spend]` values).

**Required new measures:**
```DAX
Cumulative Spend as of Snapshot =
CALCULATE (
    [Total Spend],
    FILTER ( ALL ( DimSnapshot ), DimSnapshot[SnapshotDate] <= MAX ( DimSnapshot[SnapshotDate] ) )
)

Weekly Added Spend =
[Cumulative Spend as of Snapshot]
- CALCULATE (
      [Cumulative Spend as of Snapshot],
      DATEADD ( DimSnapshot[SnapshotDate], -7, DAY )
  )
```

**Visuals:**
- **Cumulative Spend by Snapshot** — Line chart. X = `DimSnapshot[SnapshotDate]`. Y = `[Cumulative Spend as of Snapshot]`. Legend = a calculated column on `DimSnapshot` / `_TrendBreakdown` toggle (Power BI doesn't natively support breakdown toggles — implement as bookmarks switching three near-identical line charts: by Media Type, by Race Level, by Party). Add a dashed Total reference line via measure `[Total Spend by Snapshot]`.
- **Weekly Added Spend** — Stacked column chart. Same X-axis. Y = `[Weekly Added Spend]`. Same Legend toggle.
- **Top Movers · Last 8 Weeks** — Table. Columns: Advertiser, `[Cumulative Spend (8 weeks ago)]`, `[Cumulative Spend (latest)]`, delta column. Sort descending by delta. Top N = 10. The delta column uses orange→green conditional formatting on positive direction.

### 7.2 — Page 04 Advertiser Detail

**Critical:** this is a **drillthrough** page in Power BI. Configure it via right-pane → Visualizations → Drillthrough → Add `DimAdvertiser[Advertiser]`. Then on every other page, right-click an advertiser row → Drill through → Advertiser Detail.

**Left rail:** **Slicer** on `DimAdvertiser[Advertiser]`, type = List with search. Sort by `[Total Spend]` descending. Display the advertiser key as a subtitle line.

**Header card:** Five inline KPI Cards along the top of the right pane, one each for Total Spend, Broadcast + CTV, Cable Share, Cable Opportunity, Window Status. Color-code Cable Share red below 12%, and Cable Opportunity always orange.

**Visuals:**
- **Media Mix** — 100% stacked bar with per-media-type detail rows (reuse the Page 1 §3.3 visual pattern).
- **Spend Trend by Snapshot** — Line chart filtered to the drillthrough advertiser, one line per media type.
- **Stations & Networks** — Table from `FactSpendDetail` joined to `DimStation` and `DimNetwork`. Columns: Type (Broadcast/Cable chip), Call sign, Network, Spend (orange data bars).
- **Outside Spend Touching This Race** — Table from `FactOutsideSpend` filtered by `[Target Candidate AdvertiserKey]`. Columns: Committee (with DEM/REP party chip), Support, Oppose.

### 7.3 — Page 05 Race Explorer

**KPIs (4 cards):** Race Levels Active, Advertisers, Total Spend, Outside Spend Tied (sum of support + oppose from `FactOutsideSpend`).

**Main visual:** A single **Matrix** with rows hierarchy `DimRaceLevel[RaceLevel]` → `DimState[State]` → `DimOffice[Office]`. Values: # Adv (`DISTINCTCOUNT(DimAdvertiser[AdvertiserKey])`), `[Total Spend]`, `[Broadcast Spend]`, `[Cable Spend]`, `[Cable Share %]`, `[Cable Opportunity $]`, Outside Support, Outside Oppose. Use the same row-level shading and conditional formatting from Page 1 §3.6. Sort descending by `[Total Spend]` within each parent.

**Drill control:** Use the matrix's built-in "Expand to next level" buttons; rename them in a text box as "Drill depth: Race / + State / + Office".

### 7.4 — Page 06 Election Calendar + Political Windows

**KPIs (4 cards):** In Window Now, Opening Next 30, Future Windows, Completed — each a count of distinct races by `FactPoliticalWindows[WindowStatus]`.

**Visuals:**
- **Political Windows by Market** — Power BI has no native Gantt chart; install the **AppSource → Microsoft Gantt** custom visual or use the **As Timeline** visual. Task = race name, Start = `FactPoliticalWindows[WindowOpenDate]`, End = `FactPoliticalWindows[ElectionDate]`, Category = `DimDMA[DMA]`, Legend = `FactPoliticalWindows[WindowStatus]` with explicit colors (`In Window` `#00A859`, `Opening Next 30` `#FFB600`, `Future` `#9CA3AF`, `Completed` `#D1D5DB`). Add a **today line** via the visual's options.
- **Act Now table** — Table. Visual-level filter: `[WindowStatus]` ∈ {"In Window", "Opening Next 30"}. Columns: Advertiser · Race, Market, Window (chip), Days to Election. Sort ascending by `[DaysToElection]`. Conditional formatting on Days column: <30 → red, <60 → orange, else default.

### 7.5 — Page 07 PAC / FEC Spend Breakdown

**Source table:** `FactOutsideSpend` (FEC IE pull joined to candidate mapping).

**Required measures:**
```DAX
Support Spend = CALCULATE ( SUM ( FactOutsideSpend[Amount] ), FactOutsideSpend[SupportOrOppose] = "Support" )
Oppose Spend  = CALCULATE ( SUM ( FactOutsideSpend[Amount] ), FactOutsideSpend[SupportOrOppose] = "Oppose"  )
Total Outside Spend = [Support Spend] + [Oppose Spend]
```

**KPIs (4 cards):** Committees Active, Total Outside Spend, Support Spend (green accent), Oppose Spend (red accent).

**Visuals:**
- **Committees · Support / Oppose Split** — Stacked bar chart, Y = Committee, X = Support + Oppose with two series colored `#00A859` and `#E4002B`. Sort descending by total.
- **Outside Spend by Snapshot** — Line chart, X = Snapshot date, three lines (Support, Oppose, Total). Total is dashed.
- **By Race Level** — Table or matrix. One row per race level with # Committees, # Targets, Support (green data bar), Oppose (red data bar).
- **Top Targets · Detail** — Table from `FactOutsideSpend` showing per-row Target Candidate, Committee, Payee, Week Ending, Support, Oppose. Top N = 12 by total amount.

### 7.6 — Page 08 Completed Elections + Cost Per Vote

**This page is intentionally scaffolded.** Build the chrome and the table structure but **leave the value columns blank** until `FactElectionResults` rows land. The orange Notes box at the bottom (already in the prototype) is required — keep it word-for-word so sellers don't ask why the page is empty.

**Page filter:** `FactPoliticalWindows[WindowStatus] = "Completed"`.

**KPIs (4 cards):** Completed Races (count), Ad Spend Recorded (sum), Certified Results (`"0 of N"` where N = completed races and 0 = count of rows in `FactElectionResults`), Cost / Vote (always `—` until results arrive — bound to a measure that returns `BLANK()` while `[Certified Results Loaded Flag] = 0`).

**Table:** Same columns as the prototype. Bind Votes, Vote %, $/Vote, and Winner to measures on `FactElectionResults`. While that fact table is empty, those columns display `—` and the Winner column shows a yellow "Pending" chip.

Treat CivicAPI as the certified election-results source for case-study triage. Do not synthesize results from polls or projections; use CivicAPI race detail responses for vote totals, vote share, winner flags, percent reporting, and last-updated fields.

### 7.7 — Page 09 Case Study Finder

**Source table:** join `DimAdvertiser` with `CaseStudyNotes.xlsx` (`Status`, `Owner`, `ApprovedForSales`, `DeckLink`, `Narrative`, `LastUpdated`).

**Required measure:**
```DAX
Case Study Score =
VAR Opp    = MIN ( 1, DIVIDE ( [Cable Opportunity $], 800000 ) ) * 40
VAR Share  = MAX ( 0, 1 - DIVIDE ( [Cable Share %], 0.20 ) ) * 30
VAR Scale  = MIN ( 1, DIVIDE ( [Total Spend], 5000000 ) ) * 20
VAR Window = SWITCH ( SELECTEDVALUE ( FactPoliticalWindows[WindowStatus] ),
                       "In Window", 10,
                       "Opening Next 30", 6,
                       2 )
RETURN ROUND ( Opp + Share + Scale + Window, 0 )
```

**KPIs (5 cards):** one per status — Drafting / Approved For Sales / Live / Pending Approval / Archived — each a count of distinct advertisers. Approved For Sales = green, Live = blue, Pending Approval = orange.

**Left rail controls:** Radio slicer for status (Drafting / Approved For Sales / Live / Pending Approval / Archived) + a what-if numeric range `Case Study Score Floor Slider` (min 0, max 100, increment 1, default 40). Use `#F37021` prominent treatment on the score-floor slider like Page 2's Min Cable Opp slider. Underneath, render the "What makes a strong case study?" component breakdown (40/30/20/10) as a static text box.

**Main table:** Columns: Advertiser, Race (small text), Narrative, Score (with mini bar), Cable Opp (orange), Status (chip), Owner, Deck (link to `DeckLink`). Sort descending by `[Case Study Score]`.

### 7.8 — Page 10 Data Health + Mapping Review

**KPIs (8 cards across the top):** Latest Snapshot Date, Rows Loaded, Total Spend, Unmatched Advertisers (red accent), Low Confidence Matches (orange), Duplicate Keys, Political Windows Loaded, Outside Spend Rows.

**Required measures:** Most exist as `[Unmatched Advertiser Count]`, `[Political Windows Loaded]`, etc. Add `[Rows Loaded]`, `[Duplicate Key Count]`, `[Low Confidence Matches]` if missing.

**Visuals (four tables in a 2×2 grid):**
- **Source Health** — Table from `DimSource`: Source, Last Loaded, Rows, Owner, Status chip (Healthy green / Stale yellow / Error red). Hardcode the source list against the connector inventory.
- **Refresh Log** — Table from `DataHealth_RefreshLog` (or scraped from the orchestrator). Columns: Timestamp, Step, Rows, Duration, Status chip.
- **Advertiser Match Review** — Table from `MappingReview` view: Raw Advertiser, Candidate hint, Suggested mapping, Confidence (chip — ≥0.7 green, ≥0.5 yellow, else red), Action (`Review →` link for `NeedsHuman = TRUE`). Visual-level filter: `[NeedsHuman] = 1` OR `[Confidence] < 0.7`.
- **Missing Field Checks** — A compact list (one row per check): Snapshot reconciliation (Match/Mismatch + count), Missing DMA, Missing Office mapping, Missing Race Level, Missing Agency, Negative cable share, Snapshot date in future. Each row ends in an OK / Warn / Note chip computed from the row count vs. total.

### 7.9 — Acceptance addendum

Append these checks to the §6 list:
- [ ] Page 03 line chart uses `DimSnapshot` x-axis with the breakdown toggle (Media Type / Race Level / Party) implemented as bookmark-switched visuals.
- [ ] Page 04 is configured as a drillthrough on `DimAdvertiser[Advertiser]` and works from Page 1, Page 2, and Page 5.
- [ ] Page 05 matrix expands cleanly through three levels and sorts by `[Total Spend]` descending within each parent.
- [ ] Page 06 uses a real Gantt visual with the today line and status colors above, NOT a stacked bar workaround.
- [ ] Page 07 KPI tiles' Support/Oppose totals reconcile with the diverging bar chart and the snapshot trend lines.
- [ ] Page 08 displays CivicAPI-certified results; all derived columns gracefully show `—` while `FactElectionResults` is empty or a matched race lacks vote counts.
- [ ] Page 09 score slider is the orange-prominent treatment and updates the table live.
- [ ] Page 10 source list and refresh log come from real connector telemetry, not hand-typed entries.

---

## 8. Things to flag (don't silently work around)

If you hit any of the following, stop and surface them:

- A measure listed in §1 doesn't exist and the DAX provided doesn't compile cleanly.
- The curated model is missing a calendar relationship from `FactPoliticalWindows` to `DimState` / `DimDMA` (the calendar-scoped State and DMA fields depend on this).
- Power BI Desktop edition can't render dynamic measure-driven reference lines on the scatter (only available in some SKUs). Fall back to constant lines bound to the slider default, but document this in the notes box.
- A field column the design references (e.g. `DimRaceLevel[RaceLevelColor]`) is missing — propose the add, don't substitute hardcoded colors that the theme can't keep in sync.
