(function(){
/* global React */
// Page 1 — Executive Overview

const {
  useMemo
} = React;
const F1 = window.pbData;
function OverviewPage({
  filteredRows,
  measures,
  filters
}) {
  // -----------------------------------------------------------------------
  // Build views off the filtered+computed rows
  // -----------------------------------------------------------------------
  const topOpps = useMemo(() => {
    return [...filteredRows].filter(r => r.cableOpportunity > 0 && !isClosedProspect(r)).sort((a, b) => b.cableOpportunity - a.cableOpportunity).slice(0, 12);
  }, [filteredRows]);
  const maxOpp = Math.max(...topOpps.map(r => r.cableOpportunity), 1);

  // Cable share by race level
  const raceLevelRows = useMemo(() => {
    const map = new Map();
    filteredRows.forEach(r => {
      const m = map.get(r.raceLevel) || {
        tv: 0,
        cable: 0
      };
      m.tv += r.tvSpend;
      m.cable += r.cable;
      map.set(r.raceLevel, m);
    });
    return Array.from(map.entries()).map(([rl, m]) => ({
      label: rl,
      value: m.tv > 0 ? m.cable / m.tv : 0,
      tv: m.tv,
      color: window.RACE_COLORS[rl] || "var(--blue)"
    })).filter(r => r.tv > 0).sort((a, b) => b.value - a.value);
  }, [filteredRows]);

  // 50-state map only: keep the rest of the page tied to calendar-matched
  // markets, but let the map show all states from the full advertiser set.
  const stateMapRows = useMemo(() => {
    const map = new Map(US_STATE_TILES.map(s => [s.abbr, 0]));
    F1.advertisers.forEach(r => {
      if (filters.office && filters.office !== "All" && r.office !== filters.office) return;
      if (filters.raceLevel && filters.raceLevel !== "All" && r.raceLevel !== filters.raceLevel) return;
      if (filters.party && filters.party !== "All" && r.party !== filters.party) return;
      if (filters.agency && filters.agency !== "All" && r.agency !== filters.agency) return;
      const states = parseStateTokens(r.state);
      if (!states.length) return;
      const allocated = (r.total || 0) / states.length;
      states.forEach(st => map.set(st, (map.get(st) || 0) + allocated));
    });
    return US_STATE_TILES.map(s => ({
      ...s,
      spend: map.get(s.abbr) || 0
    }));
  }, [filteredRows, filters.office, filters.raceLevel, filters.party, filters.agency]);

  // Market opportunity matrix: State → DMA → Office
  const matrixRows = useMemo(() => {
    const tree = new Map();
    filteredRows.forEach(r => {
      const s = tree.get(r.state) || {
        rows: new Map(),
        agg: blankAgg()
      };
      const d = s.rows.get(r.dma) || {
        rows: new Map(),
        agg: blankAgg()
      };
      const o = d.rows.get(r.office) || {
        agg: blankAgg()
      };
      addAgg(o.agg, r);
      addAgg(d.agg, r);
      addAgg(s.agg, r);
      d.rows.set(r.office, o);
      s.rows.set(r.dma, d);
      tree.set(r.state, s);
    });
    const flat = [];
    const sortedStates = Array.from(tree.entries()).sort((a, b) => b[1].agg.opp - a[1].agg.opp);
    sortedStates.forEach(([state, s]) => {
      flat.push({
        kind: "state",
        label: state,
        agg: s.agg
      });
      const sortedDmas = Array.from(s.rows.entries()).sort((a, b) => b[1].agg.opp - a[1].agg.opp);
      sortedDmas.forEach(([dma, d]) => {
        flat.push({
          kind: "dma",
          label: dma,
          agg: d.agg
        });
        const sortedOffices = Array.from(d.rows.entries()).sort((a, b) => b[1].agg.opp - a[1].agg.opp);
        sortedOffices.forEach(([office, o]) => {
          flat.push({
            kind: "office",
            label: office,
            agg: o.agg
          });
        });
      });
    });
    return flat;
  }, [filteredRows]);
  function blankAgg() {
    return {
      total: 0,
      broadcast: 0,
      ctv: 0,
      cable: 0,
      tv: 0,
      opp: 0
    };
  }
  function addAgg(a, r) {
    a.total += r.total;
    a.broadcast += r.broadcast;
    a.ctv += r.ctv;
    a.cable += r.cable;
    a.tv += r.tvSpend;
    a.opp += r.cableOpportunity;
  }

  // -----------------------------------------------------------------------
  // KPI deltas vs prior snapshot (mocked)
  // -----------------------------------------------------------------------
  const kpiDeltas = {
    total: {
      dir: "up",
      text: "+12.4% wk"
    },
    bcCtv: {
      dir: "up",
      text: "+9.8% wk"
    },
    cable: {
      dir: "up",
      text: "+3.1% wk"
    },
    cableShare: {
      dir: "down",
      text: "-1.2 pt"
    },
    cableOpp: {
      dir: "up",
      text: "+18.5% wk"
    },
    zeroCable: {
      dir: "up",
      text: "+4 wk"
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "page-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "page-title-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, "Executive Overview"), /*#__PURE__*/React.createElement("div", {
    className: "subtitle"
  }, "Current political spend, media mix, and cable opportunity across markets in the political window calendar.")), /*#__PURE__*/React.createElement(ActiveFilters, {
    filters: filters
  })), /*#__PURE__*/React.createElement("div", {
    className: "kpi-row"
  }, /*#__PURE__*/React.createElement(KPI, {
    title: "Total Spend",
    value: F1.fmtMoney(measures.total),
    desc: "All current spend in calendar-matched political markets.",
    delta: kpiDeltas.total
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Broadcast + CTV Spend",
    value: F1.fmtMoney(measures.bcCtvSpend),
    desc: "TV-style spend that signals cable targeting upside.",
    delta: kpiDeltas.bcCtv
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Cable Spend",
    value: F1.fmtMoney(measures.cable),
    desc: "Current spend already allocated to cable.",
    delta: kpiDeltas.cable
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Cable Share",
    value: F1.fmtPct(measures.cableShare),
    desc: "Cable as a share of broadcast, cable, and CTV spend.",
    delta: kpiDeltas.cableShare
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Cable Opportunity",
    value: F1.fmtMoney(measures.cableOpportunity),
    desc: "Estimated spend needed to reach the selected cable share target.",
    accent: "orange",
    delta: kpiDeltas.cableOpp
  }), /*#__PURE__*/React.createElement(KPI, {
    title: "Zero-Cable Advertisers",
    value: measures.zeroCableAdv.toString(),
    desc: "Advertisers with broadcast or CTV spend and no cable spend.",
    accent: "red",
    delta: kpiDeltas.zeroCable
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid-overview"
  }, /*#__PURE__*/React.createElement("div", {
    className: "overview-top-row"
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Media Mix By Spend",
    desc: "How current political spend distributes across broadcast, cable, CTV, digital, and radio."
  }, /*#__PURE__*/React.createElement(StackedMediaMix, {
    broadcast: measures.broadcast,
    cable: measures.cable,
    ctv: measures.ctv,
    digital: measures.digital,
    radio: measures.radio
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "Spend By State Map",
    desc: "All 50 states are shown here only. State/DMA/window slicers are ignored so the map can show national spend."
  }, /*#__PURE__*/React.createElement(StateSpendMap, {
    rows: stateMapRows,
    selectedState: filters.state
  })), /*#__PURE__*/React.createElement(Viz, {
    title: "Cable Share By Race Level",
    desc: "Race types relying less on cable within the TV media mix. Dashed line is the selected cable share target."
  }, /*#__PURE__*/React.createElement(HBarChart, {
    rows: raceLevelRows,
    valueFormat: F1.fmtPct,
    refLine: measures.cableShareTarget,
    refLabel: "Cable share target",
    maxOverride: Math.max(measures.cableShareTarget * 1.6, 0.30),
    compact: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "overview-bottom-row"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Top Cable Opportunities",
    desc: "Advertisers with the largest estimated gap between current cable spend and the target cable mix. Sorted by opportunity.",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "tbl-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "tbl"
  }, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "26%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "13%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "9%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "14%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "11%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Advertiser"), /*#__PURE__*/React.createElement("th", null, "State"), /*#__PURE__*/React.createElement("th", null, "DMA"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Bcast $"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "CTV $"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable $"), /*#__PURE__*/React.createElement("th", {
    className: "num"
  }, "Cable Opp \u2193"), /*#__PURE__*/React.createElement("th", null, "Label"))), /*#__PURE__*/React.createElement("tbody", null, topOpps.map(r => /*#__PURE__*/React.createElement("tr", {
    key: r.advertiserKey
  }, /*#__PURE__*/React.createElement("td", {
    className: "adv-name",
    title: `${r.advertiser} · ${r.office}`
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
  }, r.advertiser))), /*#__PURE__*/React.createElement("td", null, r.state), /*#__PURE__*/React.createElement("td", {
    title: r.dma
  }, r.dma), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F1.fmtMoneyTight(r.broadcast)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F1.fmtMoneyTight(r.ctv)), /*#__PURE__*/React.createElement("td", {
    className: "num"
  }, F1.fmtMoneyTight(r.cable)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(OpportunityBar, {
    value: r.cableOpportunity,
    max: maxOpp
  })), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(ProspectLabelChip, {
    label: r.cableProspectLabel
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: 10,
      color: "var(--text-secondary)",
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", null, "Showing top ", topOpps.length, " of ", filteredRows.filter(r => r.cableOpportunity > 0 && !isClosedProspect(r)).length, " advertisers with cable upside; completed races are excluded."), /*#__PURE__*/React.createElement("span", null, "Cable share: ", /*#__PURE__*/React.createElement("span", {
    className: "chip chip-red",
    style: {
      marginLeft: 4
    }
  }, "below target"), " ", /*#__PURE__*/React.createElement("span", {
    className: "chip chip-yellow",
    style: {
      marginLeft: 4
    }
  }, "near target"), " ", /*#__PURE__*/React.createElement("span", {
    className: "chip chip-green",
    style: {
      marginLeft: 4
    }
  }, "at/above target"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(Viz, {
    title: "Market Opportunity Matrix",
    desc: "Spend and cable share by state, market, and office. Sorted by cable opportunity within each parent.",
    style: {
      flex: 1,
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "matrix"
  }, /*#__PURE__*/React.createElement("table", null, /*#__PURE__*/React.createElement("colgroup", null, /*#__PURE__*/React.createElement("col", {
    style: {
      width: "28%"
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
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "12%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "11%"
    }
  }), /*#__PURE__*/React.createElement("col", {
    style: {
      width: "13%"
    }
  })), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "State / DMA / Office"), /*#__PURE__*/React.createElement("th", null, "Total"), /*#__PURE__*/React.createElement("th", null, "Broadcast"), /*#__PURE__*/React.createElement("th", null, "CTV"), /*#__PURE__*/React.createElement("th", null, "Cable"), /*#__PURE__*/React.createElement("th", null, "Cable %"), /*#__PURE__*/React.createElement("th", null, "Opp \u2193"))), /*#__PURE__*/React.createElement("tbody", null, matrixRows.map((r, i) => {
    const cls = r.kind === "state" ? "state-row" : r.kind === "dma" ? "dma-row" : "office-row";
    const cableShare = r.agg.tv > 0 ? r.agg.cable / r.agg.tv : 0;
    return /*#__PURE__*/React.createElement("tr", {
      key: i,
      className: cls
    }, /*#__PURE__*/React.createElement("td", null, r.label), /*#__PURE__*/React.createElement("td", null, F1.fmtMoneyTight(r.agg.total)), /*#__PURE__*/React.createElement("td", null, F1.fmtMoneyTight(r.agg.broadcast)), /*#__PURE__*/React.createElement("td", null, F1.fmtMoneyTight(r.agg.ctv)), /*#__PURE__*/React.createElement("td", null, F1.fmtMoneyTight(r.agg.cable)), /*#__PURE__*/React.createElement("td", null, r.agg.tv > 0 ? /*#__PURE__*/React.createElement(CableShareCell, {
      value: cableShare,
      target: measures.cableShareTarget
    }) : "—"), /*#__PURE__*/React.createElement("td", {
      style: {
        color: "var(--orange)",
        fontWeight: 600
      }
    }, F1.fmtMoneyTight(r.agg.opp)));
  })))))))), /*#__PURE__*/React.createElement(NotesBox, {
    title: "How To Read Opportunity",
    desc: "Cable opportunity is calculated for advertisers spending on broadcast or CTV whose cable share is below the selected target. It is a prioritization signal for sellers, not a booked-revenue forecast."
  }));
}
function isClosedProspect(row) {
  return F1.isClosedProspect ? F1.isClosedProspect(row) : !!(row && (row.primaryLost || row.generalWon || row.generalLost || row.electionResult && row.electionResult.lost));
}
const US_STATE_TILES = [{
  abbr: "WA",
  name: "Washington",
  row: 1,
  col: 2
}, {
  abbr: "MT",
  name: "Montana",
  row: 1,
  col: 4
}, {
  abbr: "ND",
  name: "North Dakota",
  row: 1,
  col: 5
}, {
  abbr: "MN",
  name: "Minnesota",
  row: 1,
  col: 6
}, {
  abbr: "ME",
  name: "Maine",
  row: 1,
  col: 12
}, {
  abbr: "OR",
  name: "Oregon",
  row: 2,
  col: 2
}, {
  abbr: "ID",
  name: "Idaho",
  row: 2,
  col: 3
}, {
  abbr: "WY",
  name: "Wyoming",
  row: 2,
  col: 4
}, {
  abbr: "SD",
  name: "South Dakota",
  row: 2,
  col: 5
}, {
  abbr: "IA",
  name: "Iowa",
  row: 2,
  col: 6
}, {
  abbr: "WI",
  name: "Wisconsin",
  row: 2,
  col: 7
}, {
  abbr: "MI",
  name: "Michigan",
  row: 2,
  col: 8
}, {
  abbr: "NY",
  name: "New York",
  row: 2,
  col: 9
}, {
  abbr: "VT",
  name: "Vermont",
  row: 2,
  col: 10
}, {
  abbr: "NH",
  name: "New Hampshire",
  row: 2,
  col: 11
}, {
  abbr: "CA",
  name: "California",
  row: 3,
  col: 2
}, {
  abbr: "NV",
  name: "Nevada",
  row: 3,
  col: 3
}, {
  abbr: "UT",
  name: "Utah",
  row: 3,
  col: 4
}, {
  abbr: "CO",
  name: "Colorado",
  row: 3,
  col: 5
}, {
  abbr: "NE",
  name: "Nebraska",
  row: 3,
  col: 6
}, {
  abbr: "IL",
  name: "Illinois",
  row: 3,
  col: 7
}, {
  abbr: "IN",
  name: "Indiana",
  row: 3,
  col: 8
}, {
  abbr: "OH",
  name: "Ohio",
  row: 3,
  col: 9
}, {
  abbr: "PA",
  name: "Pennsylvania",
  row: 3,
  col: 10
}, {
  abbr: "NJ",
  name: "New Jersey",
  row: 3,
  col: 11
}, {
  abbr: "MA",
  name: "Massachusetts",
  row: 3,
  col: 12
}, {
  abbr: "AZ",
  name: "Arizona",
  row: 4,
  col: 3
}, {
  abbr: "NM",
  name: "New Mexico",
  row: 4,
  col: 4
}, {
  abbr: "KS",
  name: "Kansas",
  row: 4,
  col: 5
}, {
  abbr: "MO",
  name: "Missouri",
  row: 4,
  col: 6
}, {
  abbr: "KY",
  name: "Kentucky",
  row: 4,
  col: 7
}, {
  abbr: "WV",
  name: "West Virginia",
  row: 4,
  col: 8
}, {
  abbr: "VA",
  name: "Virginia",
  row: 4,
  col: 9
}, {
  abbr: "MD",
  name: "Maryland",
  row: 4,
  col: 10
}, {
  abbr: "DE",
  name: "Delaware",
  row: 4,
  col: 11
}, {
  abbr: "CT",
  name: "Connecticut",
  row: 4,
  col: 12
}, {
  abbr: "OK",
  name: "Oklahoma",
  row: 5,
  col: 5
}, {
  abbr: "AR",
  name: "Arkansas",
  row: 5,
  col: 6
}, {
  abbr: "TN",
  name: "Tennessee",
  row: 5,
  col: 7
}, {
  abbr: "NC",
  name: "North Carolina",
  row: 5,
  col: 9
}, {
  abbr: "RI",
  name: "Rhode Island",
  row: 5,
  col: 12
}, {
  abbr: "TX",
  name: "Texas",
  row: 6,
  col: 4
}, {
  abbr: "LA",
  name: "Louisiana",
  row: 6,
  col: 6
}, {
  abbr: "MS",
  name: "Mississippi",
  row: 6,
  col: 7
}, {
  abbr: "AL",
  name: "Alabama",
  row: 6,
  col: 8
}, {
  abbr: "GA",
  name: "Georgia",
  row: 6,
  col: 9
}, {
  abbr: "SC",
  name: "South Carolina",
  row: 6,
  col: 10
}, {
  abbr: "AK",
  name: "Alaska",
  row: 7,
  col: 1
}, {
  abbr: "HI",
  name: "Hawaii",
  row: 7,
  col: 2
}, {
  abbr: "FL",
  name: "Florida",
  row: 7,
  col: 10
}];
const US_STATE_CODES = new Set(US_STATE_TILES.map(s => s.abbr));
function parseStateTokens(value) {
  return String(value || "").toUpperCase().split(/[^A-Z]+/).filter(token => US_STATE_CODES.has(token));
}
function StateSpendMap({
  rows,
  selectedState
}) {
  const maxSpend = Math.max(...rows.map(r => r.spend), 1);
  const activeState = US_STATE_CODES.has(selectedState) ? selectedState : null;
  const topStates = [...rows].filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 5);
  return /*#__PURE__*/React.createElement("div", {
    className: "state-map-wrap"
  }, /*#__PURE__*/React.createElement("div", {
    className: "state-map-grid",
    "aria-label": "Spend by state tile map"
  }, rows.map(state => {
    const intensity = state.spend > 0 ? Math.sqrt(state.spend / maxSpend) : 0;
    const bg = state.spend > 0 ? stateSpendColor(intensity) : "#F3F4F6";
    const fg = intensity > 0.56 ? "#FFFFFF" : "var(--text-primary)";
    const selected = activeState === state.abbr;
    return /*#__PURE__*/React.createElement("div", {
      key: state.abbr,
      className: `state-tile${selected ? " selected" : ""}`,
      style: {
        gridRow: state.row,
        gridColumn: state.col,
        background: bg,
        color: fg
      },
      title: `${state.name}: ${F1.fmtMoneyTight(state.spend)}`
    }, /*#__PURE__*/React.createElement("span", {
      className: "st-abbr"
    }, state.abbr), /*#__PURE__*/React.createElement("span", {
      className: "st-value"
    }, state.spend > 0 ? compactStateSpend(state.spend) : "—"));
  })), /*#__PURE__*/React.createElement("div", {
    className: "state-map-side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "state-map-side-title"
  }, "Top States"), topStates.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: "state-rank-row",
    key: s.abbr
  }, /*#__PURE__*/React.createElement("span", null, i + 1, ". ", s.abbr), /*#__PURE__*/React.createElement("strong", null, F1.fmtMoneyTight(s.spend)))), /*#__PURE__*/React.createElement("div", {
    className: "state-map-legend"
  }, /*#__PURE__*/React.createElement("span", null, "Low"), /*#__PURE__*/React.createElement("div", {
    className: "state-map-scale"
  }), /*#__PURE__*/React.createElement("span", null, "High")), /*#__PURE__*/React.createElement("div", {
    className: "state-map-note"
  }, "Map only \xB7 50 states")));
}
function stateSpendColor(t) {
  const start = [224, 241, 250];
  const mid = [0, 140, 195];
  const end = [0, 94, 184];
  const blend = t < 0.58 ? mixRgb(start, mid, t / 0.58) : mixRgb(mid, end, (t - 0.58) / 0.42);
  return `rgb(${blend[0]}, ${blend[1]}, ${blend[2]})`;
}
function mixRgb(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return a.map((v, i) => Math.round(v + (b[i] - v) * clamped));
}
function compactStateSpend(v) {
  if (!v) return "—";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + "M";
  if (v >= 1_000) return "$" + (v / 1_000).toFixed(0) + "K";
  return "$" + v.toFixed(0);
}
function ActiveFilters({
  filters
}) {
  const active = Object.entries(filters).filter(([, v]) => v && v !== "All");
  if (!active.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "right-meta"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "label"
    }, "Latest snapshot "), /*#__PURE__*/React.createElement("span", {
      className: "val"
    }, F1.SNAPSHOT_DATE)), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 4,
        color: "var(--text-muted)"
      }
    }, "No filters applied \xB7 showing all calendar-matched markets"));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "right-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Latest snapshot "), /*#__PURE__*/React.createElement("span", {
    className: "val"
  }, F1.SNAPSHOT_DATE)), /*#__PURE__*/React.createElement("div", {
    className: "active-filters",
    style: {
      marginTop: 4,
      justifyContent: "flex-end"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "label"
  }, "Filters:"), active.map(([k, v]) => /*#__PURE__*/React.createElement("span", {
    key: k,
    className: "chip-filter"
  }, labelFor(k), ": ", v))));
}
function labelFor(k) {
  return {
    state: "State",
    dma: "DMA",
    office: "Office",
    raceLevel: "Race",
    party: "Party",
    agency: "Agency",
    entityType: "Entity",
    window: "Window"
  }[k] || k;
}
Object.assign(window, {
  OverviewPage,
  ActiveFilters
});
})();
