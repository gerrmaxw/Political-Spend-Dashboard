(function(){
/* global React */
// Page 2 — Cable Prospect Finder

const {
  useState,
  useMemo
} = React;
const F2 = window.pbData;
function ProspectsPage({
  filteredRows,
  measures,
  filters,
  tvFloor,
  setTvFloor,
  cableTarget,
  setCableTarget,
  cableOppFloor,
  setCableOppFloor
}) {
  const [hover, setHover] = useState(null);
  const calendarRows = useMemo(() => filteredRows.filter(r => r.calendarMatched), [filteredRows]);
  const offCalendarRows = useMemo(() => filteredRows.filter(r => !r.calendarMatched), [filteredRows]);

  // Visual-level filter for scatter + prospect table:
  //   • market must exist in the maintained political-window calendar
  //   • cableProspectFlag = 1 AND meetsCableOppFloor = 1
  //   • Exclude completed races: lost primaries, completed general elections,
  //     and the manually closed VA/NJ/Prop 50 cycle rows.
  const closedRows = useMemo(() => calendarRows.filter(r => isClosedProspectRow(r)), [calendarRows]);
  const prospects = useMemo(() => calendarRows.filter(r => r.cableProspectFlag === 1 && r.meetsCableOppFloor === 1 && !isClosedProspectRow(r)), [calendarRows]);
  const rankedProspects = useMemo(() => [...prospects].sort((a, b) => b.cableOpportunity - a.cableOpportunity), [prospects]);
  const maxOpp = Math.max(...rankedProspects.map(r => r.cableOpportunity), 1);

  // Prospect mix by market — top 6 DMAs by cable opportunity
  const marketRows = useMemo(() => {
    const m = new Map();
    prospects.forEach(r => {
      const cur = m.get(r.dma) || {
        dma: r.dma,
        prospects: 0,
        opp: 0
      };
      cur.prospects += 1;
      cur.opp += r.cableOpportunity;
      m.set(r.dma, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.opp - a.opp).slice(0, 6);
  }, [prospects]);
  const maxMarketOpp = Math.max(...marketRows.map(r => r.opp), 1);

  // Scatter hover handler
  function onHover(row, e) {
    if (!row) {
      setHover(null);
      return;
    }
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    setHover({
      ...row,
      _x: e.clientX - rect.left,
      _y: e.clientY - rect.top
    });
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Cable Prospect Finder"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Prioritized advertiser opportunities in markets listed in the maintained political-window calendar.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(9, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Cable Prospects",
    value: prospects.length.toString(),
    desc: "Calendar-market advertisers meeting the spend, cable share, and opportunity thresholds.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Zero-Cable Prospects",
    value: prospects.filter(r => r.noCableFlag === 1).length.toString(),
    desc: "Prospects with broadcast or CTV spend and no cable spend.",
    accent: "red"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Prospect Spend",
    value: F2.fmtMoney(prospects.reduce((a, r) => a + r.total, 0)),
    desc: "Total current spend from filtered cable prospects."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Broadcast + CTV Spend",
    value: F2.fmtMoney(prospects.reduce((a, r) => a + r.bcCtvSpend, 0)),
    desc: "Prospect spend currently weighted toward broadcast and CTV."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Cable Opportunity",
    value: F2.fmtMoney(prospects.reduce((a, r) => a + r.cableOpportunity, 0)),
    desc: "Estimated cable upside after applying the selected target and floor.",
    accent: "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Average Cable Share",
    value: F2.fmtPct(prospects.length ? prospects.reduce((a, r) => a + r.cableShare, 0) / prospects.length : 0),
    desc: "Average cable share across the visible prospect set."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Closed Races Removed",
    value: closedRows.length.toString(),
    desc: "Completed general races, lost primaries, and closed VA/NJ/Prop 50 rows excluded from prospecting.",
    accent: closedRows.length > 0 ? "red" : null
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Off-Calendar Rows Hidden",
    value: offCalendarRows.length.toString(),
    desc: "Advertiser rows outside the political-window market calendar are hidden on this page.",
    accent: offCalendarRows.length > 0 ? "orange" : null
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Primary Winners \u2192General",
    value: calendarRows.filter(r => r.primaryWon).length.toString(),
    desc: "Calendar-market candidates who won their primary and now have a general election advertising window ahead.",
    accent: "green"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1.1fr",
      gap: 8,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(SliderCard, {
    title: "Minimum TV Spend",
    desc: "Sets the minimum broadcast plus CTV spend needed to qualify as a prospect.",
    value: tvFloor,
    min: 0,
    max: 500000,
    step: 5000,
    formatValue: v => "$" + (v / 1000).toFixed(0) + "K",
    onChange: setTvFloor
  }), /*#__PURE__*/React.createElement(SliderCard, {
    title: "Cable Share Target",
    desc: "Sets the target cable share used to calculate opportunity.",
    value: cableTarget,
    min: 0.05,
    max: 0.5,
    step: 0.01,
    formatValue: v => (v * 100).toFixed(0) + "%",
    onChange: setCableTarget
  }), /*#__PURE__*/React.createElement(SliderCard, {
    title: "Minimum Cable Opportunity",
    desc: "Only show advertisers with at least this much estimated cable upside.",
    value: cableOppFloor,
    min: 0,
    max: 250000,
    step: 5000,
    formatValue: v => "$" + (v / 1000).toFixed(0) + "K",
    prominent: true,
    onChange: setCableOppFloor
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid-prospects"
  }, /*#__PURE__*/React.createElement("div", {
    className: "span-left",
    style: {
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Broadcast/CTV Spend vs. Cable Share",
    desc: "Each dot is an advertiser. The best prospects are high on broadcast/CTV spend and low on cable share \u2014 the orange zone in the upper right.",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(ScatterChart, {
    rows: prospects,
    vRef: tvFloor,
    hRef: cableTarget,
    raceColors: window.RACE_COLORS,
    onHover: onHover,
    hover: hover
  }), /*#__PURE__*/React.createElement("div", {
    className: "scatter-legend"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-secondary)",
      fontWeight: 600,
      marginRight: 4
    }
  }, "Race level:"), Object.entries(window.RACE_COLORS).map(([rl, c]) => /*#__PURE__*/React.createElement("span", {
    key: rl
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: c
    }
  }), rl)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      color: "var(--text-muted)"
    }
  }, "Dot size = total spend"))))), /*#__PURE__*/React.createElement(Viz, {
    title: "Prospects By Market",
    desc: "Top political-calendar markets where actionable cable opportunities concentrate. Sorted by cable opportunity."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      marginTop: 4
    }
  }, marketRows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: "var(--text-muted)",
      padding: 12
    }
  }, "No prospects in the current filter set.") : marketRows.map(r => {
    const pct = r.opp / maxMarketOpp;
    return /*#__PURE__*/React.createElement("div", {
      key: r.dma,
      style: {
        display: "grid",
        gridTemplateColumns: "120px 1fr 80px 36px",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        paddingBottom: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 500,
        color: "var(--text-primary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      },
      title: r.dma
    }, r.dma), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 14,
        background: "#F3F4F6",
        borderRadius: 2,
        position: "relative",
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        width: `${pct * 100}%`,
        background: "var(--orange)",
        borderRadius: 2
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        color: "var(--orange)",
        fontWeight: 600
      }
    }, F2.fmtMoneyTight(r.opp)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "right",
        color: "var(--text-secondary)",
        fontVariantNumeric: "tabular-nums"
      }
    }, r.prospects));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "120px 1fr 80px 36px",
      gap: 8,
      fontSize: 9.5,
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      borderTop: "1px solid var(--border)",
      paddingTop: 4,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("div", null, "DMA"), /*#__PURE__*/React.createElement("div", null), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, "Cable opp"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, "# adv")))), /*#__PURE__*/React.createElement(Viz, {
    title: "Prospect Logic",
    desc: "Three thresholds (set via the sliders above) decide which advertisers appear in this view."
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 5,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(RuleRow, {
    num: "1",
    label: "Enough TV spend",
    value: `Broadcast + CTV ≥ ${F2.fmtMoneyTight(tvFloor)}`
  }), /*#__PURE__*/React.createElement(RuleRow, {
    num: "2",
    label: "Under target cable share",
    value: `Cable share ≤ ${(cableTarget * 100).toFixed(0)}%`
  }), /*#__PURE__*/React.createElement(RuleRow, {
    num: "3",
    label: "Actionable opportunity size",
    value: `Cable opportunity ≥ ${F2.fmtMoneyTight(cableOppFloor)}`,
    color: "orange"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--text-secondary)",
      lineHeight: 1.4,
      marginTop: 4,
      borderTop: "1px solid var(--border)",
      paddingTop: 5
    }
  }, "Media type filtering is intentionally removed because cable share and opportunity are computed across media types inside the measures.")))), /*#__PURE__*/React.createElement(Viz, {
    title: "Ranked Prospect List",
    desc: "Seller action list sorted by estimated cable opportunity. Includes only State/DMA pairs present in the political-window calendar.",
    style: {
      flex: 1,
      minHeight: 0,
      marginTop: 0
    },
    accent: {
      bg: "var(--orange-soft)",
      fg: "#B14A0D",
      text: `${rankedProspects.length} prospects`
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "4%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "6%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "6%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "5%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "5%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "8%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "7%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "11%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Advertiser"), /*#__PURE__*/React.createElement("th", null, "Agency"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", null, "DMA"), /*#__PURE__*/React.createElement("th", null, "Office"), /*#__PURE__*/React.createElement("th", null, "Race"), /*#__PURE__*/React.createElement("th", null, "Election"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Broadcast"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "CTV"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable"), /*#__PURE__*/React.createElement("th", null, "Cable %"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable Opp \u2193"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cash on Hand"), /*#__PURE__*/React.createElement("th", null, "Window"))), /*#__PURE__*/React.createElement("tbody", null, rankedProspects.length === 0 ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: "14",
    style: {
      padding: 24,
      textAlign: "center",
      color: "var(--text-muted)"
    }
  }, "No advertisers match the current filters and slider thresholds.")) : rankedProspects.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.advertiserKey
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name",
    title: r.advertiser
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    title: `Race level color: ${r.raceLevel}`,
    style: {
      width: 4,
      height: 14,
      borderRadius: 2,
      background: window.RACE_COLORS[r.raceLevel]
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, r.advertiser))), /*#__PURE__*/React.createElement("td", {
    title: r.agency,
    style: {
      color: "var(--text-secondary)"
    }
  }, r.agency), /*#__PURE__*/React.createElement("td", null, r.state), /*#__PURE__*/React.createElement("td", {
    title: r.dma
  }, r.dma), /*#__PURE__*/React.createElement("td", null, r.office), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(ProspectLabelChip, {
    label: r.cableProspectLabel
  })), /*#__PURE__*/React.createElement("td", null, r.primaryWon && /*#__PURE__*/React.createElement("span", {
    className: "chip chip-green",
    title: "Won primary \u2014 general election window ahead"
  }, "Primary Won \u2713"), !r.hasElectionResult && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--text-muted)"
    }
  }, "\u2014")), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F2.fmtMoneyTight(r.broadcast)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F2.fmtMoneyTight(r.ctv)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F2.fmtMoneyTight(r.cable)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(CableShareCell, {
    value: r.cableShare,
    target: measures.cableShareTarget
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(OpportunityBar, {
    value: r.cableOpportunity,
    max: maxOpp
  })), /*#__PURE__*/React.createElement("td", {
    className: "num",
    title: r.fecId ? `FEC ${r.fecId}` : "Not in FEC cash-on-hand feed",
    style: {
      color: r.cashOnHand ? "var(--text-primary)" : "var(--text-muted)"
    }
  }, r.cashOnHand ? F2.fmtMoneyTight(r.cashOnHand) : "—"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(WindowChip, {
    status: r.windowStatus
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: "var(--text-muted)",
      fontVariantNumeric: "tabular-nums"
    }
  }, r.daysToElection >= 0 ? `${r.daysToElection}d to election` : `${Math.abs(r.daysToElection)}d post-election`))))))))));
}
function isClosedProspectRow(row) {
  return F2.isClosedProspect ? F2.isClosedProspect(row) : !!(row && (row.primaryLost || row.generalWon || row.generalLost || row.electionResult && row.electionResult.lost));
}
function RuleRow({
  num,
  label,
  value,
  color
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 16,
      height: 16,
      borderRadius: 8,
      background: color === "orange" ? "var(--orange)" : "var(--blue-soft)",
      color: color === "orange" ? "#fff" : "var(--blue)",
      fontSize: 9,
      fontWeight: 700,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
      marginTop: 1
    }
  }, num), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: "var(--text-secondary)",
      lineHeight: 1.1
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: color === "orange" ? "var(--orange)" : "var(--text-primary)",
      lineHeight: 1.25
    }
  }, value)));
}
Object.assign(window, {
  ProspectsPage
});
})();
