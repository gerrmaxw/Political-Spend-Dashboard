/* global React */
// Page 5 — Race Explorer
// Page 6 — Election Calendar + Political Windows

const { useState: useStateRC, useMemo: useMemoRC } = React;
const Frc = window.pbData;

// ===========================================================================
// Page 5 — Race Explorer
// ===========================================================================
function RacePage({ filteredRows, filters }) {
  const [expandLevel, setExpandLevel] = useStateRC(2); // 0 = race only, 1 = race+state, 2 = race+state+office

  // Build a Race Level → State → Office tree with aggregates
  const tree = useMemoRC(() => {
    const root = new Map();
    filteredRows.forEach((r) => {
      const lvl = root.get(r.raceLevel) || { agg: blank(), kids: new Map() };
      const st  = lvl.kids.get(r.state)    || { agg: blank(), kids: new Map() };
      const off = st.kids.get(r.office)    || { agg: blank(), kids: [] };
      addAgg(off.agg, r);
      addAgg(st.agg, r);
      addAgg(lvl.agg, r);
      off.kids.push(r);
      st.kids.set(r.office, off);
      lvl.kids.set(r.state, st);
      root.set(r.raceLevel, lvl);
    });

    // Sort children: by total spend desc within each level
    const sortedRaces = Array.from(root.entries()).sort((a, b) => b[1].agg.total - a[1].agg.total);
    return sortedRaces.map(([race, lvl]) => {
      const states = Array.from(lvl.kids.entries()).sort((a, b) => b[1].agg.total - a[1].agg.total).map(([state, st]) => {
        const offices = Array.from(st.kids.entries()).sort((a, b) => b[1].agg.total - a[1].agg.total).map(([office, off]) => ({
          office, agg: off.agg, advertisers: off.kids.sort((a, b) => b.total - a.total),
        }));
        return { state, agg: st.agg, offices };
      });
      return { race, agg: lvl.agg, states };
    });
  }, [filteredRows]);

  function blank() { return { total: 0, broadcast: 0, cable: 0, ctv: 0, opp: 0, tv: 0, support: 0, oppose: 0, advCount: 0 }; }
  function addAgg(a, r) {
    a.total += r.total;
    a.broadcast += r.broadcast;
    a.cable += r.cable;
    a.ctv += r.ctv;
    a.tv += r.tvSpend;
    a.opp += r.cableOpportunity;
    a.advCount += 1;
    // outside support/oppose for this candidate
    const outside = Frc.PAC_ROWS.filter((p) => p.target === r.advertiser);
    a.support += outside.reduce((x, p) => x + p.support, 0);
    a.oppose  += outside.reduce((x, p) => x + p.oppose, 0);
  }

  const rows = useMemoRC(() => {
    const out = [];
    tree.forEach((rl) => {
      out.push({ kind: "race", label: rl.race, agg: rl.agg, level: 0, color: window.RACE_COLORS[rl.race] });
      if (expandLevel >= 1) {
        rl.states.forEach((st) => {
          out.push({ kind: "state", label: st.state, agg: st.agg, level: 1 });
          if (expandLevel >= 2) {
            st.offices.forEach((off) => {
              out.push({ kind: "office", label: off.office, agg: off.agg, level: 2 });
            });
          }
        });
      }
    });
    return out;
  }, [tree, expandLevel]);

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Race Explorer</div>
          <div className="subtitle">Total spend, media mix, cable opportunity, and outside support/oppose by race level → state → office.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPI title="Race Levels Active" value={tree.length.toString()}
             desc="Race types with at least one advertiser in the current filter set." accent="blue" />
        <KPI title="Advertisers" value={filteredRows.length.toString()}
             desc="Distinct advertisers across all race levels." />
        <KPI title="Total Spend" value={Frc.fmtMoney(filteredRows.reduce((a, r) => a + r.total, 0))}
             desc="Sum of current spend across all active races." />
        <KPI title="Outside Spend Tied" value={Frc.fmtMoney(rows.filter((x) => x.kind === "race").reduce((a, r) => a + r.agg.support + r.agg.oppose, 0))}
             desc="PAC and outside-group spend linked to candidates in scope." accent="orange" />
      </div>

      <Viz
        title="Race-Level Matrix"
        desc="Spend and cable share by race level, state, and office. Use the expand control to drill from race down to office."
        accent={{ bg: "#F3F4F6", fg: "#4B5563", text: `${rows.filter((x) => x.kind === "race").length} race levels` }}
        style={{ flex: 1, minHeight: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginRight: 4 }}>Drill depth:</span>
          {[["Race", 0], ["+ State", 1], ["+ Office", 2]].map(([lbl, v]) => (
            <button key={v} onClick={() => setExpandLevel(v)} style={{
              background: expandLevel === v ? "var(--blue)" : "#fff",
              color: expandLevel === v ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)", padding: "3px 10px", fontSize: 10.5, fontFamily: "inherit",
              cursor: "pointer", fontWeight: expandLevel === v ? 600 : 500, borderRadius: 3,
            }}>{lbl}</button>
          ))}
        </div>

        <div className="matrix" style={{ flex: 1, minHeight: 0 }}>
          <table>
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Race · State · Office</th>
                <th className="num"># Adv</th>
                <th className="num">Total Spend ↓</th>
                <th className="num">Broadcast</th>
                <th className="num">Cable</th>
                <th className="num">Cable %</th>
                <th className="num">Cable Opp</th>
                <th className="num">Outside Support</th>
                <th className="num">Outside Oppose</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cls = r.kind === "race" ? "state-row" : r.kind === "state" ? "dma-row" : "office-row";
                const cableShare = r.agg.tv > 0 ? r.agg.cable / r.agg.tv : 0;
                const pad = r.level * 18;
                return (
                  <tr key={i} className={cls}>
                    <td style={{ paddingLeft: pad + 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {r.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color }}></span>}
                        <span style={{ fontWeight: r.kind === "race" ? 700 : r.kind === "state" ? 600 : 500 }}>{r.label}</span>
                      </div>
                    </td>
                    <td>{r.agg.advCount}</td>
                    <td style={{ fontWeight: r.kind === "race" ? 700 : 600 }}>{Frc.fmtMoneyTight(r.agg.total)}</td>
                    <td>{Frc.fmtMoneyTight(r.agg.broadcast)}</td>
                    <td>{Frc.fmtMoneyTight(r.agg.cable)}</td>
                    <td>{r.agg.tv > 0 ? <CableShareCell value={cableShare} target={0.20} /> : "—"}</td>
                    <td style={{ color: "var(--orange)", fontWeight: 600 }}>{Frc.fmtMoneyTight(r.agg.opp)}</td>
                    <td style={{ color: r.agg.support > 0 ? "var(--green)" : "var(--text-muted)" }}>{r.agg.support > 0 ? Frc.fmtMoneyTight(r.agg.support) : "—"}</td>
                    <td style={{ color: r.agg.oppose  > 0 ? "var(--red)"   : "var(--text-muted)" }}>{r.agg.oppose  > 0 ? Frc.fmtMoneyTight(r.agg.oppose)  : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Viz>
    </div>
  );
}

