/* global React */
// Page 2 — Cable Prospect Finder

const { useState, useMemo } = React;
const F2 = window.pbData;

function ProspectsPage({
  filteredRows, measures, filters,
  tvFloor, setTvFloor,
  cableTarget, setCableTarget,
  cableOppFloor, setCableOppFloor,
}) {
  const [hover, setHover] = useState(null);
  const calendarRows = useMemo(
    () => filteredRows.filter((r) => r.calendarMatched),
    [filteredRows]
  );
  const offCalendarRows = useMemo(
    () => filteredRows.filter((r) => !r.calendarMatched),
    [filteredRows]
  );

  // Visual-level filter for scatter + prospect table:
  //   • market must exist in the maintained political-window calendar
  //   • cableProspectFlag = 1 AND meetsCableOppFloor = 1
  //   • Exclude completed races: lost primaries, completed general elections,
  //     and the manually closed VA/NJ/Prop 50 cycle rows.
  const closedRows = useMemo(
    () => calendarRows.filter((r) => isClosedProspectRow(r)),
    [calendarRows]
  );
  const prospects = useMemo(
    () => calendarRows.filter((r) =>
      r.cableProspectFlag === 1 &&
      r.meetsCableOppFloor === 1 &&
      !isClosedProspectRow(r)
    ),
    [calendarRows]
  );

  const rankedProspects = useMemo(
    () => [...prospects].sort((a, b) => b.cableOpportunity - a.cableOpportunity),
    [prospects]
  );
  const maxOpp = Math.max(...rankedProspects.map((r) => r.cableOpportunity), 1);

  // Prospect mix by market — top 6 DMAs by cable opportunity
  const marketRows = useMemo(() => {
    const m = new Map();
    prospects.forEach((r) => {
      const cur = m.get(r.dma) || { dma: r.dma, prospects: 0, opp: 0 };
      cur.prospects += 1;
      cur.opp += r.cableOpportunity;
      m.set(r.dma, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.opp - a.opp).slice(0, 6);
  }, [prospects]);
  const maxMarketOpp = Math.max(...marketRows.map((r) => r.opp), 1);

  // Scatter hover handler
  function onHover(row, e) {
    if (!row) { setHover(null); return; }
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    setHover({ ...row, _x: e.clientX - rect.left, _y: e.clientY - rect.top });
  }

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Cable Prospect Finder</div>
          <div className="subtitle">Prioritized advertiser opportunities in markets listed in the maintained political-window calendar.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      {/* KPI ROW */}
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(9, 1fr)" }}>
        <KPI title="Cable Prospects" value={prospects.length.toString()}
             desc="Calendar-market advertisers meeting the spend, cable share, and opportunity thresholds." accent="blue" />
        <KPI title="Zero-Cable Prospects" value={prospects.filter((r) => r.noCableFlag === 1).length.toString()}
             desc="Prospects with broadcast or CTV spend and no cable spend." accent="red" />
        <KPI title="Prospect Spend" value={F2.fmtMoney(prospects.reduce((a, r) => a + r.total, 0))}
             desc="Total current spend from filtered cable prospects." />
        <KPI title="Broadcast + CTV Spend" value={F2.fmtMoney(prospects.reduce((a, r) => a + r.bcCtvSpend, 0))}
             desc="Prospect spend currently weighted toward broadcast and CTV." />
        <KPI title="Cable Opportunity" value={F2.fmtMoney(prospects.reduce((a, r) => a + r.cableOpportunity, 0))}
             desc="Estimated cable upside after applying the selected target and floor." accent="orange" />
        <KPI title="Average Cable Share"
             value={F2.fmtPct(prospects.length ? prospects.reduce((a, r) => a + r.cableShare, 0) / prospects.length : 0)}
             desc="Average cable share across the visible prospect set." />
        <KPI title="Closed Races Removed"
             value={closedRows.length.toString()}
             desc="Completed general races, lost primaries, and closed VA/NJ/Prop 50 rows excluded from prospecting."
             accent={closedRows.length > 0 ? "red" : null} />
        <KPI title="Off-Calendar Rows Hidden"
             value={offCalendarRows.length.toString()}
             desc="Advertiser rows outside the political-window market calendar are hidden on this page."
             accent={offCalendarRows.length > 0 ? "orange" : null} />
        <KPI title="Primary Winners →General"
             value={calendarRows.filter((r) => r.primaryWon).length.toString()}
             desc="Calendar-market candidates who won their primary and now have a general election advertising window ahead."
             accent="green" />
      </div>

      {/* SLIDER ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 8, flexShrink: 0 }}>
        <SliderCard
          title="Minimum TV Spend"
          desc="Sets the minimum broadcast plus CTV spend needed to qualify as a prospect."
          value={tvFloor} min={0} max={500000} step={5000}
          formatValue={(v) => "$" + (v / 1000).toFixed(0) + "K"}
          onChange={setTvFloor}
        />
        <SliderCard
          title="Cable Share Target"
          desc="Sets the target cable share used to calculate opportunity."
          value={cableTarget} min={0.05} max={0.5} step={0.01}
          formatValue={(v) => (v * 100).toFixed(0) + "%"}
          onChange={setCableTarget}
        />
        <SliderCard
          title="Minimum Cable Opportunity"
          desc="Only show advertisers with at least this much estimated cable upside."
          value={cableOppFloor} min={0} max={250000} step={5000}
          formatValue={(v) => "$" + (v / 1000).toFixed(0) + "K"}
          prominent
          onChange={setCableOppFloor}
        />
      </div>

      {/* MAIN GRID — scatter on left full-height, two cards on right */}
      <div className="grid-prospects">
        <div className="span-left" style={{ display: "flex", flexDirection: "column" }}>
          <Viz
            title="Broadcast/CTV Spend vs. Cable Share"
            desc="Each dot is an advertiser. The best prospects are high on broadcast/CTV spend and low on cable share — the orange zone in the upper right."
            style={{ flex: 1, minHeight: 0 }}
          >
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <ScatterChart
                rows={prospects}
                vRef={tvFloor}
                hRef={cableTarget}
                raceColors={window.RACE_COLORS}
                onHover={onHover}
                hover={hover}
              />
              <div className="scatter-legend">
                <span style={{ color: "var(--text-secondary)", fontWeight: 600, marginRight: 4 }}>Race level:</span>
                {Object.entries(window.RACE_COLORS).map(([rl, c]) => (
                  <span key={rl}><span className="lg-dot" style={{ background: c }}></span>{rl}</span>
                ))}
                <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>Dot size = total spend</span>
              </div>
            </div>
          </Viz>
        </div>

        {/* Top right: prospects by market */}
        <Viz
          title="Prospects By Market"
          desc="Top political-calendar markets where actionable cable opportunities concentrate. Sorted by cable opportunity."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {marketRows.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 12 }}>No prospects in the current filter set.</div>
            ) : marketRows.map((r) => {
              const pct = r.opp / maxMarketOpp;
              return (
                <div key={r.dma} style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 36px", alignItems: "center", gap: 8, fontSize: 11, paddingBottom: 1 }}>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.dma}>{r.dma}</div>
                  <div style={{ height: 14, background: "#F3F4F6", borderRadius: 2, position: "relative", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct * 100}%`, background: "var(--orange)", borderRadius: 2 }}></div>
                  </div>
                  <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--orange)", fontWeight: 600 }}>{F2.fmtMoneyTight(r.opp)}</div>
                  <div style={{ textAlign: "right", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{r.prospects}</div>
                </div>
              );
            })}
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px 36px", gap: 8, fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 2 }}>
              <div>DMA</div><div></div>
              <div style={{ textAlign: "right" }}>Cable opp</div>
              <div style={{ textAlign: "right" }}># adv</div>
            </div>
          </div>
        </Viz>

        {/* Bottom right: prospect logic notes */}
        <Viz
          title="Prospect Logic"
          desc="Three thresholds (set via the sliders above) decide which advertisers appear in this view."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
            <RuleRow num="1" label="Enough TV spend" value={`Broadcast + CTV ≥ ${F2.fmtMoneyTight(tvFloor)}`} />
            <RuleRow num="2" label="Under target cable share" value={`Cable share ≤ ${(cableTarget * 100).toFixed(0)}%`} />
            <RuleRow num="3" label="Actionable opportunity size" value={`Cable opportunity ≥ ${F2.fmtMoneyTight(cableOppFloor)}`} color="orange" />
            <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.4, marginTop: 4, borderTop: "1px solid var(--border)", paddingTop: 5 }}>
              Media type filtering is intentionally removed because cable share and opportunity are computed across media types inside the measures.
            </div>
          </div>
        </Viz>
      </div>

      {/* RANKED PROSPECT LIST — full-width bottom table */}
      <Viz
        title="Ranked Prospect List"
        desc="Seller action list sorted by estimated cable opportunity. Includes only State/DMA pairs present in the political-window calendar."
        style={{ flex: 1, minHeight: 0, marginTop: 0 }}
        accent={{ bg: "var(--orange-soft)", fg: "#B14A0D", text: `${rankedProspects.length} prospects` }}
      >
        <div className="tbl-wrap">
          <table className="tbl">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Advertiser</th>
                <th>Agency</th>
                <th>State</th>
                <th>DMA</th>
                <th>Office</th>
                <th>Race</th>
                <th>Election</th>
                <th className="num">Broadcast</th>
                <th className="num">CTV</th>
                <th className="num">Cable</th>
                <th>Cable %</th>
                <th className="num">Cable Opp ↓</th>
                <th className="num">Cash on Hand</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              {rankedProspects.length === 0 ? (
                <tr><td colSpan="14" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                  No advertisers match the current filters and slider thresholds.
                </td></tr>
              ) : rankedProspects.map((r) => (
                <tr key={r.advertiserKey}>
                  <td className="adv-name" title={r.advertiser}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        title={`Race level color: ${r.raceLevel}`}
                        style={{ width: 4, height: 14, borderRadius: 2, background: window.RACE_COLORS[r.raceLevel] }}
                      ></span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.advertiser}</span>
                    </div>
                  </td>
                  <td title={r.agency} style={{ color: "var(--text-secondary)" }}>{r.agency}</td>
                  <td>{r.state}</td>
                  <td title={r.dma}>{r.dma}</td>
                  <td>{r.office}</td>
                  <td><ProspectLabelChip label={r.cableProspectLabel} /></td>
                  <td>
                    {r.primaryWon  && <span className="chip chip-green"  title="Won primary — general election window ahead">Primary Won ✓</span>}
                    {!r.hasElectionResult && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td className="num">{F2.fmtMoneyTight(r.broadcast)}</td>
                  <td className="num">{F2.fmtMoneyTight(r.ctv)}</td>
                  <td className="num">{F2.fmtMoneyTight(r.cable)}</td>
                  <td><CableShareCell value={r.cableShare} target={measures.cableShareTarget} /></td>
                  <td><OpportunityBar value={r.cableOpportunity} max={maxOpp} /></td>
                  <td className="num" title={r.fecId ? `FEC ${r.fecId}` : "Not in FEC cash-on-hand feed"} style={{ color: r.cashOnHand ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {r.cashOnHand ? F2.fmtMoneyTight(r.cashOnHand) : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                      <WindowChip status={r.windowStatus} />
                      <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {r.daysToElection >= 0 ? `${r.daysToElection}d to election` : `${Math.abs(r.daysToElection)}d post-election`}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Viz>
    </div>
  );
}

function isClosedProspectRow(row) {
  return F2.isClosedProspect
    ? F2.isClosedProspect(row)
    : !!(row && (
      row.primaryLost || row.generalWon || row.generalLost ||
      (row.electionResult && row.electionResult.lost)
    ));
}

function RuleRow({ num, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <div style={{
        width: 16, height: 16, borderRadius: 8,
        background: color === "orange" ? "var(--orange)" : "var(--blue-soft)",
        color: color === "orange" ? "#fff" : "var(--blue)",
        fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1,
      }}>{num}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.1 }}>{label}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: color === "orange" ? "var(--orange)" : "var(--text-primary)", lineHeight: 1.25 }}>{value}</div>
      </div>
    </div>
  );
}

Object.assign(window, { ProspectsPage });
