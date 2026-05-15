(function(){
/* global React */
// Page 7 — PAC / FEC Breakdown
// Page 8 — Completed Elections + Cost Per Vote

const {
  useState: useStatePC,
  useMemo: useMemoPC
} = React;
const Fpc = window.pbData;

// ===========================================================================
// Page 7 — PAC / FEC Spend Breakdown
// ===========================================================================
function PacPage({
  filters
}) {
  // Filter PAC rows by current global filters where they apply
  const rows = useMemoPC(() => {
    return Fpc.PAC_ROWS.filter(p => {
      if (filters.state && filters.state !== "All" && p.targetState !== filters.state) return false;
      if (filters.raceLevel && filters.raceLevel !== "All" && p.focus !== filters.raceLevel) return false;
      return true;
    });
  }, [filters]);

  // By committee — stacked support/oppose
  const committeeRows = useMemoPC(() => {
    const m = new Map();
    rows.forEach(p => {
      const cur = m.get(p.committee) || {
        committee: p.committee,
        alignment: p.alignment,
        support: 0,
        oppose: 0
      };
      cur.support += p.support;
      cur.oppose += p.oppose;
      m.set(p.committee, cur);
    });
    return Array.from(m.values()).map(c => ({
      ...c,
      total: c.support + c.oppose
    })).sort((a, b) => b.total - a.total);
  }, [rows]);
  const maxCommittee = Math.max(...committeeRows.map(c => c.total), 1);

  // Outside spend by snapshot — synthesize via trendCurve on the totals
  const outsideTrend = useMemoPC(() => {
    const total = rows.reduce((a, p) => a + p.total, 0);
    const support = rows.reduce((a, p) => a + p.support, 0);
    const oppose = rows.reduce((a, p) => a + p.oppose, 0);
    return Fpc.SNAPSHOTS.map(s => ({
      ...s,
      support: Fpc.trendCurve(s.key, support),
      oppose: Fpc.trendCurve(s.key, oppose),
      total: Fpc.trendCurve(s.key, total)
    }));
  }, [rows]);

  // Race-level matrix
  const raceMatrix = useMemoPC(() => {
    const m = new Map();
    rows.forEach(p => {
      const cur = m.get(p.focus) || {
        focus: p.focus,
        support: 0,
        oppose: 0,
        committees: new Set(),
        targets: new Set()
      };
      cur.support += p.support;
      cur.oppose += p.oppose;
      cur.committees.add(p.committee);
      cur.targets.add(p.target);
      m.set(p.focus, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.support + b.oppose - (a.support + a.oppose));
  }, [rows]);

  // Top targets table — payee/purpose detail
  const detail = useMemoPC(() => {
    return [...rows].sort((a, b) => b.total - a.total).slice(0, 12);
  }, [rows]);
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "PAC / FEC Spend Breakdown"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Outside committee spend \u2014 support vs. oppose \u2014 by committee, week, race level, and target candidate.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Committees Active",
    value: committeeRows.length.toString(),
    desc: "PACs and outside groups with reported spend in scope.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Total Outside Spend",
    value: Fpc.fmtMoney(rows.reduce((a, p) => a + p.total, 0)),
    desc: "Sum of support and oppose spend across all committees.",
    accent: "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Support Spend",
    value: Fpc.fmtMoney(rows.reduce((a, p) => a + p.support, 0)),
    desc: "Outside spend favoring the targeted candidate.",
    accent: "green"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Oppose Spend",
    value: Fpc.fmtMoney(rows.reduce((a, p) => a + p.oppose, 0)),
    desc: "Outside spend running against the targeted candidate.",
    accent: "red"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Committees \xB7 Support / Oppose Split",
    desc: "Top outside-spending committees, split between dollars supporting and opposing target candidates.",
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      paddingTop: 4
    }
  }, committeeRows.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.committee,
    style: {
      display: "grid",
      gridTemplateColumns: "150px 1fr 70px",
      alignItems: "center",
      gap: 8,
      padding: "4px 0",
      borderBottom: "1px dashed transparent"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      fontWeight: 600,
      color: "var(--text-primary)",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    title: c.committee
  }, c.committee, /*#__PURE__*/React.createElement("span", {
    className: `chip ${c.alignment === "DEM" ? "chip-blue" : "chip-red"}`,
    style: {
      marginLeft: 4
    }
  }, c.alignment)), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 16,
      position: "relative",
      display: "flex"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${c.support / maxCommittee * 100}%`,
      background: "#00A859",
      height: "100%",
      borderRadius: "2px 0 0 2px"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${c.oppose / maxCommittee * 100}%`,
      background: "#E4002B",
      height: "100%",
      borderRadius: "0 2px 2px 0"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right",
      fontSize: 11,
      fontWeight: 600,
      fontVariantNumeric: "tabular-nums"
    }
  }, Fpc.fmtMoneyTight(c.total))))), /*#__PURE__*/React.createElement("div", {
    className: "scatter-legend",
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: "#00A859"
    }
  }), "Support"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: "#E4002B"
    }
  }), "Oppose"))), /*#__PURE__*/React.createElement(Viz, {
    title: "Outside Spend by Snapshot",
    desc: "Cumulative support and oppose spend reported by committees across weekly snapshots.",
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(OutsideTrendChart, {
    data: outsideTrend
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "By Race Level",
    desc: "Outside spend split by race level \u2014 useful to see where PAC money is concentrated.",
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
      width: "30%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "23%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "23%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Race Level"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "# Cmte"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "# Tgt"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Support"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Oppose"))), /*#__PURE__*/React.createElement("tbody", null, raceMatrix.map(r => {
    const total = r.support + r.oppose;
    const supPct = total > 0 ? r.support / total : 0;
    return /*#__PURE__*/React.createElement("tr", {
      key: r.focus
    }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: window.RACE_COLORS[r.focus]
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, r.focus))), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r.committees.size), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, r.targets.size), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "data-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "fill",
      style: {
        width: `${supPct * 100}%`,
        background: "var(--green-soft)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "val",
      style: {
        color: "var(--green)"
      }
    }, Fpc.fmtMoneyTight(r.support)))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
      className: "data-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "fill",
      style: {
        width: `${(1 - supPct) * 100}%`,
        background: "var(--red-soft)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      className: "val",
      style: {
        color: "var(--red)"
      }
    }, Fpc.fmtMoneyTight(r.oppose)))));
  }))))), /*#__PURE__*/React.createElement(Viz, {
    title: "Top Targets \xB7 Detail",
    desc: "Highest-dollar PAC spend rows by target candidate, with the committee, alignment, payee, and week of record.",
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
      width: "26%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "24%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "14%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Target Candidate"), /*#__PURE__*/React.createElement("th", null, "Committee"), /*#__PURE__*/React.createElement("th", null, "Payee"), /*#__PURE__*/React.createElement("th", null, "Week"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Support"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Oppose"))), /*#__PURE__*/React.createElement("tbody", null, detail.map((p, i) => /*#__PURE__*/React.createElement("tr", {
    key: i
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name",
    title: p.target
  }, p.target), /*#__PURE__*/React.createElement("td", null, p.committee, " ", /*#__PURE__*/React.createElement("span", {
    className: `chip ${p.alignment === "DEM" ? "chip-blue" : "chip-red"}`,
    style: {
      marginLeft: 4
    }
  }, p.alignment)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "chip chip-gray"
  }, p.payee)), /*#__PURE__*/React.createElement("td", {
    style: {
      color: "var(--text-secondary)",
      fontSize: 10.5
    }
  }, p.weekEnding), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      color: "var(--green)"
    }
  }, Fpc.fmtMoneyTight(p.support)), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      color: "var(--red)"
    }
  }, Fpc.fmtMoneyTight(p.oppose))))))))));
}
function OutsideTrendChart({
  data
}) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({
    w: 400,
    h: 220
  });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({
      w: el.clientWidth || 400,
      h: el.clientHeight || 220
    });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = size.w,
    H = size.h;
  const pad = {
    left: 50,
    right: 14,
    top: 12,
    bottom: 24
  };
  const plotW = Math.max(20, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);
  const yMax = Math.max(...data.map(s => s.total), 1) * 1.1;
  const xPos = i => pad.left + i / (data.length - 1) * plotW;
  const yPos = v => pad.top + (1 - v / yMax) * plotH;
  const supPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.support)).join(" ");
  const oppPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.oppose)).join(" ");
  const totPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.total)).join(" ");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0
    },
    ref: containerRef
  }, /*#__PURE__*/React.createElement("svg", {
    width: W,
    height: H
  }, Array.from({
    length: 4
  }, (_, i) => yMax * (i / 3)).map((v, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, /*#__PURE__*/React.createElement("line", {
    x1: pad.left,
    x2: W - pad.right,
    y1: yPos(v),
    y2: yPos(v),
    stroke: "#F1F2F4",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("text", {
    x: pad.left - 6,
    y: yPos(v) + 3,
    fontSize: "10",
    fill: "#4B5563",
    textAnchor: "end"
  }, Fpc.fmtMoneyTight(v)))), data.map((s, i) => (i % 3 === 0 || i === data.length - 1) && /*#__PURE__*/React.createElement("text", {
    key: i,
    x: xPos(i),
    y: H - 8,
    fontSize: "10",
    fill: "#4B5563",
    textAnchor: "middle"
  }, s.label)), /*#__PURE__*/React.createElement("path", {
    d: totPath,
    fill: "none",
    stroke: "#111827",
    strokeWidth: "1.4",
    strokeDasharray: "4,3"
  }), /*#__PURE__*/React.createElement("path", {
    d: supPath,
    fill: "none",
    stroke: "#00A859",
    strokeWidth: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: oppPath,
    fill: "none",
    stroke: "#E4002B",
    strokeWidth: "2"
  })), /*#__PURE__*/React.createElement("div", {
    className: "scatter-legend",
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: "#00A859"
    }
  }), "Support"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: "#E4002B"
    }
  }), "Oppose"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: "var(--text-secondary)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-block",
      width: 14,
      borderTop: "1.4px dashed #111827",
      verticalAlign: "middle",
      marginRight: 4
    }
  }), "Total")));
}

