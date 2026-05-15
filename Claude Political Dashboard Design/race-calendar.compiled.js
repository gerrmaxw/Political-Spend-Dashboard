(function(){
/* global React */
// Page 5 — Race Explorer
// Page 6 — Election Calendar + Political Windows

const {
  useState: useStateRC,
  useMemo: useMemoRC
} = React;
const Frc = window.pbData;

// ===========================================================================
// Page 5 — Race Explorer
// ===========================================================================
function RacePage({
  filteredRows,
  filters
}) {
  const [expandLevel, setExpandLevel] = useStateRC(2); // 0 = race only, 1 = race+state, 2 = race+state+office

  // Build a Race Level → State → Office tree with aggregates
  const tree = useMemoRC(() => {
    const root = new Map();
    filteredRows.forEach(r => {
      const lvl = root.get(r.raceLevel) || {
        agg: blank(),
        kids: new Map()
      };
      const st = lvl.kids.get(r.state) || {
        agg: blank(),
        kids: new Map()
      };
      const off = st.kids.get(r.office) || {
        agg: blank(),
        kids: []
      };
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
          office,
          agg: off.agg,
          advertisers: off.kids.sort((a, b) => b.total - a.total)
        }));
        return {
          state,
          agg: st.agg,
          offices
        };
      });
      return {
        race,
        agg: lvl.agg,
        states
      };
    });
  }, [filteredRows]);
  function blank() {
    return {
      total: 0,
      broadcast: 0,
      cable: 0,
      ctv: 0,
      opp: 0,
      tv: 0,
      support: 0,
      oppose: 0,
      advCount: 0
    };
  }
  function addAgg(a, r) {
    a.total += r.total;
    a.broadcast += r.broadcast;
    a.cable += r.cable;
    a.ctv += r.ctv;
    a.tv += r.tvSpend;
    a.opp += r.cableOpportunity;
    a.advCount += 1;
    // outside support/oppose for this candidate
    const outside = Frc.PAC_ROWS.filter(p => p.target === r.advertiser);
    a.support += outside.reduce((x, p) => x + p.support, 0);
    a.oppose += outside.reduce((x, p) => x + p.oppose, 0);
  }
  const rows = useMemoRC(() => {
    const out = [];
    tree.forEach(rl => {
      out.push({
        kind: "race",
        label: rl.race,
        agg: rl.agg,
        level: 0,
        color: window.RACE_COLORS[rl.race]
      });
      if (expandLevel >= 1) {
        rl.states.forEach(st => {
          out.push({
            kind: "state",
            label: st.state,
            agg: st.agg,
            level: 1
          });
          if (expandLevel >= 2) {
            st.offices.forEach(off => {
              out.push({
                kind: "office",
                label: off.office,
                agg: off.agg,
                level: 2
              });
            });
          }
        });
      }
    });
    return out;
  }, [tree, expandLevel]);
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Race Explorer"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Total spend, media mix, cable opportunity, and outside support/oppose by race level \u2192 state \u2192 office.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Race Levels Active",
    value: tree.length.toString(),
    desc: "Race types with at least one advertiser in the current filter set.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Advertisers",
    value: filteredRows.length.toString(),
    desc: "Distinct advertisers across all race levels."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Total Spend",
    value: Frc.fmtMoney(filteredRows.reduce((a, r) => a + r.total, 0)),
    desc: "Sum of current spend across all active races."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Outside Spend Tied",
    value: Frc.fmtMoney(rows.filter(x => x.kind === "race").reduce((a, r) => a + r.agg.support + r.agg.oppose, 0)),
    desc: "PAC and outside-group spend linked to candidates in scope.",
    accent: "orange"
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "Race-Level Matrix",
    desc: "Spend and cable share by race level, state, and office. Use the expand control to drill from race down to office.",
    accent: {
      bg: "#F3F4F6",
      fg: "#4B5563",
      text: `${rows.filter(x => x.kind === "race").length} race levels`
    },
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      fontWeight: 600,
      marginRight: 4
    }
  }, "Drill depth:"), [["Race", 0], ["+ State", 1], ["+ Office", 2]].map(([lbl, v]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setExpandLevel(v),
    style: {
      background: expandLevel === v ? "var(--blue)" : "#fff",
      color: expandLevel === v ? "#fff" : "var(--text-secondary)",
      border: "1px solid var(--border)",
      padding: "3px 10px",
      fontSize: 10.5,
      fontFamily: "inherit",
      cursor: "pointer",
      fontWeight: expandLevel === v ? 600 : 500,
      borderRadius: 3
    }
  }, lbl))), /*#__PURE__*/React.createElement("div", {
    className: "matrix",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "26%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "6%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "10%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "10%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "10%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "10%"
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
      width: "9%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Race \xB7 State \xB7 Office"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "# Adv"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Total Spend \u2193"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Broadcast"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable %"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable Opp"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Outside Support"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Outside Oppose"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => {
    const cls = r.kind === "race" ? "state-row" : r.kind === "state" ? "dma-row" : "office-row";
    const cableShare = r.agg.tv > 0 ? r.agg.cable / r.agg.tv : 0;
    const pad = r.level * 18;
    return /*#__PURE__*/React.createElement("tr", {
      key: i,
      className: cls
    }, /*#__PURE__*/React.createElement("td", {
      style: {
        paddingLeft: pad + 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, r.color && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: 2,
        background: r.color
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: r.kind === "race" ? 700 : r.kind === "state" ? 600 : 500
      }
    }, r.label))), /*#__PURE__*/React.createElement("td", null, r.agg.advCount), /*#__PURE__*/React.createElement("td", {
      style: {
        fontWeight: r.kind === "race" ? 700 : 600
      }
    }, Frc.fmtMoneyTight(r.agg.total)), /*#__PURE__*/React.createElement("td", null, Frc.fmtMoneyTight(r.agg.broadcast)), /*#__PURE__*/React.createElement("td", null, Frc.fmtMoneyTight(r.agg.cable)), /*#__PURE__*/React.createElement("td", null, r.agg.tv > 0 ? /*#__PURE__*/React.createElement(CableShareCell, {
      value: cableShare,
      target: 0.20
    }) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        color: "var(--orange)",
        fontWeight: 600
      }
    }, Frc.fmtMoneyTight(r.agg.opp)), /*#__PURE__*/React.createElement("td", {
      style: {
        color: r.agg.support > 0 ? "var(--green)" : "var(--text-muted)"
      }
    }, r.agg.support > 0 ? Frc.fmtMoneyTight(r.agg.support) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        color: r.agg.oppose > 0 ? "var(--red)" : "var(--text-muted)"
      }
    }, r.agg.oppose > 0 ? Frc.fmtMoneyTight(r.agg.oppose) : "—"));
  }))))));
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
  return at.some(x => bt.includes(x)) || bt.some(x => at.includes(x));
}
function parseCalDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function fmtCalDate(value) {
  const d = parseCalDate(value);
  return d ? d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  }) : "—";
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
  General: {
    bg: "#E8F1FF",
    fg: "#195C9F",
    stroke: "#195C9F",
    letter: "G"
  },
  Primary: {
    bg: "#F4EAFE",
    fg: "#6D3BB8",
    stroke: "#6D3BB8",
    letter: "P"
  },
  Runoff: {
    bg: "#FFF3D6",
    fg: "#9A5B00",
    stroke: "#C77900",
    letter: "R"
  },
  Special: {
    bg: "#E7F7EF",
    fg: "#067647",
    stroke: "#00A859",
    letter: "S"
  },
  Other: {
    bg: "#F3F4F6",
    fg: "#4B5563",
    stroke: "#6B7280",
    letter: "O"
  }
};
function TypeChip({
  type
}) {
  const t = electionTypeGroup(type);
  const style = electionTypeStyles[t] || electionTypeStyles.Other;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 50,
      height: 18,
      padding: "0 6px",
      borderRadius: 9,
      background: style.bg,
      color: style.fg,
      fontSize: 9.5,
      fontWeight: 700,
      lineHeight: 1,
      border: `1px solid ${style.stroke}33`
    }
  }, t);
}
function CalendarPage({
  filteredRows,
  filters
}) {
  const rows = useMemoRC(() => {
    const calendarRows = Frc.POLITICAL_WINDOWS || [];
    return calendarRows.filter(w => {
      if (filters.state && filters.state !== "All" && !calStateMatch(w.state, filters.state)) return false;
      if (filters.dma && filters.dma !== "All" && calNorm(w.dma || w.market) !== calNorm(filters.dma)) return false;
      if (filters.window && filters.window !== "All" && w.windowStatus !== filters.window) return false;
      return true;
    }).map(w => {
      const marketRows = filteredRows.filter(r => rowMatchesWindow(r, w));
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
        prospectCount: marketRows.filter(r => r.cableProspectFlag === 1 && !Frc.isClosedProspect(r)).length,
        windowOpen: parseCalDate(w.windowOpenDate),
        electionDateObj: parseCalDate(w.electionDate)
      };
    }).sort((a, b) => (a.electionDateObj || 0) - (b.electionDateObj || 0));
  }, [filteredRows, filters.state, filters.dma, filters.window]);
  const range = useMemoRC(() => {
    const dates = rows.flatMap(r => [r.windowOpen, r.electionDateObj]).filter(Boolean);
    if (!dates.length) {
      return {
        start: new Date("2026-01-01T00:00:00"),
        end: new Date("2026-12-31T00:00:00")
      };
    }
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    start.setDate(start.getDate() - 14);
    end.setDate(end.getDate() + 14);
    return {
      start,
      end
    };
  }, [rows]);

  // Group by market (DMA) for the gantt
  const ganttGroups = useMemoRC(() => {
    const m = new Map();
    rows.forEach(r => {
      const key = `${r.state}|${r.dma}`;
      const cur = m.get(key) || {
        key,
        dma: r.dma,
        market: r.market || r.dma,
        state: r.state,
        region: r.region,
        items: []
      };
      cur.items.push(r);
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => {
      const aIn = a.items.filter(x => x.windowStatus === "In Window").length;
      const bIn = b.items.filter(x => x.windowStatus === "In Window").length;
      if (bIn !== aIn) return bIn - aIn;
      return a.market.localeCompare(b.market);
    });
  }, [rows]);
  const actNow = useMemoRC(() => rows.filter(r => r.windowStatus === "In Window" || r.windowStatus === "Opening Next 30").sort((a, b) => a.daysToElection - b.daysToElection).slice(0, 12), [rows]);
  const typeCounts = useMemoRC(() => {
    const out = {
      Primary: 0,
      Runoff: 0,
      General: 0,
      Special: 0
    };
    rows.forEach(r => {
      const t = r.electionTypeGroup || electionTypeGroup(r.windowType);
      if (out[t] == null) out[t] = 0;
      out[t] += 1;
    });
    return out;
  }, [rows]);
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Election Calendar + Political Windows"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Political windows from the maintained market calendar workbook only. CivicAPI is not used for this page.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "In Window Now",
    value: rows.filter(r => r.windowStatus === "In Window").length.toString(),
    desc: "Calendar rows whose window-open date has passed and election date has not.",
    accent: "green"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Opening Next 30",
    value: rows.filter(r => r.windowStatus === "Opening Next 30").length.toString(),
    desc: "Calendar rows with a window-open date within the next 30 days.",
    accent: "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Future Windows",
    value: rows.filter(r => r.windowStatus === "Future").length.toString(),
    desc: "Market windows scheduled later in the cycle."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Completed",
    value: rows.filter(r => r.windowStatus === "Completed").length.toString(),
    desc: "Calendar rows whose election date has passed."
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row",
    style: {
      gridTemplateColumns: "repeat(4, 1fr)"
    }
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Primary Windows",
    value: (typeCounts.Primary || 0).toString(),
    desc: "Regular primary-election political windows from the market calendar."
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Runoff Windows",
    value: (typeCounts.Runoff || 0).toString(),
    desc: "Runoff primary, runoff general, and standalone runoff windows.",
    accent: "orange"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "General Windows",
    value: (typeCounts.General || 0).toString(),
    desc: "General-election political windows.",
    accent: "blue"
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Special Windows",
    value: (typeCounts.Special || 0).toString(),
    desc: "Special-election political windows.",
    accent: "green"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.5fr 1fr",
      gap: 8,
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Political Windows by Market",
    desc: "Each bar is one workbook window from open date through election day. Only markets and windows listed in the calendar file appear here.",
    accent: {
      bg: "#FFF3D6",
      fg: "#8A6500",
      text: "Gantt"
    },
    style: {
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(GanttChart, {
    groups: ganttGroups,
    rangeStart: range.start,
    rangeEnd: range.end
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "Act Now",
    desc: "Open and soon-opening market windows sorted by election urgency, with current spend context from matched advertiser rows.",
    accent: {
      bg: "#E0F4EA",
      fg: "#06633B",
      text: `${actNow.length} live`
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
      width: "34%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "15%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "15%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "16%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "20%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Market \xB7 Window"), /*#__PURE__*/React.createElement("th", null, "Type"), /*#__PURE__*/React.createElement("th", null, "Election"), /*#__PURE__*/React.createElement("th", null, "Window"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Spend / Opp"))), /*#__PURE__*/React.createElement("tbody", null, actNow.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.politicalWindowKey
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name",
    title: `${r.state} · ${r.market}`
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, r.market), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: "var(--text-muted)",
      fontWeight: 500
    }
  }, r.state, " \xB7 ", r.windowType))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(TypeChip, {
    type: r.windowType
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("span", null, fmtCalDate(r.electionDate)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      color: "var(--text-muted)"
    }
  }, r.daysToElection, "d"))), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(WindowChip, {
    status: r.windowStatus
  })), /*#__PURE__*/React.createElement("td", {
    className: "num",
    style: {
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("div", null, Frc.fmtMoneyTight(r.marketSpend)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9.5,
      color: "var(--orange)",
      fontWeight: 700
    }
  }, Frc.fmtMoneyTight(r.cableOpportunity), " opp"))))))))));
}
function GanttChart({
  groups,
  rangeStart,
  rangeEnd
}) {
  const containerRef = React.useRef(null);
  const [size, setSize] = React.useState({
    w: 600,
    h: 360
  });
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({
      w: el.clientWidth || 600,
      h: el.clientHeight || 360
    });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = size.w,
    H = size.h;
  const labelW = 130;
  const pad = {
    left: labelW,
    right: 16,
    top: 28,
    bottom: 18
  };
  const plotW = Math.max(50, W - pad.left - pad.right);
  const plotH = Math.max(20, H - pad.top - pad.bottom);
  const totalDays = (rangeEnd - rangeStart) / (1000 * 60 * 60 * 24);
  const xFor = d => pad.left + (d - rangeStart) / (1000 * 60 * 60 * 24) / totalDays * plotW;

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
    "In Window": "#00A859",
    "Opening Next 30": "#FFB600",
    "Future": "#9CA3AF",
    "Completed": "#D1D5DB"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: containerRef,
    style: {
      flex: 1,
      overflowY: "auto",
      overflowX: "hidden",
      position: "relative",
      borderTop: "1px solid var(--border)"
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: W,
    height: pad.top + innerH + pad.bottom,
    style: {
      display: "block"
    }
  }, months.map((m, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, /*#__PURE__*/React.createElement("line", {
    x1: xFor(m),
    x2: xFor(m),
    y1: pad.top - 14,
    y2: pad.top + innerH,
    stroke: "#F1F2F4",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("text", {
    x: xFor(m) + 3,
    y: pad.top - 16,
    fontSize: "10",
    fill: "#4B5563",
    fontWeight: "500"
  }, m.toLocaleDateString("en-US", {
    month: "short"
  })))), /*#__PURE__*/React.createElement("line", {
    x1: xFor(today),
    x2: xFor(today),
    y1: pad.top - 6,
    y2: pad.top + innerH,
    stroke: "#E4002B",
    strokeWidth: "1.2",
    strokeDasharray: "3,3"
  }), /*#__PURE__*/React.createElement("text", {
    x: xFor(today) + 4,
    y: pad.top - 6,
    fontSize: "10",
    fill: "#E4002B",
    fontWeight: "700"
  }, "Today"), groups.map((g, gi) => {
    const y = pad.top + gi * rowH;
    return /*#__PURE__*/React.createElement("g", {
      key: g.key || `${g.state}|${g.dma}`
    }, gi % 2 === 0 && /*#__PURE__*/React.createElement("rect", {
      x: 0,
      y: y,
      width: W,
      height: rowH,
      fill: "#FAFBFC"
    }), /*#__PURE__*/React.createElement("text", {
      x: labelW - 8,
      y: y + rowH / 2 + 1,
      fontSize: "11",
      fill: "#111827",
      fontWeight: "600",
      textAnchor: "end"
    }, g.market || g.dma), /*#__PURE__*/React.createElement("text", {
      x: labelW - 8,
      y: y + rowH / 2 + 11,
      fontSize: "8.5",
      fill: "#6B7280",
      fontWeight: "500",
      textAnchor: "end"
    }, g.state), g.items.map((r, ri) => {
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
      return /*#__PURE__*/React.createElement("g", {
        key: ri
      }, /*#__PURE__*/React.createElement("rect", {
        x: x1,
        y: by,
        width: w,
        height: bh,
        fill: statusColors[r.windowStatus],
        rx: "2",
        opacity: "0.92",
        stroke: typeStyle.stroke,
        strokeWidth: typeGroup === "General" ? 1.2 : 2,
        strokeDasharray: typeGroup === "Runoff" ? "4,2" : typeGroup === "Primary" ? "2,2" : ""
      }, /*#__PURE__*/React.createElement("title", null, r.state, " \xB7 ", r.market, " \xB7 ", r.windowType, "\\nElection type: ", typeGroup, "\\nWindow: ", fmtCalDate(r.windowOpenDate), " \u2192 ", fmtCalDate(r.electionDate), "\\nSpend in market: ", Frc.fmtMoneyTight(r.marketSpend))), w > 18 && bh > 9 && /*#__PURE__*/React.createElement("text", {
        x: x1 + 5,
        y: by + bh / 2 + 3,
        fontSize: "8",
        fill: "#fff",
        fontWeight: "800",
        pointerEvents: "none"
      }, typeStyle.letter), /*#__PURE__*/React.createElement("line", {
        x1: x2,
        x2: x2,
        y1: by - 2,
        y2: by + bh + 2,
        stroke: "#111827",
        strokeWidth: "1"
      }));
    }));
  }))), /*#__PURE__*/React.createElement("div", {
    className: "scatter-legend",
    style: {
      marginTop: 6,
      paddingTop: 4,
      borderTop: "1px solid var(--border)"
    }
  }, Object.entries(statusColors).map(([k, c]) => /*#__PURE__*/React.createElement("span", {
    key: k,
    style: {
      fontSize: 10.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "lg-dot",
    style: {
      background: c
    }
  }), k)), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 14,
      background: "var(--border)",
      margin: "0 2px"
    }
  }), ["General", "Primary", "Runoff", "Special"].map(k => {
    const s = electionTypeStyles[k];
    return /*#__PURE__*/React.createElement("span", {
      key: k,
      style: {
        fontSize: 10.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "lg-dot",
      style: {
        background: s.stroke
      }
    }), s.letter, " = ", k);
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10.5,
      color: "var(--text-secondary)",
      marginLeft: "auto"
    }
  }, "Fill = status \xB7 border/letter = election type \xB7 thickness = matched market spend")));
}
Object.assign(window, {
  RacePage,
  CalendarPage
});
})();
