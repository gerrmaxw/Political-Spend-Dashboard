/* global React */
// Page 3 — Spend Trend
// Page 4 — Advertiser / Candidate Detail

const { useState: useStateTD, useMemo: useMemoTD } = React;
const Ftd = window.pbData;

// ===========================================================================
// Page 3 — Spend Trend
// ===========================================================================
function TrendPage({ filteredRows, filters }) {
  const [breakdown, setBreakdown] = useStateTD("media"); // "media" | "race" | "party"
  const [hoverPt, setHoverPt] = useStateTD(null);

  // Per-snapshot cumulative by breakdown segment.
  const series = useMemoTD(() => {
    return Ftd.SNAPSHOTS.map((s) => {
      const segments = {};
      filteredRows.forEach((r) => {
        const segKeys = (breakdown === "media")
          ? [["Broadcast", r.broadcast], ["Cable", r.cable], ["CTV", r.ctv], ["Digital", r.digital], ["Radio", r.radio]]
          : (breakdown === "race")
            ? [[r.raceLevel, r.total]]
            : [[r.party, r.total]];
        segKeys.forEach(([k, v]) => {
          segments[k] = (segments[k] || 0) + Ftd.trendCurve(s.key, v);
        });
      });
      return { ...s, segments, total: Object.values(segments).reduce((a, b) => a + b, 0) };
    });
  }, [filteredRows, breakdown]);

  const segKeys = useMemoTD(() => {
    const totals = {};
    series.forEach((s) => Object.entries(s.segments).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  }, [series]);

  const segColors = (k) => {
    if (breakdown === "media") return ({
      Broadcast: "#008CC3", Cable: "#00A859", CTV: "#6A1B9A", Digital: "#F37021", Radio: "#FFB600",
    })[k] || "#4B5563";
    if (breakdown === "race") return window.RACE_COLORS[k] || "#4B5563";
    return ({ DEM: "#1F4E8F", REP: "#C81E2E", IND: "#6A1B9A", PAC: "#F37021", Issue: "#FFB600" })[k] || "#4B5563";
  };

  // Weekly added: diff from previous snapshot
  const weeklyAdded = useMemoTD(() => {
    return series.map((s, i) => {
      if (i === 0) return { ...s, added: 0, addedSegments: {} };
      const prev = series[i - 1];
      const added = s.total - prev.total;
      const addedSegments = {};
      Object.keys(s.segments).forEach((k) => {
        addedSegments[k] = (s.segments[k] || 0) - (prev.segments[k] || 0);
      });
      return { ...s, added, addedSegments };
    });
  }, [series]);

  // Top movers since 8 snapshots ago
  const movers = useMemoTD(() => {
    const start = 8; // 8 weeks ago
    return filteredRows.map((r) => {
      const cur = Ftd.trendCurve(15, r.total);
      const past = Ftd.trendCurve(start, r.total);
      return { ...r, weekDelta: cur - past, cur, past };
    }).sort((a, b) => b.weekDelta - a.weekDelta).slice(0, 10);
  }, [filteredRows]);
  const maxMover = Math.max(...movers.map((r) => r.weekDelta), 1);

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Spend Trend</div>
          <div className="subtitle">Cumulative political spend across weekly snapshots, with week-over-week additions and the advertisers driving the most movement.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPI title="Snapshots Loaded" value={Ftd.SNAPSHOTS.length.toString()}
             desc={`Weekly snapshots ending ${Ftd.SNAPSHOTS[Ftd.SNAPSHOTS.length - 1].label}.`} accent="blue" />
        <KPI title="Cumulative Spend"
             value={Ftd.fmtMoney(series[series.length - 1].total)}
             desc="Total reported political spend through latest snapshot."
             delta={{ dir: "up", text: "+12.4% wk" }} />
        <KPI title="Last Week Added"
             value={Ftd.fmtMoney(weeklyAdded[weeklyAdded.length - 1].added)}
             desc="New spend logged between the prior and latest snapshot." accent="green" />
        <KPI title="Pace vs. Prior Week"
             value={paceLabel(weeklyAdded)}
             desc="Latest weekly add compared with the week before." accent={paceAccent(weeklyAdded)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* LEFT — cumulative line + weekly column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <Viz
            title="Cumulative Spend by Snapshot"
            desc={`Sum of reported political spend through each weekly snapshot, broken down by ${breakdownLabel(breakdown)}.`}
            accent={{ bg: "#F3F4F6", fg: "#4B5563", text: breakdownLabel(breakdown) }}
            style={{ flex: 1.4, minHeight: 0 }}
          >
            <BreakdownToggle value={breakdown} onChange={setBreakdown} />
            <CumulativeLineChart series={series} segKeys={segKeys} segColors={segColors} setHover={setHoverPt} hover={hoverPt} />
          </Viz>
          <Viz
            title="Weekly Added Spend"
            desc="New spend recorded between snapshots. Stacked by the same breakdown as the line chart."
            style={{ flex: 1, minHeight: 0 }}
          >
            <WeeklyColumnChart data={weeklyAdded} segKeys={segKeys} segColors={segColors} />
          </Viz>
        </div>

        {/* RIGHT — top movers */}
        <Viz
          title="Top Movers · Last 8 Weeks"
          desc="Advertisers with the largest absolute spend increase over the trailing 8 snapshots."
          style={{ minHeight: 0 }}
        >
          <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="tbl">
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th className="num">8wk ago</th>
                  <th className="num">Latest</th>
                  <th className="num">Δ ↓</th>
                </tr>
              </thead>
              <tbody>
                {movers.map((r) => (
                  <tr key={r.advertiserKey}>
                    <td className="adv-name" title={r.advertiser}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 4, height: 14, borderRadius: 2, background: window.RACE_COLORS[r.raceLevel] }}></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.advertiser}</span>
                      </div>
                    </td>
                    <td className="num" style={{ color: "var(--text-secondary)" }}>{Ftd.fmtMoneyTight(r.past)}</td>
                    <td className="num">{Ftd.fmtMoneyTight(r.cur)}</td>
                    <td>
                      <div className="data-bar">
                        <div className="fill" style={{ width: `${(r.weekDelta / maxMover) * 100}%`, background: "var(--green-soft)" }}></div>
                        <span className="val" style={{ color: "var(--green)" }}>+{Ftd.fmtMoneyTight(r.weekDelta)}</span>
                      </div>
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

function paceLabel(weekly) {
  if (weekly.length < 2) return "—";
  const cur = weekly[weekly.length - 1].added;
  const prev = weekly[weekly.length - 2].added;
  if (prev === 0) return "—";
  const d = (cur - prev) / prev;
  return (d >= 0 ? "+" : "") + (d * 100).toFixed(1) + "%";
}
function paceAccent(weekly) {
  if (weekly.length < 2) return null;
  const cur = weekly[weekly.length - 1].added;
  const prev = weekly[weekly.length - 2].added;
  return cur >= prev ? "green" : "orange";
}

function breakdownLabel(b) {
  return ({ media: "Media Type", race: "Race Level", party: "Party" })[b];
}

function BreakdownToggle({ value, onChange }) {
  const opts = [["media", "Media Type"], ["race", "Race Level"], ["party", "Party"]];
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginRight: 8 }}>Breakdown:</span>
      <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 3, overflow: "hidden" }}>
        {opts.map(([k, lbl], i) => (
          <button key={k} onClick={() => onChange(k)} style={{
            background: value === k ? "var(--blue)" : "#fff",
            color: value === k ? "#fff" : "var(--text-secondary)",
            border: "none", padding: "3px 10px", fontSize: 10.5, fontFamily: "inherit",
            cursor: "pointer", fontWeight: value === k ? 600 : 500,
            borderRight: i < opts.length - 1 ? "1px solid var(--border)" : "none",
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function CumulativeLineChart({ series, segKeys, segColors, setHover, hover }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 600, h: 260 });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth || 600, h: el.clientHeight || 260 });
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const pad = { left: 50, right: 16, top: 12, bottom: 28 };
  const plotW = Math.max(20, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);
  const maxTotal = Math.max(...series.map((s) => s.total), 1);
  const yMax = Math.ceil(maxTotal / 100_000_000) * 100_000_000;

  const xPos = (i) => pad.left + (i / (series.length - 1)) * plotW;
  const yPos = (v) => pad.top + (1 - v / yMax) * plotH;

  // Per-segment path
  const lines = segKeys.map((k) => {
    const pts = series.map((s, i) => [xPos(i), yPos(s.segments[k] || 0)]);
    const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return { key: k, d, color: segColors(k), last: pts[pts.length - 1] };
  });

  const totalPath = series.map((s, i) => (i === 0 ? "M" : "L") + xPos(i).toFixed(1) + " " + yPos(s.total).toFixed(1)).join(" ");

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }} ref={containerRef}
      onMouseMove={(e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < pad.left || x > W - pad.right) { setHover(null); return; }
        const i = Math.round(((x - pad.left) / plotW) * (series.length - 1));
        const idx = Math.max(0, Math.min(series.length - 1, i));
        setHover({ idx, x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* y gridlines */}
        {Array.from({ length: 5 }, (_, i) => yMax * (i / 4)).map((v, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={yPos(v)} y2={yPos(v)} stroke="#F1F2F4" strokeWidth="1" />
            <text x={pad.left - 6} y={yPos(v) + 3} fontSize="10" fill="#4B5563" textAnchor="end">{Ftd.fmtMoneyTight(v)}</text>
          </g>
        ))}
        {/* x labels (every other snapshot to avoid crowding) */}
        {series.map((s, i) => (
          (i % 2 === 0 || i === series.length - 1) && (
            <text key={i} x={xPos(i)} y={H - 10} fontSize="10" fill="#4B5563" textAnchor="middle">{s.label}</text>
          )
        ))}

        {/* segment lines */}
        {lines.map((l) => (
          <path key={l.key} d={l.d} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* total line (dashed) */}
        <path d={totalPath} fill="none" stroke="#111827" strokeWidth="1.4" strokeDasharray="4,3" />

        {/* hover crosshair */}
        {hover && (
          <g>
            <line x1={xPos(hover.idx)} x2={xPos(hover.idx)} y1={pad.top} y2={H - pad.bottom} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="3,2" />
            {lines.map((l) => (
              <circle key={l.key} cx={xPos(hover.idx)} cy={yPos(series[hover.idx].segments[l.key] || 0)} r="3.2" fill={l.color} stroke="#fff" strokeWidth="1.4" />
            ))}
          </g>
        )}
      </svg>

      {/* legend */}
      <div className="scatter-legend" style={{ position: "absolute", top: 6, left: pad.left + 6, gap: 10 }}>
        {segKeys.map((k) => (
          <span key={k} style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: segColors(k) }}></span>{k}</span>
        ))}
        <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
          <span style={{ display: "inline-block", width: 14, borderTop: "1.4px dashed #111827", verticalAlign: "middle", marginRight: 4 }}></span>
          Total
        </span>
      </div>

      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 14, W - 220), top: Math.min(hover.y + 14, H - 200) }}>
          <div className="tt-title">{series[hover.idx].label}</div>
          <div className="tt-row"><span className="k">Total</span><span className="v">{Ftd.fmtMoneyTight(series[hover.idx].total)}</span></div>
          {segKeys.map((k) => (
            <div key={k} className="tt-row">
              <span className="k"><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: segColors(k), marginRight: 5 }}></span>{k}</span>
              <span className="v">{Ftd.fmtMoneyTight(series[hover.idx].segments[k] || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WeeklyColumnChart({ data, segKeys, segColors }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 600, h: 160 });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth || 600, h: el.clientHeight || 160 });
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = size.w, H = size.h;
  const pad = { left: 50, right: 16, top: 8, bottom: 24 };
  const plotW = Math.max(20, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);

  const maxAdd = Math.max(...data.map((d) => d.added), 1);
  const yMax = Math.ceil(maxAdd / 10_000_000) * 10_000_000;
  const barW = (plotW / data.length) * 0.7;

  return (
    <div style={{ flex: 1, minHeight: 0 }} ref={containerRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {Array.from({ length: 4 }, (_, i) => yMax * (i / 3)).map((v, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={pad.top + (1 - v / yMax) * plotH} y2={pad.top + (1 - v / yMax) * plotH} stroke="#F1F2F4" strokeWidth="1" />
            <text x={pad.left - 6} y={pad.top + (1 - v / yMax) * plotH + 3} fontSize="10" fill="#4B5563" textAnchor="end">{Ftd.fmtMoneyTight(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          if (i === 0) return null;
          const cx = pad.left + ((i + 0.5) / data.length) * plotW;
          let runningY = pad.top + plotH;
          return (
            <g key={i}>
              {segKeys.map((k) => {
                const v = d.addedSegments[k] || 0;
                if (v <= 0) return null;
                const h = (v / yMax) * plotH;
                runningY -= h;
                return <rect key={k} x={cx - barW / 2} y={runningY} width={barW} height={h} fill={segColors(k)} />;
              })}
              {(i % 2 === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 8} fontSize="10" fill="#4B5563" textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ===========================================================================
// Page 4 — Advertiser / Candidate Detail
// ===========================================================================
function DetailPage({ filteredRows, filters }) {
  const initial = filteredRows.find((r) => r.cableProspectFlag === 1) || filteredRows[0];
  const [advertiserKey, setAdvertiserKey] = useStateTD(initial?.advertiserKey ?? 1);

  const adv = useMemoTD(() =>
    filteredRows.find((r) => r.advertiserKey === advertiserKey) || filteredRows[0],
    [filteredRows, advertiserKey]
  );

  // Build snapshot trend for this advertiser
  const snapTrend = useMemoTD(() => {
    if (!adv) return [];
    return Ftd.SNAPSHOTS.map((s) => ({
      ...s,
      broadcast: Ftd.trendCurve(s.key, adv.broadcast),
      cable:     Ftd.trendCurve(s.key, adv.cable),
      ctv:       Ftd.trendCurve(s.key, adv.ctv),
      digital:   Ftd.trendCurve(s.key, adv.digital),
      radio:     Ftd.trendCurve(s.key, adv.radio),
      total:     Ftd.trendCurve(s.key, adv.total),
    }));
  }, [adv]);

  // Synthesized station-level broadcast spend table
  const stationTable = useMemoTD(() => {
    if (!adv || adv.broadcast === 0) return [];
    const stations = Ftd.stationsFor(adv.dma);
    // Distribute broadcast across stations with weighting and add some cable nets
    const cableNets = ["ESPN", "CNN", "Fox News", "MSNBC", "Hallmark", "Hist.", "USA"];
    const wTV = [0.34, 0.28, 0.22, 0.16];
    const rows = stations.map((s, i) => ({
      kind: "Broadcast", call: s.call, network: s.net,
      spend: Math.round(adv.broadcast * (wTV[i] || 0.1)),
    }));
    if (adv.cable > 0) {
      const wCa = [0.30, 0.22, 0.18, 0.14, 0.10, 0.06];
      cableNets.slice(0, 6).forEach((n, i) => {
        rows.push({ kind: "Cable", call: "—", network: n, spend: Math.round(adv.cable * wCa[i]) });
      });
    }
    return rows.sort((a, b) => b.spend - a.spend);
  }, [adv]);

  // Outside spend (PACs that targeted this race level + state)
  const outside = useMemoTD(() => {
    if (!adv) return [];
    return Ftd.PAC_ROWS.filter((p) => p.target === adv.advertiser);
  }, [adv]);

  // Advertiser picker — searchable
  const [search, setSearch] = useStateTD("");
  const picks = useMemoTD(() => {
    const q = search.toLowerCase().trim();
    const sorted = [...filteredRows].sort((a, b) => b.total - a.total);
    return (q ? sorted.filter((r) => r.advertiser.toLowerCase().includes(q)) : sorted).slice(0, 60);
  }, [filteredRows, search]);

  if (!adv) {
    return <div className="page-content"><div style={{ padding: 24, color: "var(--text-muted)" }}>No advertisers in the current filter set.</div></div>;
  }

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Advertiser Detail</div>
          <div className="subtitle">Drillthrough view for a single advertiser: media mix, snapshot trend, station-level placement, and outside spend touching the same race.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* LEFT — advertiser picker */}
        <Viz title="Pick Advertiser" desc="Sorted by current spend within the active filter set." style={{ minHeight: 0 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advertisers…"
            className="slicer-select"
            style={{ height: 28, marginBottom: 6 }}
          />
          <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid var(--border)" }}>
            {picks.map((r) => (
              <div
                key={r.advertiserKey}
                onClick={() => setAdvertiserKey(r.advertiserKey)}
                style={{
                  padding: "6px 6px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  background: r.advertiserKey === adv.advertiserKey ? "var(--blue-soft)" : "#fff",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ width: 4, height: 14, borderRadius: 2, background: window.RACE_COLORS[r.raceLevel], flexShrink: 0 }}></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.advertiser}</div>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dma} · {r.raceLevel}</div>
                </div>
                <div style={{ fontSize: 10, fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)", fontWeight: 600 }}>{Ftd.fmtMoneyTight(r.total)}</div>
              </div>
            ))}
          </div>
        </Viz>

        {/* RIGHT — detail body */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          {/* Advertiser header card */}
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 4, height: 48, borderRadius: 2, background: window.RACE_COLORS[adv.raceLevel] }}></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{adv.advertiser}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {adv.raceLevel} · {adv.office} · {adv.dma}, {adv.state} · Agency: {adv.agency}
              </div>
            </div>
            <DetailKpi label="Total Spend" value={Ftd.fmtMoney(adv.total)} />
            <DetailKpi label="Bcast + CTV" value={Ftd.fmtMoney(adv.bcCtvSpend)} />
            <DetailKpi label="Cable Share" value={Ftd.fmtPct(adv.cableShare)} accent={adv.cableShare < 0.12 ? "red" : "primary"} />
            <DetailKpi label="Cable Opp" value={Ftd.fmtMoney(adv.cableOpportunity)} accent="orange" />
            <DetailKpi label="Window" value={adv.windowStatus} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
            <Viz title="Media Mix" desc="Current spend split across media types for this advertiser." style={{ minHeight: 0 }}>
              <StackedMediaMix broadcast={adv.broadcast} cable={adv.cable} ctv={adv.ctv} digital={adv.digital} radio={adv.radio} />
            </Viz>

            <Viz title="Spend Trend by Snapshot" desc="Cumulative spend for this advertiser through each weekly snapshot." style={{ minHeight: 0 }}>
              <DetailTrendChart trend={snapTrend} />
            </Viz>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8, minHeight: 0, flex: 0.95 }}>
            <Viz title="Stations &amp; Networks" desc="Broadcast and cable placement detail for this advertiser." style={{ minHeight: 0 }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "30%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Call / Network</th>
                      <th>Network</th>
                      <th className="num">Spend ↓</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stationTable.map((r, i) => (
                      <tr key={i}>
                        <td><span className={`chip ${r.kind === "Broadcast" ? "chip-blue" : "chip-green"}`}>{r.kind}</span></td>
                        <td style={{ fontWeight: 600 }}>{r.call}</td>
                        <td>{r.network}</td>
                        <td><OpportunityBar value={r.spend} max={Math.max(...stationTable.map((x) => x.spend), 1)} /></td>
                      </tr>
                    ))}
                    {stationTable.length === 0 && (
                      <tr><td colSpan="4" style={{ padding: 12, textAlign: "center", color: "var(--text-muted)" }}>No TV placement for this advertiser.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Viz>

            <Viz title="Outside Spend Touching This Race" desc="PAC and outside-group spend supporting or opposing this candidate." style={{ minHeight: 0 }}>
              <div className="tbl-wrap">
                <table className="tbl">
                  <colgroup>
                    <col style={{ width: "55%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "23%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Committee</th>
                      <th className="num">Support</th>
                      <th className="num">Oppose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outside.length === 0 ? (
                      <tr><td colSpan="3" style={{ padding: 12, textAlign: "center", color: "var(--text-muted)" }}>No outside spend recorded against this race.</td></tr>
                    ) : outside.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.committee} <span className={`chip ${p.alignment === "DEM" ? "chip-blue" : "chip-red"}`} style={{ marginLeft: 4 }}>{p.alignment}</span></td>
                        <td className="num" style={{ color: "var(--green)" }}>{Ftd.fmtMoneyTight(p.support)}</td>
                        <td className="num" style={{ color: "var(--red)" }}>{Ftd.fmtMoneyTight(p.oppose)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Viz>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailKpi({ label, value, accent }) {
  const color = accent === "orange" ? "var(--orange)" : accent === "red" ? "var(--red)" : "var(--text-primary)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 80, paddingLeft: 12, borderLeft: "1px solid var(--border)" }}>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function DetailTrendChart({ trend }) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({ w: 400, h: 220 });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth || 400, h: el.clientHeight || 220 });
    update();
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = size.w, H = size.h;
  const pad = { left: 50, right: 14, top: 12, bottom: 24 };
  const plotW = Math.max(20, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);
  const yMax = Math.max(...trend.map((s) => s.total), 1) * 1.1;
  const xPos = (i) => pad.left + (i / (trend.length - 1)) * plotW;
  const yPos = (v) => pad.top + (1 - v / yMax) * plotH;
  const series = [
    { k: "broadcast", c: "#008CC3" },
    { k: "cable", c: "#00A859" },
    { k: "ctv", c: "#6A1B9A" },
    { k: "digital", c: "#F37021" },
    { k: "radio", c: "#FFB600" },
  ];
  return (
    <div style={{ flex: 1, minHeight: 0 }} ref={containerRef}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {Array.from({ length: 4 }, (_, i) => yMax * (i / 3)).map((v, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={yPos(v)} y2={yPos(v)} stroke="#F1F2F4" strokeWidth="1" />
            <text x={pad.left - 6} y={yPos(v) + 3} fontSize="10" fill="#4B5563" textAnchor="end">{Ftd.fmtMoneyTight(v)}</text>
          </g>
        ))}
        {trend.map((s, i) => (
          (i % 3 === 0 || i === trend.length - 1) && (
            <text key={i} x={xPos(i)} y={H - 8} fontSize="10" fill="#4B5563" textAnchor="middle">{s.label}</text>
          )
        ))}
        {series.map((s) => {
          const d = trend.map((p, i) => (i === 0 ? "M" : "L") + xPos(i).toFixed(1) + " " + yPos(p[s.k]).toFixed(1)).join(" ");
          return <path key={s.k} d={d} fill="none" stroke={s.c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
    </div>
  );
}

Object.assign(window, { TrendPage, DetailPage });