// ===========================================================================
// Page 6 — Election Calendar + Political Windows
// ===========================================================================
function calNorm(value) {
  return String(value == null ? "" : value).trim().toUpperCase().replace(/\s+/g, " ");
}
function calStateTokens(value) {
  return calNorm(value).split(/[\/,\s]+/).filter(Boolean);
}
function calStateMatch(a, b) {
  const at = calStateTokens(a);
  const bt = calStateTokens(b);
  return at.some((x) => bt.includes(x)) || bt.some((x) => at.includes(x));
}
function parseCalDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function fmtCalDate(value) {
  const d = parseCalDate(value);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}
function rowMatchesWindow(row, win) {
  return calNorm(row.dma) === calNorm(win.dma || win.market) && calStateMatch(row.state, win.state);
}
function electionTypeGroup(value) {
  const text = calNorm(value);
  if (text.includes("RUNOFF")) return "Runoff";
  if (text.includes("PRIMARY")) return "Primary";
  if (text.includes("GENERAL")) return "General";
  if (text.includes("SPECIAL")) return "Special";
  return "Other";
}
const electionTypeStyles = {
  General: { bg: "#E8F1FF", fg: "#195C9F", stroke: "#195C9F", letter: "G" },
  Primary: { bg: "#F4EAFE", fg: "#6D3BB8", stroke: "#6D3BB8", letter: "P" },
  Runoff:  { bg: "#FFF3D6", fg: "#9A5B00", stroke: "#C77900", letter: "R" },
  Special: { bg: "#E7F7EF", fg: "#067647", stroke: "#00A859", letter: "S" },
  Other:   { bg: "#F3F4F6", fg: "#4B5563", stroke: "#6B7280", letter: "O" },
};
function TypeChip({ type }) {
  const t = electionTypeGroup(type);
  const style = electionTypeStyles[t] || electionTypeStyles.Other;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 50, height: 18, padding: "0 6px", borderRadius: 9,
      background: style.bg, color: style.fg, fontSize: 9.5,
      fontWeight: 700, lineHeight: 1, border: `1px solid ${style.stroke}33`,
    }}>{t}</span>
  );
}

