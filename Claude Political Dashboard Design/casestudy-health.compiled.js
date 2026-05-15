(function(){
/* global React */
// Page 9 — Case Study Finder
// Page 10 — Data Health + Mapping Review

const {
  useState: useStateCH,
  useMemo: useMemoCH
} = React;
const Fch = window.pbData;

// ===========================================================================
// Page 9 — Case Study Finder
// ===========================================================================
function CaseStudyPage({
  filteredRows,
  filters
}) {
  const [statusFilter, setStatusFilter] = useStateCH("All");
  const [scoreFloor, setScoreFloor] = useStateCH(40);
  const cases = useMemoCH(() => {
    // Merge in the runtime-computed measures (cableOpportunity etc.) from
    // filteredRows — Fch.CASE_STUDIES carries narrative metadata, but
    // opportunity-style numbers only exist on the live filtered rows.
    const advByKey = new Map(filteredRows.map(r => [r.advertiserKey, r]));
    return Fch.CASE_STUDIES.filter(c => advByKey.has(c.advertiserKey)).map(c => ({
      ...advByKey.get(c.advertiserKey),
      ...c
    }))
    // Case Study Library: only advertisers with a 2026 election result loaded
    // (primary or general, won or lost). Races with no result yet are excluded
    // since there is no outcome to build a proof point around.
    .filter(c => c.hasElectionResult).filter(c => statusFilter === "All" ? true : c.status === statusFilter).filter(c => c.caseStudyScore >= scoreFloor).sort((a, b) => b.caseStudyScore - a.caseStudyScore);
  }, [filteredRows, statusFilter, scoreFloor]);

  // Status breakdown counts — only over advertisers with election results loaded
  const statusCounts = useMemoCH(() => {
    const advByKey = new Map(filteredRows.map(r => [r.advertiserKey, r]));
    const m = new Map();
    Fch.CASE_STUDIES.filter(c => advByKey.has(c.advertiserKey) && advByKey.get(c.advertiserKey).hasElectionResult).forEach(c => {
      m.set(c.status, (m.get(c.status) || 0) + 1);
    });
    return Fch.CASE_STUDY_STATUS.map(s => ({
      status: s,
      count: m.get(s) || 0
    }));
  }, [filteredRows]);
  const statusChipClass = s => ({
    "Drafting": "chip-gray",
    "Approved For Sales": "chip-green",
    "Live": "chip-blue",
    "Pending Approval": "chip-yellow",
    "Archived": "chip-mutedgray"
  })[s] || "chip-gray";
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Case Study Library"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Advertisers with CivicAPI certified primary or general results. Ranked by Case Study Score \u2014 outcomes help identify complete proof points.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(5, 1fr)"
    }
  }, statusCounts.map(s => /*#__PURE__*/React.createElement(KPI, {
    key: s.status,
    title: s.status,
    value: s.count.toString(),
    desc: `Advertisers currently flagged as "${s.status}".`,
    accent: s.status === "Approved For Sales" ? "green" : s.status === "Live" ? "blue" : s.status === "Pending Approval" ? "orange" : null
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "260px 1fr",
      gap: 8,
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "slider-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sl-title"
  }, /*#__PURE__*/React.createElement("span", null, "Status filter")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      marginTop: 4
    }
  }, ["All", ...Fch.CASE_STUDY_STATUS].map(s => /*#__PURE__*/React.createElement("label", {
    key: s,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "cs-status",
    checked: statusFilter === s,
    onChange: () => setStatusFilter(s)
  }), s === "All" ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-primary)",
      fontWeight: 600
    }
  }, "All statuses") : /*#__PURE__*/React.createElement("span", {
    className: `chip ${statusChipClass(s)}`
  }, s))))), /*#__PURE__*/React.createElement(SliderCard, {
    title: "Minimum Case Study Score",
    desc: "Composite of cable opportunity size, sub-target cable share, total scale, and timing within window.",
    value: scoreFloor,
    min: 0,
    max: 100,
    step: 1,
    formatValue: v => v + " pts",
    prominent: true,
    onChange: setScoreFloor
  }), /*#__PURE__*/React.createElement(Viz, {
    title: "What makes a strong case study?",
    desc: "Components of the Case Study Score.",
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(ScoreRow, {
    label: "Cable opportunity size",
    weight: "40 pts",
    detail: "Capped at $800K opportunity."
  }), /*#__PURE__*/React.createElement(ScoreRow, {
    label: "Sub-target cable share",
    weight: "30 pts",
    detail: "Closer to 0% cable = stronger story."
  }), /*#__PURE__*/React.createElement(ScoreRow, {
    label: "Total spend scale",
    weight: "20 pts",
    detail: "Capped at $5M total."
  }), /*#__PURE__*/React.createElement(ScoreRow, {
    label: "Inside political window",
    weight: "10 pts",
    detail: "In Window = 10, Opening Next 30 = 6."
  })))), /*#__PURE__*/React.createElement(Viz, {
    title: "Ranked Case Study Candidates",
    desc: "Sorted by Case Study Score. Use this list to pick the next proof points to write up.",
    accent: {
      bg: "#E0F4EA",
      fg: "#06633B",
      text: `${cases.length} candidates`
    },
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap",
    style: {
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "16%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "14%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "17%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "11%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Advertiser"), /*#__PURE__*/React.createElement("th", null, "Race"), /*#__PURE__*/React.createElement("th", null, "Election Result"), /*#__PURE__*/React.createElement("th", null, "Narrative"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Score \u2193"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable Opp"), /*#__PURE__*/React.createElement("th", null, "Status"), /*#__PURE__*/React.createElement("th", null, "Owner"), /*#__PURE__*/React.createElement("th", null, "Deck"))), /*#__PURE__*/React.createElement("tbody", null, cases.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "9",
    style: {
      padding: 24,
      textAlign: "center",
      color: "var(--text-muted)"
    }
  }, Fch.ELECTION_RESULTS_STATUS === "loading" ? "Loading certified results from CivicAPI…" : Fch.ELECTION_RESULTS_STATUS === "idle" ? "Election results not yet loaded." : "No case study candidates with election results match the current filters.")) : cases.map(c => /*#__PURE__*/React.createElement("tr", {
    key: c.advertiserKey
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name",
    title: c.advertiser
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 4,
      height: 14,
      borderRadius: 2,
      background: window.RACE_COLORS[c.raceLevel]
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, c.advertiser))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: "var(--text-secondary)"
    }
  }, c.raceLevel)), /*#__PURE__*/React.createElement("td", null, c.electionResult && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `chip ${c.electionResult.won ? "chip-green" : "chip-red"}`
  }, c.electionResult.won ? "Won" : "Lost"), /*#__PURE__*/React.createElement("span", {
    className: "chip chip-gray",
    style: {
      textTransform: "capitalize"
    }
  }, c.electionResult.electionType)), c.electionResult.voteShare != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: "var(--text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, (c.electionResult.voteShare * 100).toFixed(1), "% vote share"))), /*#__PURE__*/React.createElement("td", {
    style: {
      whiteSpace: "normal",
      color: "var(--text-secondary)",
      fontSize: 10.5,
      lineHeight: 1.3
    }
  }, c.narrative), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(ScoreBar, {
    score: c.caseStudyScore
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700,
      color: c.caseStudyScore >= 70 ? "var(--green)" : c.caseStudyScore >= 40 ? "var(--text-primary)" : "var(--text-muted)"
    }
  }, c.caseStudyScore))), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      color: "var(--orange)",
      fontWeight: 600
    }
  }, Fch.fmtMoneyTight(c.cableOpportunity)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: `chip ${statusChipClass(c.status)}`
  }, c.status), c.approvedForSales && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4,
      fontSize: 11,
      color: "var(--green)"
    },
    title: "Approved for Sales"
  }, "\u2713")), /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 10.5
    }
  }, c.owner), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: "var(--blue)",
      textDecoration: "none",
      fontSize: 10.5,
      fontWeight: 600
    },
    title: c.deckLink
  }, "Open \u2197"))))))))));
}
function ScoreRow({
  label,
  weight,
  detail
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: "var(--text-primary)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--blue)",
      fontWeight: 600
    }
  }, weight)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--text-secondary)",
      lineHeight: 1.3
    }
  }, detail));
}
function ScoreBar({
  score
}) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--blue)" : "var(--text-muted)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 8,
      background: "#F3F4F6",
      borderRadius: 2,
      position: "relative",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${score}%`,
      height: "100%",
      background: color,
      borderRadius: 2
    }
  }));
}

// ===========================================================================
// Page 10 — Data Health + Mapping Review
// ===========================================================================
function HealthPage({
  filteredRows,
  filters
}) {
  const dh = Fch.DATA_HEALTH;
  function fmtCount(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
    return n.toString();
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Data Health + Mapping Review"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Refresh log, source coverage, advertiser-mapping confidence, and the duplicate-key / missing-field checks the model runs nightly.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(8, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Snapshot",
    value: Fch.SNAPSHOT_DATE.replace(", 2026", ""),
    desc: "Latest snapshot loaded.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Rows Loaded",
    value: fmtCount(dh.rowsLoaded),
    desc: "Total spend rows across all sources."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Total Spend",
    value: Fch.fmtMoney(Fch.advertisers.reduce((a, r) => a + r.total, 0)),
    desc: "Across full advertiser book."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Unmatched Adv",
    value: dh.unmatchedAdvertisers.toString(),
    desc: "Advertiser names that didn't auto-map.",
    accent: "red"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Low Confidence",
    value: dh.lowConfidenceMatches.toString(),
    desc: "Auto-mapped rows with confidence < 0.7.",
    accent: "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Duplicate Keys",
    value: dh.duplicateKeyCount.toString(),
    desc: "Suspected duplicate advertiser keys.",
    accent: dh.duplicateKeyCount === 0 ? "green" : "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Political Windows",
    value: dh.politicalWindowsLoaded.toString(),
    desc: "Calendar-matched window records."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Outside Spend Rows",
    value: dh.outsideSpendRows.toString(),
    desc: "FEC IE records joined to candidates."
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.2fr 1fr",
      gap: 8,
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Source Health",
    desc: "Per-source row counts, last-load timestamp, ownership, and status.",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap",
    style: {
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "32%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "22%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "14%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "16%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "16%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Source"), /*#__PURE__*/React.createElement("th", null, "Last loaded"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Rows"), /*#__PURE__*/React.createElement("th", null, "Owner"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, dh.sources.map((s, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 600
    }
  }, s.name), /*#__PURE__*/React.createElement("td", {
    style: {
      color: "var(--text-secondary)",
      fontSize: 10.5
    }
  }, s.lastLoaded), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtCount(s.rows)), /*#__PURE__*/React.createElement("td", {
    style: {
      color: "var(--text-secondary)"
    }
  }, s.owner), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: `chip ${s.status === "Healthy" ? "chip-green" : s.status === "Stale" ? "chip-yellow" : "chip-red"}`
  }, s.status)))))))), /*#__PURE__*/React.createElement(Viz, {
    title: "Refresh Log",
    desc: "Nightly pipeline steps with row counts, duration, and status.",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap",
    style: {
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "22%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "30%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "15%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "13%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "20%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Timestamp"), /*#__PURE__*/React.createElement("th", null, "Step"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Rows"), /*#__PURE__*/React.createElement("th", null, "Duration"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, dh.refreshLog.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontSize: 10.5,
      color: "var(--text-secondary)"
    }
  }, r.ts), /*#__PURE__*/React.createElement("td", null, r.step), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, fmtCount(r.rows)), /*#__PURE__*/React.createElement("td", {
    style: {
      fontVariantNumeric: "tabular-nums"
    }
  }, r.duration), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: `chip ${r.status === "OK" ? "chip-green" : "chip-yellow"}`
  }, r.status))))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Advertiser Match Review",
    desc: "Low-confidence auto-mappings flagged for human review. Action: confirm or remap to suggested target.",
    accent: {
      bg: "#FFF3D6",
      fg: "#8A6500",
      text: `${dh.matchReview.filter(m => m.needsHuman).length} pending`
    },
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap",
    style: {
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "26%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "14%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "30%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "15%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "15%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Raw Advertiser"), /*#__PURE__*/React.createElement("th", null, "Candidate hint"), /*#__PURE__*/React.createElement("th", null, "Suggested mapping"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Confidence"), /*#__PURE__*/React.createElement("th", null, "Action"))), /*#__PURE__*/React.createElement("tbody", null, dh.matchReview.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name"
  }, r.advertiser), /*#__PURE__*/React.createElement("td", {
    style: {
      color: "var(--text-secondary)"
    }
  }, r.candidate), /*#__PURE__*/React.createElement("td", null, r.suggested), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, /*#__PURE__*/React.createElement("span", {
    className: `chip ${r.confidence >= 0.7 ? "chip-green" : r.confidence >= 0.5 ? "chip-yellow" : "chip-red"}`
  }, (r.confidence * 100).toFixed(0), "%")), /*#__PURE__*/React.createElement("td", null, r.needsHuman ? /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => e.preventDefault(),
    style: {
      color: "var(--blue)",
      textDecoration: "none",
      fontSize: 10.5,
      fontWeight: 600
    }
  }, "Review \u2192") : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: "var(--text-muted)"
    }
  }, "Auto-accepted")))))))), /*#__PURE__*/React.createElement(Viz, {
    title: "Missing Field Checks",
    desc: "Rows that loaded but lack a required field. These reduce model completeness.",
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(CheckRow, {
    label: "Snapshot reconciliation",
    current: dh.rowsLoaded,
    expected: dh.rowsLoaded,
    ok: true
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Missing DMA",
    count: 142,
    total: dh.rowsLoaded
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Missing Office mapping",
    count: 88,
    total: dh.rowsLoaded
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Missing Race Level",
    count: 37,
    total: dh.rowsLoaded,
    ok: true
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Missing Agency",
    count: 1_204,
    total: dh.rowsLoaded,
    warn: true
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Negative cable share",
    count: 0,
    total: dh.rowsLoaded,
    ok: true
  }), /*#__PURE__*/React.createElement(CheckRow, {
    label: "Snapshot date in future",
    count: 0,
    total: dh.rowsLoaded,
    ok: true
  }))))));
}
function CheckRow({
  label,
  count,
  total,
  current,
  expected,
  ok,
  warn
}) {
  const isMatch = current != null && current === expected;
  const pct = count != null ? count / total * 100 : null;
  const status = isMatch ? "OK" : count === 0 ? "OK" : pct != null && pct > 1 ? "Warn" : pct != null && pct > 0 ? "Note" : "OK";
  const chipCls = status === "OK" ? "chip-green" : status === "Warn" ? "chip-yellow" : "chip-gray";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 80px 60px",
      gap: 6,
      alignItems: "center",
      fontSize: 11,
      padding: "4px 0",
      borderBottom: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: "var(--text-primary)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      color: "var(--text-secondary)"
    }
  }, isMatch ? "Match" : count != null ? `${count.toLocaleString()} rows` : "—"), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: `chip ${chipCls}`
  }, status)));
}
Object.assign(window, {
  CaseStudyPage,
  HealthPage
});
})();