// ===========================================================================
// Page 8 — Completed Elections + Cost Per Vote
// ===========================================================================
function CompletedPage({
  filteredRows,
  filters
}) {
  // Subset of advertisers whose election has already passed
  const completed = useMemoPC(() => filteredRows.filter(r => r.windowStatus === "Completed" || r.daysToElection < 0).sort((a, b) => b.total - a.total), [filteredRows]);
  const withResults = useMemoPC(() => completed.filter(r => r.hasElectionResult), [completed]);
  const winners = useMemoPC(() => withResults.filter(r => r.electionResult && r.electionResult.won), [withResults]);
  const losers = useMemoPC(() => withResults.filter(r => r.electionResult && !r.electionResult.won), [withResults]);

  // Average vote share across matched results
  const avgVoteShare = useMemoPC(() => {
    const withShare = withResults.filter(r => r.electionResult && r.electionResult.voteShare != null);
    if (!withShare.length) return null;
    return withShare.reduce((a, r) => a + r.electionResult.voteShare, 0) / withShare.length;
  }, [withResults]);
  const resultsStatus = Fpc.ELECTION_RESULTS_STATUS || "idle";
  const vizAccent = withResults.length > 0 ? {
    bg: "#E0F4EA",
    fg: "#06633B",
    text: `${withResults.length} results loaded`
  } : {
    bg: "#FFF3D6",
    fg: "#8A6500",
    text: resultsStatus === "loading" ? "Loading…" : "Awaiting results"
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Completed Elections + Cost Per Vote"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "CivicAPI is the dashboard's certified results source for vote totals, vote share, and win/loss flags. Won candidates stay active for future windows; lost candidates are flagged for case study archival.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(5, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Completed Races",
    value: completed.length.toString(),
    desc: "Races in scope whose election day has passed.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Results Loaded",
    value: `${withResults.length} of ${completed.length}`,
    desc: "Rows matched to CivicAPI certified results. Refreshes automatically on page load.",
    accent: withResults.length === completed.length ? "green" : withResults.length > 0 ? "orange" : null
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Winners",
    value: winners.length.toString(),
    desc: "Candidates who won their primary or general election. Future general-election window ahead for primary winners.",
    accent: "green"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Did Not Advance",
    value: losers.length.toString(),
    desc: "Candidates who lost their primary or general election. Removed from cable prospects; eligible for case study archival.",
    accent: "red"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Avg Vote Share",
    value: avgVoteShare != null ? (avgVoteShare * 100).toFixed(1) + "%" : "—",
    desc: "Average vote share across candidates with CivicAPI results."
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "Election Results \xB7 2026",
    desc: "One row per completed race. CivicAPI vote totals are matched by candidate name and state, then used for result status and cost-per-vote triage.",
    accent: vizAccent,
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
      width: "20%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "11%"
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
      width: "10%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Advertiser \xB7 Race"), /*#__PURE__*/React.createElement("th", null, "Party"), /*#__PURE__*/React.createElement("th", null, "State / Office"), /*#__PURE__*/React.createElement("th", null, "Election Date"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Ad Spend"), /*#__PURE__*/React.createElement("th", null, "Election Type"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Vote %"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "$ / Vote"), /*#__PURE__*/React.createElement("th", null, "Result"), /*#__PURE__*/React.createElement("th", null, "Next Step"))), /*#__PURE__*/React.createElement("tbody", null, completed.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "10",
    style: {
      padding: 24,
      textAlign: "center",
      color: "var(--text-muted)"
    }
  }, "No completed races in the current filter set.")) : completed.map(r => {
    const anchor = new Date("2026-05-13");
    const electionDate = new Date(anchor);
    electionDate.setDate(anchor.getDate() + r.daysToElection);
    const res = r.electionResult;
    const voteSharePct = res && res.voteShare != null ? (res.voteShare * 100).toFixed(1) + "%" : "—";
    const dollarPerVote = res && res.votes > 0 ? "$" + (r.total / res.votes).toLocaleString("en-US", {
      maximumFractionDigits: 2
    }) : "—";
    return /*#__PURE__*/React.createElement("tr", {
      key: r.advertiserKey
    }, /*#__PURE__*/React.createElement("td", {
      className: "adv-name"
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
        background: window.RACE_COLORS[r.raceLevel]
      }
    }), /*#__PURE__*/React.createElement("span", null, r.advertiser))), /*#__PURE__*/React.createElement("td", null, r.party), /*#__PURE__*/React.createElement("td", null, r.state, " \xB7 ", r.office), /*#__PURE__*/React.createElement("td", {
      style: {
        color: "var(--text-secondary)",
        fontSize: 10.5
      }
    }, res && res.electionDate ? new Date(res.electionDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }) : electionDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })), /*#__PURE__*/React.createElement("td", {
      className: "num"
    }, Fpc.fmtMoneyTight(r.total)), /*#__PURE__*/React.createElement("td", null, res ? /*#__PURE__*/React.createElement("span", {
      className: "chip chip-gray",
      style: {
        textTransform: "capitalize"
      }
    }, res.electionType) : /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)",
        fontSize: 10
      }
    }, "\u2014")), /*#__PURE__*/React.createElement("td", {
      className: "num",
      style: {
        color: res ? "var(--text-primary)" : "var(--text-muted)"
      }
    }, voteSharePct), /*#__PURE__*/React.createElement("td", {
      style: {
        color: "var(--text-muted)"
      }
    }, dollarPerVote), /*#__PURE__*/React.createElement("td", null, res ? /*#__PURE__*/React.createElement("span", {
      className: `chip ${res.won ? "chip-green" : "chip-red"}`
    }, res.won ? "Won" : "Lost") : /*#__PURE__*/React.createElement("span", {
      className: "chip chip-yellow"
    }, resultsStatus === "loading" ? "Loading…" : "Pending"), res && res.votes > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 3,
        color: "var(--text-muted)",
        fontSize: 9.5,
        fontVariantNumeric: "tabular-nums"
      }
    }, res.votes.toLocaleString(), " votes")), /*#__PURE__*/React.createElement("td", {
      style: {
        fontSize: 10
      }
    }, r.primaryWon && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--green)",
        fontWeight: 600
      }
    }, "General window \u2197"), r.primaryLost && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--red)"
      }
    }, "Archive case study"), r.generalWon && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--green)",
        fontWeight: 600
      }
    }, "Cycle winner \u2713"), r.generalLost && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)"
      }
    }, "Cycle complete"), !r.hasElectionResult && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-muted)"
      }
    }, "\u2014")));
  }))))), /*#__PURE__*/React.createElement(NotesBox, {
    accent: "blue",
    title: "How election results are matched",
    desc: "CivicAPI is queried at page load through the dashboard proxy/direct endpoint and treated as the certified results source for this workflow. Candidates are matched to advertisers by fuzzy name and office similarity. Primary winners remain in the Cable Prospect Finder with a 'General window \u2197' flag. Primary losers are removed from prospects and flagged for case study archival. $/vote is calculated from spend divided by CivicAPI vote count when votes are available."
  }));
}
Object.assign(window, {
  PacPage,
  CompletedPage
});
})();