function CalendarPage({ filteredRows, filters }) {
  const rows = useMemoRC(() => {
    const calendarRows = Frc.POLITICAL_WINDOWS || [];
    return calendarRows
      .filter((w) => {
        if (filters.state && filters.state !== "All" && !calStateMatch(w.state, filters.state)) return false;
        if (filters.dma && filters.dma !== "All" && calNorm(w.dma || w.market) !== calNorm(filters.dma)) return false;
        if (filters.window && filters.window !== "All" && w.windowStatus !== filters.window) return false;
        return true;
      })
      .map((w) => {
        const marketRows = filteredRows.filter((r) => rowMatchesWindow(r, w));
        const topAdvertiser = marketRows.slice().sort((a, b) => b.total - a.total)[0] || null;
        const marketSpend = marketRows.reduce((a, r) => a + (r.total || 0), 0);
        const cableOpportunity = marketRows.reduce((a, r) => a + (r.cableOpportunity || 0), 0);
        return {
          ...w,
          electionTypeGroup: electionTypeGroup(w.windowType),
          marketRows,
          topAdvertiser,
          marketSpend,
          total: marketSpend,
          cableOpportunity,
          prospectCount: marketRows.filter((r) => r.cableProspectFlag === 1 && !Frc.isClosedProspect(r)).length,
          windowOpen: parseCalDate(w.windowOpenDate),
          electionDateObj: parseCalDate(w.electionDate),
        };
      })
      .sort((a, b) => (a.electionDateObj || 0) - (b.electionDateObj || 0));
  }, [filteredRows, filters.state, filters.dma, filters.window]);

  const range = useMemoRC(() => {
    const dates = rows.flatMap((r) => [r.windowOpen, r.electionDateObj]).filter(Boolean);
    if (!dates.length) {
      return { start: new Date("2026-01-01T00:00:00"), end: new Date("2026-12-31T00:00:00") };
    }
    const start = new Date(Math.min(...dates.map((d) => d.getTime())));
    const end = new Date(Math.max(...dates.map((d) => d.getTime())));
    start.setDate(start.getDate() - 14);
    end.setDate(end.getDate() + 14);
    return { start, end };
  }, [rows]);

  // Group by market (DMA) for the gantt
  const ganttGroups = useMemoRC(() => {
    const m = new Map();
    rows.forEach((r) => {
      const key = `${r.state}|${r.dma}`;
      const cur = m.get(key) || { key, dma: r.dma, market: r.market || r.dma, state: r.state, region: r.region, items: [] };
      cur.items.push(r);
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => {
      const aIn = a.items.filter((x) => x.windowStatus === "In Window").length;
      const bIn = b.items.filter((x) => x.windowStatus === "In Window").length;
      if (bIn !== aIn) return bIn - aIn;
      return a.market.localeCompare(b.market);
    });
  }, [rows]);

  const actNow = useMemoRC(() =>
    rows.filter((r) => r.windowStatus === "In Window" || r.windowStatus === "Opening Next 30")
        .sort((a, b) => a.daysToElection - b.daysToElection)
        .slice(0, 12)
  , [rows]);

  const typeCounts = useMemoRC(() => {
    const out = { Primary: 0, Runoff: 0, General: 0, Special: 0 };
    rows.forEach((r) => {
      const t = r.electionTypeGroup || electionTypeGroup(r.windowType);
      if (out[t] == null) out[t] = 0;
      out[t] += 1;
    });
    return out;
  }, [rows]);

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Election Calendar + Political Windows</div>
          <div className="subtitle">Political windows from the maintained market calendar workbook only. CivicAPI is not used for this page.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPI title="In Window Now" value={rows.filter((r) => r.windowStatus === "In Window").length.toString()}
             desc="Calendar rows whose window-open date has passed and election date has not." accent="green" />
        <KPI title="Opening Next 30" value={rows.filter((r) => r.windowStatus === "Opening Next 30").length.toString()}
             desc="Calendar rows with a window-open date within the next 30 days." accent="orange" />
        <KPI title="Future Windows" value={rows.filter((r) => r.windowStatus === "Future").length.toString()}
             desc="Market windows scheduled later in the cycle." />
        <KPI title="Completed" value={rows.filter((r) => r.windowStatus === "Completed").length.toString()}
             desc="Calendar rows whose election date has passed." />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPI title="Primary Windows" value={(typeCounts.Primary || 0).toString()}
             desc="Regular primary-election political windows from the market calendar." />
        <KPI title="Runoff Windows" value={(typeCounts.Runoff || 0).toString()}
             desc="Runoff primary, runoff general, and standalone runoff windows." accent="orange" />
        <KPI title="General Windows" value={(typeCounts.General || 0).toString()}
             desc="General-election political windows." accent="blue" />
        <KPI title="Special Windows" value={(typeCounts.Special || 0).toString()}
             desc="Special-election political windows." accent="green" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* LEFT — Gantt */}
        <Viz title="Political Windows by Market"
             desc="Each bar is one workbook window from open date through election day. Only markets and windows listed in the calendar file appear here."
             accent={{ bg: "#FFF3D6", fg: "#8A6500", text: "Gantt" }}
             style={{ minHeight: 0 }}>
          <GanttChart groups={ganttGroups} rangeStart={range.start} rangeEnd={range.end} />
        </Viz>

        {/* RIGHT — act-now table */}
        <Viz title="Act Now"
             desc="Open and soon-opening market windows sorted by election urgency, with current spend context from matched advertiser rows."
             accent={{ bg: "#E0F4EA", fg: "#06633B", text: `${actNow.length} live` }}
             style={{ minHeight: 0 }}>
          <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="tbl">
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Market · Window</th>
                  <th>Type</th>
                  <th>Election</th>
                  <th>Window</th>
                  <th className="num">Spend / Opp</th>
                </tr>
              </thead>
              <tbody>
                {actNow.map((r) => (
                  <tr key={r.politicalWindowKey}>
                    <td className="adv-name" title={`${r.state} · ${r.market}`}>
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.market}</span>
                        <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontWeight: 500 }}>{r.state} · {r.windowType}</span>
                      </div>
                    </td>
                    <td><TypeChip type={r.windowType} /></td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                        <span>{fmtCalDate(r.electionDate)}</span>
                        <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{r.daysToElection}d</span>
                      </div>
                    </td>
                    <td><WindowChip status={r.windowStatus} /></td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      <div>{Frc.fmtMoneyTight(r.marketSpend)}</div>
                      <div style={{ fontSize: 9.5, color: "var(--orange)", fontWeight: 700 }}>{Frc.fmtMoneyTight(r.cableOpportunity)} opp</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Viz>
      </div>
    </div>
  );
}

