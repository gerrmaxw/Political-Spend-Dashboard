/* global React */
// Shared chrome + visual building blocks for the Comcast Advertising
// Political Spend Dashboard prototype.

const { useState, useEffect, useRef, useMemo } = React;

const F = window.pbData;

// ---------------------------------------------------------------------------
//   Tiny inline icons (no third-party icon font)
// ---------------------------------------------------------------------------
const Icon = {
  Filter: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
  ),
  Calendar: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
  ),
  Refresh: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
  ),
  Share: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
  ),
  Download: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
  ),
  ChevDown: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
  ),
  Up: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
  ),
  Down: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
  ),
};

// ---------------------------------------------------------------------------
//   Stage — fills the entire viewport. The canvas itself uses 100vw/100vh
//   (with a 1280×720 floor to keep visuals readable on small windows), so no
//   transform-scale is needed. Inner pages stretch via flex/grid.
// ---------------------------------------------------------------------------
function Stage({ children }) {
  return (
    <div className="stage">
      <div className="canvas">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Header bar (top 56px) + page tabs (bottom 36px)
// ---------------------------------------------------------------------------
function PBIHeader({ snapshot, rowCount, source, resultsStatus, onExportPowerBI }) {
  const [exportBusy, setExportBusy] = useState(false);
  const sourceLabel = source && (source.startsWith("localStorage") || source.startsWith("IndexedDB"))
    ? "Admin-uploaded bundle (this device)"
    : source === "bundle" ? "Bundled snapshot"
    : source === "empty"  ? "No data loaded"
    : source || "—";
  async function handlePowerBIExport() {
    if (!onExportPowerBI || exportBusy) return;
    setExportBusy(true);
    try {
      await onExportPowerBI();
    } finally {
      setExportBusy(false);
    }
  }
  return (
    <div className="pbi-header">
      <div className="brand">
        <img className="brand-logo" src="assets/comcast-advertising-logo.png" alt="Comcast Advertising" />
        <div className="brand-divider"></div>
        <div>
          <div className="h-title">Political Spend Dashboard</div>
          <div className="h-sub">Political &amp; Issue · v3.2 · curated PBI model</div>
        </div>
      </div>
      <div className="h-right">
        <div className="snapshot-pill" title={sourceLabel}>
          <span className="dot"></span>
          Latest snapshot · {snapshot}
          {rowCount ? <span className="pill-sub"> · {rowCount.toLocaleString()} adv rows</span> : null}
        </div>
        <a className="admin-link" href="Admin.html" title="Upload weekly source xlsx files and rebuild the dataset.">Admin</a>
        <button
          className="export-btn"
          onClick={handlePowerBIExport}
          disabled={exportBusy}
          title={`Download a Power BI-ready XLSX with advertiser spend, entity classification, and CivicAPI result fields. CivicAPI status: ${resultsStatus || "idle"}.`}
        >
          <Icon.Download />
          {exportBusy ? "Preparing..." : "Power BI XLSX"}
        </button>
        <button className="icon-btn" title="Refresh"><Icon.Refresh /></button>
        <button className="icon-btn" title="Share"><Icon.Share /></button>
      </div>
    </div>
  );
}

const PAGES = [
  { id: "overview",  label: "Executive Overview",     idx: "01" },
  { id: "prospects", label: "Cable Prospect Finder",  idx: "02" },
  { id: "trend",     label: "Spend Trend",            idx: "03" },
  { id: "detail",    label: "Advertiser Detail",      idx: "04" },
  { id: "race",      label: "Race Explorer",          idx: "05" },
  { id: "calendar",  label: "Election Calendar",      idx: "06" },
  { id: "pac",       label: "PAC / FEC Breakdown",    idx: "07" },
  { id: "results",   label: "Completed Elections",    idx: "08" },
  { id: "casestudy", label: "Case Study Finder",      idx: "09" },
  { id: "health",    label: "Data Health",            idx: "10" },
];

function PBITabs({ active, onChange }) {
  return (
    <div className="pbi-tabs">
      {PAGES.map((p) => (
        <div
          key={p.id}
          className={`pbi-tab ${active === p.id ? "active" : ""} ${p.pending ? "pending" : ""}`}
          onClick={() => !p.pending && onChange(p.id)}
          title={p.pending ? "Planned — not built in this prototype" : p.label}
          data-screen-label={`${p.idx} ${p.label}`}
        >
          <span className="tab-idx">{p.idx}</span>
          <span>{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Slicer drawer
// ---------------------------------------------------------------------------
function SlicerDrawer({ filters, setFilters, options, onClear, extras }) {
  function Slicer({ label, valueKey, opts }) {
    return (
      <div className="slicer">
        <div className="slicer-label">{label}</div>
        <select
          className="slicer-select"
          value={filters[valueKey] || "All"}
          onChange={(e) => setFilters({ ...filters, [valueKey]: e.target.value })}
        >
          <option value="All">All</option>
          {opts.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
      </div>
    );
  }

  return (
    <div className="slicer-drawer">
      <div className="sd-title">
        <span><Icon.Filter /> &nbsp;Filters</span>
        <span className="clear" onClick={onClear}>Reset all</span>
      </div>
      <Slicer label="State"        valueKey="state"     opts={options.state} />
      <Slicer label="DMA / Market" valueKey="dma"       opts={options.dma} />
      <Slicer label="Office"       valueKey="office"    opts={options.office} />
      <Slicer label="Race Level"   valueKey="raceLevel" opts={options.raceLevel} />
      <Slicer label="Party"        valueKey="party"     opts={options.party} />
      <Slicer label="Agency (Optional)" valueKey="agency"    opts={options.agency} />
      <Slicer label="Advertiser Entity" valueKey="entityType" opts={options.entityType} />
      <Slicer label="Window Status" valueKey="window"   opts={options.window} />
      {extras}

      <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
        <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: 3, fontSize: 10.5 }}>Scope</div>
        Calendar-matched markets only. Unmatched spend is excluded from page-level KPIs.
        <div style={{ marginTop: 6, color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}>Political windows loaded:</span> <strong style={{ color: "var(--text-primary)" }}>{F.POLITICAL_WINDOWS_LOADED}</strong>
        </div>
        <div style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}>Unmatched advertisers:</span> <strong style={{ color: "var(--text-primary)" }}>{F.UNMATCHED_ADV_COUNT}</strong>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Visual container
// ---------------------------------------------------------------------------
function Viz({ title, desc, accent, children, style, className }) {
  return (
    <div className={`viz ${className || ""}`} style={style}>
      <div className="viz-header">
        <div>
          <div className="viz-title">{title}</div>
          {desc && <div className="viz-desc">{desc}</div>}
        </div>
        {accent && <span className="viz-accent" style={{ background: accent.bg, color: accent.fg }}>{accent.text}</span>}
      </div>
      <div className="viz-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   KPI card
// ---------------------------------------------------------------------------
function KPI({ title, value, desc, accent, delta }) {
  const accentClass = accent ? `accent-${accent}` : "";
  return (
    <div className={`kpi ${accentClass}`}>
      <div className="kpi-accent-bar"></div>
      <div className="kpi-title">{title}{delta && (
        <span className={`kpi-delta ${delta.dir}`}>
          {delta.dir === "up" ? <Icon.Up /> : <Icon.Down />}{delta.text}
        </span>
      )}</div>
      <div className={`kpi-val ${accentClass}`}>{value}</div>
      <div className="kpi-desc">{desc}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   100% stacked bar (media mix)
// ---------------------------------------------------------------------------
function StackedMediaMix({ broadcast, cable, ctv, digital, radio }) {
  const total = broadcast + cable + ctv + digital + radio || 1;
  // Drop media types with zero spend in the current snapshot so the chart
  // doesn't show a misleading "$0 · 0.0%" row for media types the dataset
  // doesn't actually track (the curated PBI model currently excludes
  // Digital, for example).
  const segs = [
    { key: "Broadcast", value: broadcast, color: "var(--blue)"   },
    { key: "Cable",     value: cable,     color: "var(--green)"  },
    { key: "CTV",       value: ctv,       color: "var(--purple)" },
    { key: "Digital",   value: digital,   color: "var(--orange)" },
    { key: "Radio",     value: radio,     color: "var(--yellow)" },
  ].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, flex: 1, minHeight: 0 }}>
      <div className="stacked100">
        {segs.map((s) => {
          const pct = s.value / total;
          if (pct < 0.001) return null;
          return (
            <div key={s.key} className="seg" style={{ width: `${pct * 100}%`, background: s.color }}>
              {pct > 0.05 ? `${(pct * 100).toFixed(1)}%` : ""}
            </div>
          );
        })}
      </div>

      {/* Per-media-type detail: short bars with $$ value */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
        {segs.map((s) => {
          const pct = s.value / Math.max(...segs.map((x) => x.value), 1);
          const sharePct = (s.value / total) * 100;
          return (
            <div key={s.key} style={{ display: "grid", gridTemplateColumns: "70px 1fr 78px 44px", alignItems: "center", gap: 8, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-primary)" }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: s.color }}></span>
                <span style={{ fontWeight: 500 }}>{s.key}</span>
              </div>
              <div style={{ height: 10, background: "#F3F4F6", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct * 100}%`, background: s.color }}></div>
              </div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--text-primary)" }}>{F.fmtMoneyTight(s.value)}</div>
              <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{sharePct.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Horizontal bar chart with optional reference line (Cable share by race)
// ---------------------------------------------------------------------------
function HBarChart({ rows, valueFormat, refLine, refLabel, maxOverride, compact }) {
  const max = maxOverride || Math.max(...rows.map((r) => r.value), 0.0001) * 1.05;
  const rowPad = compact ? 2 : 5;
  const barH = compact ? 14 : 18;
  return (
    <div style={{ marginTop: 4, position: "relative" }}>
      {rows.map((r) => {
        const pct = Math.max(0, Math.min(1, r.value / max));
        const color = r.color || "var(--blue)";
        return (
          <div key={r.label} className="bar-row" style={{ gridTemplateColumns: "118px 1fr 60px", padding: `${rowPad}px 0` }}>
            <div className="bar-label" title={r.label}>{r.label}</div>
            <div className="bar-track" style={{ position: "relative", height: barH }}>
              <div className="bar-fill" style={{ width: `${pct * 100}%`, background: color }}></div>
              {refLine != null && (
                <div className="ref-line" style={{ left: `${Math.min(1, refLine / max) * 100}%` }}></div>
              )}
            </div>
            <div className="bar-val">{valueFormat(r.value)}</div>
          </div>
        );
      })}
      {refLine != null && (
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4, paddingLeft: 126 }}>
          <span style={{ display: "inline-block", width: 14, borderTop: "1px dashed var(--text-secondary)", verticalAlign: "middle", marginRight: 6 }}></span>
          {refLabel} ({valueFormat(refLine)})
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Notes box
// ---------------------------------------------------------------------------
function NotesBox({ title, desc, accent }) {
  return (
    <div className={`notes ${accent || ""}`}>
      <div className="n-title">{title}</div>
      <div className="n-desc">{desc}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Slider card (what-if parameters)
// ---------------------------------------------------------------------------
function SliderCard({ title, desc, value, min, max, step, formatValue, prominent, onChange }) {
  return (
    <div className={`slider-card ${prominent ? "prominent" : ""}`}>
      <div className="sl-title">
        <span>{title}</span>
        <span className="sl-val">{formatValue(value)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="sl-desc">{desc}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Scatter chart (broadcast+CTV spend vs cable share)
// ---------------------------------------------------------------------------
function ScatterChart({ rows, vRef, hRef, raceLevels, raceColors, onHover, hover }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 700, h: 260 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    function update() {
      setSize({ w: el.clientWidth || 700, h: el.clientHeight || 260 });
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Use the measured container in CSS pixels as the viewBox so text and
  // strokes don't stretch and labels line up with the underlying grid.
  const width = size.w;
  const height = size.h;

  // Domain
  const xMaxRaw = Math.max(...rows.map((r) => r.bcCtvSpend), 100000);
  const xMax = Math.ceil(xMaxRaw / 500000) * 500000;
  const yMaxRaw = Math.max(...rows.map((r) => r.cableShare), hRef * 1.2, 0.18);
  const yMax = Math.min(0.55, Math.max(yMaxRaw * 1.15, hRef * 1.6));
  const sMax = Math.max(...rows.map((r) => r.total), 1);

  const pad = { left: 58, right: 16, top: 18, bottom: 38 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = Math.max(10, height - pad.top - pad.bottom);

  const xPos = (v) => pad.left + (Math.min(v, xMax) / xMax) * plotW;
  const yPos = (v) => pad.top + (1 - Math.min(v, yMax) / yMax) * plotH;
  const rSize = (v) => 3 + Math.sqrt(v / sMax) * 9;

  const xTickVals = Array.from({ length: 6 }, (_, i) => (xMax / 5) * i);
  const yTickVals = Array.from({ length: 6 }, (_, i) => (yMax / 5) * i);

  return (
    <div className="scatter-container" ref={containerRef}>
      <svg className="scatter-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid */}
        {yTickVals.map((v, i) => (
          <line key={"y" + i} x1={pad.left} y1={yPos(v)} x2={width - pad.right} y2={yPos(v)}
            stroke="#F1F2F4" strokeWidth="1" />
        ))}
        {xTickVals.map((v, i) => (
          <line key={"x" + i} x1={xPos(v)} y1={pad.top} x2={xPos(v)} y2={height - pad.bottom}
            stroke="#F1F2F4" strokeWidth="1" />
        ))}

        {/* Prospect zone */}
        <rect
          x={xPos(vRef)} y={pad.top}
          width={(width - pad.right) - xPos(vRef)}
          height={yPos(hRef) - pad.top}
          fill="#F37021" opacity="0.06"
        />
        <text x={(width - pad.right) - 6} y={pad.top + 13} textAnchor="end" fontSize="11" fill="#F37021" fontWeight="700" letterSpacing="1" opacity="0.85">
          PROSPECT ZONE
        </text>

        {/* Reference lines */}
        <line x1={xPos(vRef)} y1={pad.top} x2={xPos(vRef)} y2={height - pad.bottom}
          stroke="#F37021" strokeWidth="1.2" strokeDasharray="5,4" />
        <line x1={pad.left} y1={yPos(hRef)} x2={width - pad.right} y2={yPos(hRef)}
          stroke="#F37021" strokeWidth="1.2" strokeDasharray="5,4" />

        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#9CA3AF" strokeWidth="1" />
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#9CA3AF" strokeWidth="1" />

        {/* Tick labels */}
        {xTickVals.map((v, i) => (
          <text key={"xt" + i} x={xPos(v)} y={height - pad.bottom + 14} fontSize="10" fill="#4B5563" textAnchor="middle">
            {F.fmtMoneyTight(v)}
          </text>
        ))}
        {yTickVals.map((v, i) => (
          <text key={"yt" + i} x={pad.left - 8} y={yPos(v) + 3} fontSize="10" fill="#4B5563" textAnchor="end">
            {(v * 100).toFixed(0)}%
          </text>
        ))}

        {/* Reference line labels */}
        <text x={xPos(vRef) + 4} y={pad.top + 26} fontSize="10.5" fill="#F37021" fontWeight="700">
          TV floor {F.fmtMoneyTight(vRef)}
        </text>
        <text x={width - pad.right - 6} y={yPos(hRef) - 5} fontSize="10.5" fill="#F37021" fontWeight="700" textAnchor="end">
          target {(hRef * 100).toFixed(0)}%
        </text>

        {/* Axis titles */}
        <text x={pad.left + plotW / 2} y={height - 6} fontSize="11" fill="#374151" textAnchor="middle" fontWeight="600">
          Broadcast + CTV Spend →
        </text>
        <text x={16} y={pad.top + plotH / 2} fontSize="11" fill="#374151" textAnchor="middle" fontWeight="600"
          transform={`rotate(-90 16 ${pad.top + plotH / 2})`}>
          Cable Share ↑
        </text>

        {/* Dots */}
        {rows.map((r) => {
          const cx = xPos(r.bcCtvSpend);
          const cy = yPos(r.cableShare);
          const rr = rSize(r.total);
          const color = raceColors[r.raceLevel] || "var(--blue)";
          const isHover = hover && hover.advertiserKey === r.advertiserKey;
          return (
            <circle
              key={r.advertiserKey}
              cx={cx} cy={cy} r={rr}
              fill={color}
              fillOpacity={isHover ? 0.95 : 0.62}
              stroke={isHover ? "#111827" : "#fff"}
              strokeWidth={isHover ? 1.6 : 1}
              onMouseEnter={(e) => onHover(r, e)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}
      </svg>

      {hover && hover._x != null && (
        <div
          className="tooltip"
          style={{
            left: Math.min(hover._x + 14, 720),
            top:  Math.min(hover._y + 14, 360),
          }}
        >
          <div className="tt-title">{hover.advertiser}</div>
          <div className="tt-row"><span className="k">Agency</span><span className="v">{hover.agency}</span></div>
          <div className="tt-row"><span className="k">Market</span><span className="v">{hover.dma}, {hover.state}</span></div>
          <div className="tt-row"><span className="k">Office</span><span className="v">{hover.office}</span></div>
          <div className="tt-row"><span className="k">Race level</span><span className="v">{hover.raceLevel}</span></div>
          <div className="tt-row"><span className="k">Broadcast</span><span className="v">{F.fmtMoneyTight(hover.broadcast)}</span></div>
          <div className="tt-row"><span className="k">CTV</span><span className="v">{F.fmtMoneyTight(hover.ctv)}</span></div>
          <div className="tt-row"><span className="k">Cable</span><span className="v">{F.fmtMoneyTight(hover.cable)}</span></div>
          <div className="tt-row"><span className="k">Cable share</span><span className="v">{F.fmtPct(hover.cableShare)}</span></div>
          <div className="tt-row"><span className="k">Cable opportunity</span><span className="v" style={{ color: "var(--orange)" }}>{F.fmtMoneyTight(hover.cableOpportunity)}</span></div>
          <div className="tt-row"><span className="k">Window</span><span className="v">{hover.windowStatus}</span></div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//   Race-level color palette
// ---------------------------------------------------------------------------
const RACE_COLORS = {
  "Federal Senate":     "#005EB8",
  "Federal House":      "#6A1B9A",
  "Governor":           "#00A859",
  "Statewide Office":   "#F37021",
  "State Legislature":  "#FFB600",
  "Mayor / Local":      "#4B5563",
  "Ballot Measure":     "#E4002B",
};

// ---------------------------------------------------------------------------
//   Helpers used by tables
// ---------------------------------------------------------------------------
function CableShareCell({ value, target }) {
  let chip = "chip-green";
  if (value < target * 0.6) chip = "chip-red";
  else if (value < target) chip = "chip-yellow";
  return <span className={`chip ${chip}`}>{F.fmtPct(value)}</span>;
}

function OpportunityBar({ value, max }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="data-bar">
      <div className="fill" style={{ width: `${pct * 100}%` }}></div>
      <span className="val">{F.fmtMoneyTight(value)}</span>
    </div>
  );
}

function ProspectLabelChip({ label }) {
  const map = {
    "Zero Cable":   "chip-red",
    "Low Cable":    "chip-orange",
    "Cable In Mix": "chip-gray",
    "No TV Spend":  "chip-mutedgray",
  };
  return <span className={`chip ${map[label] || "chip-gray"}`}>{label}</span>;
}

function WindowChip({ status }) {
  const map = {
    "In Window":        "chip-green",
    "Opening Next 30":  "chip-yellow",
    "Future":           "chip-gray",
    "Completed":        "chip-mutedgray",
  };
  return <span className={`chip ${map[status] || "chip-gray"}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Expose everything to other Babel files via window
// ---------------------------------------------------------------------------
Object.assign(window, {
  Icon, Stage, PBIHeader, PBITabs, PAGES, SlicerDrawer,
  Viz, KPI, StackedMediaMix, HBarChart, NotesBox,
  SliderCard, ScatterChart, RACE_COLORS,
  CableShareCell, OpportunityBar, ProspectLabelChip, WindowChip,
});
