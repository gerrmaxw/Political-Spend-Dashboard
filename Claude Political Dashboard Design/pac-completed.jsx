/* global React */
// Page 7 — PAC / FEC Breakdown
// Page 8 — Completed Elections + Cost Per Vote

const { useState: useStatePC, useMemo: useMemoPC } = React;
const Fpc = window.pbData;

// ===========================================================================
// Page 7 — PAC / FEC Spend Breakdown
// ===========================================================================
function PacPage({ filters }) {
  // Filter PAC rows by current global filters where they apply
  const rows = useMemoPC(() => {
    return Fpc.PAC_ROWS.filter((p) => {
      if (filters.state    && filters.state    !== "All" && p.targetState !== filters.state) return false;
      if (filters.raceLevel && filters.raceLevel !== "All" && p.focus      !== filters.raceLevel) return false;
      return true;
    });
  }, [filters]);

  // By committee — stacked support/oppose
  const committeeRows = useMemoPC(() => {
    const m = new Map();
    rows.forEach((p) => {
      const cur = m.get(p.committee) || { committee: p.committee, alignment: p.alignment, support: 0, oppose: 0 };
      cur.support += p.support;
      cur.oppose  += p.oppose;
      m.set(p.committee, cur);
    });
    return Array.from(m.values()).map((c) => ({ ...c, total: c.support + c.oppose }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);
  const maxCommittee = Math.max(...committeeRows.map((c) => c.total), 1);

  // Outside spend by snapshot — synthesize via trendCurve on the totals
  const outsideTrend = useMemoPC(() => {
    const total = rows.reduce((a, p) => a + p.total, 0);
    const support = rows.reduce((a, p) => a + p.support, 0);
    const oppose  = rows.reduce((a, p) => a + p.oppose,  0);
    return Fpc.SNAPSHOTS.map((s) => ({
      ...s,
      support: Fpc.trendCurve(s.key, support),
      oppose:  Fpc.trendCurve(s.key, oppose),
      total:   Fpc.trendCurve(s.key, total),
    }));
  }, [rows]);

  // Race-level matrix
  const raceMatrix = useMemoPC(() => {
    const m = new Map();
    rows.forEach((p) => {
      const cur = m.get(p.focus) || { focus: p.focus, support: 0, oppose: 0, committees: new Set(), targets: new Set() };
      cur.support += p.support;
      cur.oppose  += p.oppose;
      cur.committees.add(p.committee);
      cur.targets.add(p.target);
      m.set(p.focus, cur);
    });
    return Array.from(m.values()).sort((a, b) => (b.support + b.oppose) - (a.support + a.oppose));
  }, [rows]);

  // Top targets table — payee/purpose detail
  const detail = useMemoPC(() => {
    return [...rows].sort((a, b) => b.total - a.total).slice(0, 12);
  }, [rows]);

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">PAC / FEC Spend Breakdown</div>
          <div className="subtitle">Outside committee spend — support vs. oppose — by committee, week, race level, and target candidate.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPI title="Committees Active" value={committeeRows.length.toString()}
             desc="PACs and outside groups with reported spend in scope." accent="blue" />
        <KPI title="Total Outside Spend" value={Fpc.fmtMoney(rows.reduce((a, p) => a + p.total, 0))}
             desc="Sum of support and oppose spend across all committees." accent="orange" />
        <KPI title="Support Spend" value={Fpc.fmtMoney(rows.reduce((a, p) => a + p.support, 0))}
             desc="Outside spend favoring the targeted candidate." accent="green" />
        <KPI title="Oppose Spend" value={Fpc.fmtMoney(rows.reduce((a, p) => a + p.oppose,  0))}
             desc="Outside spend running against the targeted candidate." accent="red" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* Committee diverging bar chart */}
        <Viz
          title="Committees · Support / Oppose Split"
          desc="Top outside-spending committees, split between dollars supporting and opposing target candidates."
          style={{ minHeight: 0 }}
        >
          <div style={{ flex: 1, overflow: "auto", paddingTop: 4 }}>
            {committeeRows.map((c) => (
              <div key={c.committee} style={{ display: "grid", gridTemplateColumns: "150px 1fr 70px", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px dashed transparent" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.committee}>
                  {c.committee}
                  <span className={`chip ${c.alignment === "DEM" ? "chip-blue" : "chip-red"}`} style={{ marginLeft: 4 }}>{c.alignment}</span>
                </div>
                <div style={{ height: 16, position: "relative", display: "flex" }}>
                  <div style={{ width: `${(c.support / maxCommittee) * 100}%`, background: "#00A859", height: "100%", borderRadius: "2px 0 0 2px" }}></div>
                  <div style={{ width: `${(c.oppose / maxCommittee) * 100}%`, background: "#E4002B", height: "100%", borderRadius: "0 2px 2px 0" }}></div>
                </div>
                <div style={{ textAlign: "right", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {Fpc.fmtMoneyTight(c.total)}
                </div>
              </div>
            ))}
          </div>
          <div className="scatter-legend" style={{ marginTop: 4 }}>
            <span style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: "#00A859" }}></span>Support</span>
            <span style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: "#E4002B" }}></span>Oppose</span>
          </div>
        </Viz>

        {/* Outside spend trend */}
        <Viz
          title="Outside Spend by Snapshot"
          desc="Cumulative support and oppose spend reported by committees across weekly snapshots."
          style={{ minHeight: 0 }}
        >
          <OutsideTrendChart data={outsideTrend} />
        </Viz>

        {/* Race-level matrix */}
        <Viz
          title="By Race Level"
          desc="Outside spend split by race level — useful to see where PAC money is concentrated."
          style={{ minHeight: 0 }}
        >
          <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="tbl">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "23%" }} />
                <col style={{ width: "23%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Race Level</th>
                  <th className="num"># Cmte</th>
                  <th className="num"># Tgt</th>
                  <th className="num">Support</th>
                  <th className="num">Oppose</th>
                </tr>
              </thead>
              <tbody>
                {raceMatrix.map((r) => {
                  const total = r.support + r.oppose;
                  const supPct = total > 0 ? r.support / total : 0;
                  return (
                    <tr key={r.focus}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: window.RACE_COLORS[r.focus] }}></span>
                          <span style={{ fontWeight: 600 }}>{r.focus}</span>
                        </div>
                      </td>
                      <td className="num">{r.committees.size}</td>
                      <td className="num">{r.targets.size}</td>
                      <td>
                        <div className="data-bar">
                          <div className="fill" style={{ width: `${supPct * 100}%`, background: "var(--green-soft)" }}></div>
                          <span className="val" style={{ color: "var(--green)" }}>{Fpc.fmtMoneyTight(r.support)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="data-bar">
                          <div className="fill" style={{ width: `${(1 - supPct) * 100}%`, background: "var(--red-soft)" }}></div>
                          <span className="val" style={{ color: "var(--red)" }}>{Fpc.fmtMoneyTight(r.oppose)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Viz>

        {/* Detail table */}
        <Viz
          title="Top Targets · Detail"
          desc="Highest-dollar PAC spend rows by target candidate, with the committee, alignment, payee, and week of record."
          style={{ minHeight: 0 }}
        >
          <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="tbl">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Target Candidate</th>
                  <th>Committee</th>
                  <th>Payee</th>
                  <th>Week</th>
                  <th className="num">Support</th>
                  <th className="num">Oppose</th>
                </tr>
              </thead>
              <tbody>
                {detail.map((p, i) => (
                  <tr key={i}>
                    <td className="adv-name" title={p.target}>{p.target}</td>
                    <td>{p.committee} <span className={`chip ${p.alignment === "DEM" ? "chip-blue" : "chip-red"}`} style={{ marginLeft: 4 }}>{p.alignment}</span></td>
                    <td><span className="chip chip-gray">{p.payee}</span></td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 10.5 }}>{p.weekEnding}</td>
                    <td className="num" style={{ color: "var(--green)" }}>{Fpc.fmtMoneyTight(p.support)}</td>
                    <td className="num" style={{ color: "var(--red)"   }}>{Fpc.fmtMoneyTight(p.oppose)}</td>
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

function OutsideTrendChart({ data }) {
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
  const yMax = Math.max(...data.map((s) => s.total), 1) * 1.1;
  const xPos = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const yPos = (v) => pad.top + (1 - v / yMax) * plotH;

  const supPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.support)).join(" ");
  const oppPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.oppose)).join(" ");
  const totPath = data.map((p, i) => (i === 0 ? "M" : "L") + xPos(i) + " " + yPos(p.total)).join(" ");

  return (
    <div style={{ flex: 1, minHeight: 0 }} ref={containerRef}>
      <svg width={W} height={H}>
        {Array.from({ length: 4 }, (_, i) => yMax * (i / 3)).map((v, i) => (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={yPos(v)} y2={yPos(v)} stroke="#F1F2F4" strokeWidth="1" />
            <text x={pad.left - 6} y={yPos(v) + 3} fontSize="10" fill="#4B5563" textAnchor="end">{Fpc.fmtMoneyTight(v)}</text>
          </g>
        ))}
        {data.map((s, i) => (
          (i % 3 === 0 || i === data.length - 1) && (
            <text key={i} x={xPos(i)} y={H - 8} fontSize="10" fill="#4B5563" textAnchor="middle">{s.label}</text>
          )
        ))}
        <path d={totPath} fill="none" stroke="#111827" strokeWidth="1.4" strokeDasharray="4,3" />
        <path d={supPath} fill="none" stroke="#00A859" strokeWidth="2" />
        <path d={oppPath} fill="none" stroke="#E4002B" strokeWidth="2" />
      </svg>
      <div className="scatter-legend" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: "#00A859" }}></span>Support</span>
        <span style={{ fontSize: 10.5 }}><span className="lg-dot" style={{ background: "#E4002B" }}></span>Oppose</span>
        <span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>
          <span style={{ display: "inline-block", width: 14, borderTop: "1.4px dashed #111827", verticalAlign: "middle", marginRight: 4 }}></span>
          Total
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// Page 8 — Completed Elections + Cost Per Vote
// ===========================================================================
function CompletedPage({ filteredRows, filters }) {
  // Subset of advertisers whose election has already passed
  const completed = useMemoPC(() =>
    filteredRows.filter((r) => r.windowStatus === "Completed" || r.daysToElection < 0)
                .sort((a, b) => b.total - a.total),
    [filteredRows]
  );

  const withResults = useMemoPC(() => completed.filter((r) => r.hasElectionResult), [completed]);
  const winners     = useMemoPC(() => withResults.filter((r) => r.electionResult && r.electionResult.won), [withResults]);
  const losers      = useMemoPC(() => withResults.filter((r) => r.electionResult && !r.electionResult.won), [withResults]);

  // Average vote share across matched results
  const avgVoteShare = useMemoPC(() => {
    const withShare = withResults.filter((r) => r.electionResult && r.electionResult.voteShare != null);
    if (!withShare.length) return null;
    return withShare.reduce((a, r) => a + r.electionResult.voteShare, 0) / withShare.length;
  }, [withResults]);

  const resultsStatus = Fpc.ELECTION_RESULTS_STATUS || "idle";
  const vizAccent = withResults.length > 0
    ? { bg: "#E0F4EA", fg: "#06633B", text: `${withResults.length} results loaded` }
    : { bg: "#FFF3D6", fg: "#8A6500", text: resultsStatus === "loading" ? "Loading…" : "Awaiting results" };

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Completed Elections + Cost Per Vote</div>
          <div className="subtitle">
            CivicAPI is the dashboard's certified results source for vote totals, vote share, and win/loss flags. Won candidates stay active for future windows; lost candidates are flagged for case study archival.
          </div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <KPI title="Completed Races" value={completed.length.toString()}
             desc="Races in scope whose election day has passed." accent="blue" />
        <KPI title="Results Loaded" value={`${withResults.length} of ${completed.length}`}
             desc="Rows matched to CivicAPI certified results. Refreshes automatically on page load."
             accent={withResults.length === completed.length ? "green" : withResults.length > 0 ? "orange" : null} />
        <KPI title="Winners" value={winners.length.toString()}
             desc="Candidates who won their primary or general election. Future general-election window ahead for primary winners."
             accent="green" />
        <KPI title="Did Not Advance" value={losers.length.toString()}
             desc="Candidates who lost their primary or general election. Removed from cable prospects; eligible for case study archival."
             accent="red" />
        <KPI title="Avg Vote Share"
             value={avgVoteShare != null ? (avgVoteShare * 100).toFixed(1) + "%" : "—"}
             desc="Average vote share across candidates with CivicAPI results." />
      </div>

      <Viz
        title="Election Results · 2026"
        desc="One row per completed race. CivicAPI vote totals are matched by candidate name and state, then used for result status and cost-per-vote triage."
        accent={vizAccent}
        style={{ flex: 1, minHeight: 0 }}
      >
        <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
          <table className="tbl">
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Advertiser · Race</th>
                <th>Party</th>
                <th>State / Office</th>
                <th>Election Date</th>
                <th className="num">Ad Spend</th>
                <th>Election Type</th>
                <th className="num">Vote %</th>
                <th className="num">$ / Vote</th>
                <th>Result</th>
                <th>Next Step</th>
              </tr>
            </thead>
            <tbody>
              {completed.length === 0 ? (
                <tr><td colSpan="10" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No completed races in the current filter set.</td></tr>
              ) : completed.map((r) => {
                const anchor = new Date("2026-05-13");
                const electionDate = new Date(anchor);
                electionDate.setDate(anchor.getDate() + r.daysToElection);
                const res = r.electionResult;
                const voteSharePct = res && res.voteShare != null ? (res.voteShare * 100).toFixed(1) + "%" : "—";
                const dollarPerVote = res && res.votes > 0
                  ? "$" + (r.total / res.votes).toLocaleString("en-US", { maximumFractionDigits: 2 })
                  : "—";
                return (
                  <tr key={r.advertiserKey}>
                    <td className="adv-name">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 4, height: 14, borderRadius: 2, background: window.RACE_COLORS[r.raceLevel] }}></span>
                        <span>{r.advertiser}</span>
                      </div>
                    </td>
                    <td>{r.party}</td>
                    <td>{r.state} · {r.office}</td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 10.5 }}>
                      {res && res.electionDate
                        ? new Date(res.electionDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : electionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="num">{Fpc.fmtMoneyTight(r.total)}</td>
                    <td>
                      {res
                        ? <span className="chip chip-gray" style={{ textTransform: "capitalize" }}>{res.electionType}</span>
                        : <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>}
                    </td>
                    <td className="num" style={{ color: res ? "var(--text-primary)" : "var(--text-muted)" }}>{voteSharePct}</td>
                    <td style={{ color: "var(--text-muted)" }}>{dollarPerVote}</td>
                    <td>
                      {res
                        ? <span className={`chip ${res.won ? "chip-green" : "chip-red"}`}>{res.won ? "Won" : "Lost"}</span>
                        : <span className="chip chip-yellow">{resultsStatus === "loading" ? "Loading…" : "Pending"}</span>}
                      {res && res.votes > 0 && (
                        <div style={{ marginTop: 3, color: "var(--text-muted)", fontSize: 9.5, fontVariantNumeric: "tabular-nums" }}>
                          {res.votes.toLocaleString()} votes
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 10 }}>
                      {r.primaryWon  && <span style={{ color: "var(--green)", fontWeight: 600 }}>General window ↗</span>}
                      {r.primaryLost && <span style={{ color: "var(--red)" }}>Archive case study</span>}
                      {r.generalWon  && <span style={{ color: "var(--green)", fontWeight: 600 }}>Cycle winner ✓</span>}
                      {r.generalLost && <span style={{ color: "var(--text-muted)" }}>Cycle complete</span>}
                      {!r.hasElectionResult && <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Viz>

      <NotesBox
        accent="blue"
        title="How election results are matched"
        desc="CivicAPI is queried at page load through the dashboard proxy/direct endpoint and treated as the certified results source for this workflow. Candidates are matched to advertisers by fuzzy name and office similarity. Primary winners remain in the Cable Prospect Finder with a 'General window ↗' flag. Primary losers are removed from prospects and flagged for case study archival. $/vote is calculated from spend divided by CivicAPI vote count when votes are available."
      />
    </div>
  );
}

Object.assign(window, { PacPage, CompletedPage });