function GanttChart({ groups, rangeStart, rangeEnd }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 600, h: 360 });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth || 600, h: el.clientHeight || 360 });
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const labelW = 130;
  const pad = { left: labelW, right: 16, top: 28, bottom: 18 };
  const plotW = Math.max(50, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);

  const totalDays = (rangeEnd - rangeStart) / (1000 * 60 * 60 * 24);
  const xFor = (d) => pad.left + ((d - rangeStart) / (1000 * 60 * 60 * 24) / totalDays) * plotW;

  // Today/as-of line comes from the calendar bundle so workbook status and
  // visual status stay in sync.
  const firstWindow = groups[0] && groups[0].items && groups[0].items[0];
  const today = parseCalDate(firstWindow && firstWindow.asOfDate) || new Date("2026-05-15T00:00:00");

  // Month grid
  const months = [];
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  // Row layout: cap rows visible to first ~14 markets, scroll for rest
  const rowH = 22;
  const innerH = Math.max(plotH, groups.length * rowH);

  const statusColors = {
    "In Window":       "#00A859",
    "Opening Next 30": "#FFB600",
    "Future":          "#9CA3AF",
    "Completed":       "#D1D5DB",
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", borderTop: "1px solid var(--border)" }}>
        <svg width={W} height={pad.top + innerH + pad.bottom} style={{ display: "block" }}>
          {/* Month gridlines */}
          {months.map((m, i) => (
            <g key={i}>
              <line x1={xFor(m)} x2={xFor(m)} y1={pad.top - 14} y2={pad.top + innerH} stroke="#F1F2F4" strokeWidth="1" />
              <text x={xFor(m) + 3} y={pad.top - 16} fontSize="10" fill="#4B5563" fontWeight="500">
                {m.toLocaleDateString("en-US", { month: "short" })}
              </text>
            </g>
          ))}
          {/* Today line */}
          <line x1={xFor(today)} x2={xFor(today)} y1={pad.top - 6} y2={pad.top + innerH} stroke="#E4002B" strokeWidth="1.2" strokeDasharray="3,3" />
          <text x={xFor(today) + 4} y={pad.top - 6} fontSize="10" fill="#E4002B" fontWeight="700">Today</text>

          {/* Rows */}
          {groups.map((g, gi) => {
            const y = pad.top + gi * rowH;
            return (
              <g key={g.key || `${g.state}|${g.dma}`}>
                {gi % 2 === 0 && <rect x={0} y={y} width={W} height={rowH} fill="#FAFBFC" />}
                <text x={labelW - 8} y={y + rowH / 2 + 1} fontSize="11" fill="#111827" fontWeight="600" textAnchor="end">{g.market || g.dma}</text>
                <text x={labelW - 8} y={y + rowH / 2 + 11} fontSize="8.5" fill="#6B7280" fontWeight="500" textAnchor="end">{g.state}</text>
                {g.items.map((r, ri) => {
                  // Clamp bar start to plot area so bars whose window opened
                  // before our visible range don't overwrite the row labels.
                  const x1 = Math.max(pad.left, xFor(r.windowOpen));
                  const x2 = xFor(r.electionDateObj);
                  // Skip entirely if election is also off-screen left.
                  if (x2 < pad.left) return null;
                  const w = Math.max(2, x2 - x1);
                  const bh = Math.min(rowH - 6, 6 + Math.sqrt((r.total || 0) / 5_000_000) * 8);
                  const by = y + (rowH - bh) / 2;
                  const typeGroup = r.electionTypeGroup || electionTypeGroup(r.windowType);
                  const typeStyle = electionTypeStyles[typeGroup] || electionTypeStyles.Other;
                  return (
                    <g key={ri}>
                      <rect
                        x={x1} y={by} width={w} height={bh}
                        fill={statusColors[r.windowStatus]} rx="2" opacity="0.92"
                        stroke={typeStyle.stroke} strokeWidth={typeGroup === "General" ? 1.2 : 2}
                        strokeDasharray={typeGroup === "Runoff" ? "4,2" : typeGroup === "Primary" ? "2,2" : ""}
                      >
                        <title>{r.state} · {r.market} · {r.windowType}\nElection type: {typeGroup}\nWindow: {fmtCalDate(r.windowOpenDate)} → {fmtCalDate(r.electionDate)}\nSpend in market: {Frc.fmtMoneyTight(r.marketSpend)}</title>
                      </rect>
                      {w > 18 && bh > 9 && (
                        <text
                          x={x1 + 5} y={by + bh / 2 + 3}
                          fontSize="8" fill="#fff" fontWeight="800"
                          pointerEvents="none"
                        >{typeStyle.letter}</text>
                      )}
                      {/* Election day tick */}
                      <line x1={x2} x2={x2} y1={by - 2} y2={by + bh + 2} stroke="#111827" strokeWidth="1" />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {/* legend */}
      <div className="scatter-legend" style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        {Object.entries(statusColors).map(([k, c]) => (
          <span key={k} style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: c }}></span>{k}</span>
        ))}
        <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 2px" }}></span>
        {["General", "Primary", "Runoff", "Special"].map((k) => {
          const s = electionTypeStyles[k];
          return <span key={k} style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: s.stroke }}></span>{s.letter} = {k}</span>;
        })}
        <span style={{ fontSize: 10.5, color: "var(--text-secondary)", marginLeft: "auto" }}>
          Fill = status · border/letter = election type · thickness = matched market spend
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { RacePage, CalendarPage });
