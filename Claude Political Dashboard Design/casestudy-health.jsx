/* global React */
// Page 9 — Case Study Finder
// Page 10 — Data Health + Mapping Review

const { useState: useStateCH, useMemo: useMemoCH } = React;
const Fch = window.pbData;

// ===========================================================================
// Page 9 — Case Study Finder
// ===========================================================================
function CaseStudyPage({ filteredRows, filters }) {
  const [statusFilter, setStatusFilter] = useStateCH("All");
  const [scoreFloor, setScoreFloor] = useStateCH(40);

  const cases = useMemoCH(() => {
    // Merge in the runtime-computed measures (cableOpportunity etc.) from
    // filteredRows — Fch.CASE_STUDIES carries narrative metadata, but
    // opportunity-style numbers only exist on the live filtered rows.
    const advByKey = new Map(filteredRows.map((r) => [r.advertiserKey, r]));
    return Fch.CASE_STUDIES
      .filter((c) => advByKey.has(c.advertiserKey))
      .map((c) => ({ ...advByKey.get(c.advertiserKey), ...c }))
      // Case Study Library: only advertisers with a 2026 election result loaded
      // (primary or general, won or lost). Races with no result yet are excluded
      // since there is no outcome to build a proof point around.
      .filter((c) => c.hasElectionResult)
      .filter((c) => (statusFilter === "All" ? true : c.status === statusFilter))
      .filter((c) => c.caseStudyScore >= scoreFloor)
      .sort((a, b) => b.caseStudyScore - a.caseStudyScore);
  }, [filteredRows, statusFilter, scoreFloor]);

  // Status breakdown counts — only over advertisers with election results loaded
  const statusCounts = useMemoCH(() => {
    const advByKey = new Map(filteredRows.map((r) => [r.advertiserKey, r]));
    const m = new Map();
    Fch.CASE_STUDIES
      .filter((c) => advByKey.has(c.advertiserKey) && advByKey.get(c.advertiserKey).hasElectionResult)
      .forEach((c) => { m.set(c.status, (m.get(c.status) || 0) + 1); });
    return Fch.CASE_STUDY_STATUS.map((s) => ({ status: s, count: m.get(s) || 0 }));
  }, [filteredRows]);

  const statusChipClass = (s) => ({
    "Drafting":          "chip-gray",
    "Approved For Sales":"chip-green",
    "Live":              "chip-blue",
    "Pending Approval":  "chip-yellow",
    "Archived":          "chip-mutedgray",
  })[s] || "chip-gray";

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Case Study Library</div>
          <div className="subtitle">Advertisers with CivicAPI certified primary or general results. Ranked by Case Study Score — outcomes help identify complete proof points.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {statusCounts.map((s) => (
          <KPI key={s.status} title={s.status} value={s.count.toString()}
               desc={`Advertisers currently flagged as "${s.status}".`}
               accent={s.status === "Approved For Sales" ? "green" : s.status === "Live" ? "blue" : s.status === "Pending Approval" ? "orange" : null} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* Controls + status legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <div className="slider-card">
            <div className="sl-title"><span>Status filter</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {["All", ...Fch.CASE_STUDY_STATUS].map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }}>
                  <input type="radio" name="cs-status" checked={statusFilter === s} onChange={() => setStatusFilter(s)} />
                  {s === "All" ? <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>All statuses</span> :
                                 <span className={`chip ${statusChipClass(s)}`}>{s}</span>}
                </label>
              ))}
            </div>
          </div>

          <SliderCard
            title="Minimum Case Study Score"
            desc="Composite of cable opportunity size, sub-target cable share, total scale, and timing within window."
            value={scoreFloor} min={0} max={100} step={1}
            formatValue={(v) => v + " pts"}
            prominent
            onChange={setScoreFloor}
          />

          <Viz title="What makes a strong case study?" desc="Components of the Case Study Score." style={{ minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 2 }}>
              <ScoreRow label="Cable opportunity size" weight="40 pts" detail="Capped at $800K opportunity." />
              <ScoreRow label="Sub-target cable share" weight="30 pts" detail="Closer to 0% cable = stronger story." />
              <ScoreRow label="Total spend scale"      weight="20 pts" detail="Capped at $5M total." />
              <ScoreRow label="Inside political window" weight="10 pts" detail="In Window = 10, Opening Next 30 = 6." />
            </div>
          </Viz>
        </div>

        {/* Ranked case study table */}
        <Viz
          title="Ranked Case Study Candidates"
          desc="Sorted by Case Study Score. Use this list to pick the next proof points to write up."
          accent={{ bg: "#E0F4EA", fg: "#06633B", text: `${cases.length} candidates` }}
          style={{ minHeight: 0 }}
        >
          <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="tbl">
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "17%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Race</th>
                  <th>Election Result</th>
                  <th>Narrative</th>
                  <th className="num">Score ↓</th>
                  <th className="num">Cable Opp</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Deck</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr><td colSpan="9" style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                    {Fch.ELECTION_RESULTS_STATUS === "loading"
                      ? "Loading certified results from CivicAPI…"
                      : Fch.ELECTION_RESULTS_STATUS === "idle"
                        ? "Election results not yet loaded."
                        : "No case study candidates with election results match the current filters."}
                  </td></tr>
                ) : cases.map((c) => (
                  <tr key={c.advertiserKey}>
                    <td className="adv-name" title={c.advertiser}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 4, height: 14, borderRadius: 2, background: window.RACE_COLORS[c.raceLevel] }}></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.advertiser}</span>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{c.raceLevel}</span></td>
                    <td>
                      {c.electionResult && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span className={`chip ${c.electionResult.won ? "chip-green" : "chip-red"}`}>
                              {c.electionResult.won ? "Won" : "Lost"}
                            </span>
                            <span className="chip chip-gray" style={{ textTransform: "capitalize" }}>
                              {c.electionResult.electionType}
                            </span>
                          </div>
                          {c.electionResult.voteShare != null && (
                            <span style={{ fontSize: 9.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                              {(c.electionResult.voteShare * 100).toFixed(1)}% vote share
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: "normal", color: "var(--text-secondary)", fontSize: 10.5, lineHeight: 1.3 }}>{c.narrative}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ScoreBar score={c.caseStudyScore} />
                        <span style={{ fontWeight: 700, color: c.caseStudyScore >= 70 ? "var(--green)" : c.caseStudyScore >= 40 ? "var(--text-primary)" : "var(--text-muted)" }}>{c.caseStudyScore}</span>
                      </div>
                    </td>
                    <td className="num" style={{ color: "var(--orange)", fontWeight: 600 }}>{Fch.fmtMoneyTight(c.cableOpportunity)}</td>
                    <td>
                      <span className={`chip ${statusChipClass(c.status)}`}>{c.status}</span>
                      {c.approvedForSales && <span style={{ marginLeft: 4, fontSize: 11, color: "var(--green)" }} title="Approved for Sales">✓</span>}
                    </td>
                    <td style={{ fontSize: 10.5 }}>{c.owner}</td>
                    <td>
                      <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "var(--blue)", textDecoration: "none", fontSize: 10.5, fontWeight: 600 }}
                         title={c.deckLink}>Open ↗</a>
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

function ScoreRow({ label, weight, detail }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
        <span style={{ color: "var(--blue)", fontWeight: 600 }}>{weight}</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.3 }}>{detail}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--blue)" : "var(--text-muted)";
  return (
    <div style={{ width: 40, height: 8, background: "#F3F4F6", borderRadius: 2, position: "relative", overflow: "hidden" }}>
      <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2 }}></div>
    </div>
  );
}

// ===========================================================================
// Page 10 — Data Health + Mapping Review
// ===========================================================================
function HealthPage({ filteredRows, filters }) {
  const dh = Fch.DATA_HEALTH;

  function fmtCount(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
    return n.toString();
  }

  return (
    <div className="page-content">
      <div className="page-title-block">
        <div>
          <div className="title">Data Health + Mapping Review</div>
          <div className="subtitle">Refresh log, source coverage, advertiser-mapping confidence, and the duplicate-key / missing-field checks the model runs nightly.</div>
        </div>
        <ActiveFilters filters={filters} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
        <KPI title="Snapshot" value={Fch.SNAPSHOT_DATE.replace(", 2026", "")} desc="Latest snapshot loaded." accent="blue" />
        <KPI title="Rows Loaded" value={fmtCount(dh.rowsLoaded)} desc="Total spend rows across all sources." />
        <KPI title="Total Spend" value={Fch.fmtMoney(Fch.advertisers.reduce((a, r) => a + r.total, 0))} desc="Across full advertiser book." />
        <KPI title="Unmatched Adv" value={dh.unmatchedAdvertisers.toString()} desc="Advertiser names that didn't auto-map." accent="red" />
        <KPI title="Low Confidence" value={dh.lowConfidenceMatches.toString()} desc="Auto-mapped rows with confidence < 0.7." accent="orange" />
        <KPI title="Duplicate Keys" value={dh.duplicateKeyCount.toString()} desc="Suspected duplicate advertiser keys." accent={dh.duplicateKeyCount === 0 ? "green" : "orange"} />
        <KPI title="Political Windows" value={dh.politicalWindowsLoaded.toString()} desc="Calendar-matched window records." />
        <KPI title="Outside Spend Rows" value={dh.outsideSpendRows.toString()} desc="FEC IE records joined to candidates." />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8, flex: 1, minHeight: 0 }}>
        {/* LEFT — sources + refresh log */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <Viz title="Source Health" desc="Per-source row counts, last-load timestamp, ownership, and status." style={{ flex: 1, minHeight: 0 }}>
            <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
              <table className="tbl">
                <colgroup>
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Last loaded</th>
                    <th className="num">Rows</th>
                    <th>Owner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dh.sources.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ color: "var(--text-secondary)", fontSize: 10.5 }}>{s.lastLoaded}</td>
                      <td className="num">{fmtCount(s.rows)}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{s.owner}</td>
                      <td>
                        <span className={`chip ${s.status === "Healthy" ? "chip-green" : s.status === "Stale" ? "chip-yellow" : "chip-red"}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Viz>

          <Viz title="Refresh Log" desc="Nightly pipeline steps with row counts, duration, and status." style={{ flex: 1, minHeight: 0 }}>
            <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
              <table className="tbl">
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Step</th>
                    <th className="num">Rows</th>
                    <th>Duration</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dh.refreshLog.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 10.5, color: "var(--text-secondary)" }}>{r.ts}</td>
                      <td>{r.step}</td>
                      <td className="num">{fmtCount(r.rows)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.duration}</td>
                      <td><span className={`chip ${r.status === "OK" ? "chip-green" : "chip-yellow"}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Viz>
        </div>

        {/* RIGHT — mapping review + checks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
          <Viz title="Advertiser Match Review"
               desc="Low-confidence auto-mappings flagged for human review. Action: confirm or remap to suggested target."
               accent={{ bg: "#FFF3D6", fg: "#8A6500", text: `${dh.matchReview.filter((m) => m.needsHuman).length} pending` }}
               style={{ flex: 1, minHeight: 0 }}>
            <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
              <table className="tbl">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Raw Advertiser</th>
                    <th>Candidate hint</th>
                    <th>Suggested mapping</th>
                    <th className="num">Confidence</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dh.matchReview.map((r, i) => (
                    <tr key={i}>
                      <td className="adv-name">{r.advertiser}</td>
                      <td style={{ color: "var(--text-secondary)" }}>{r.candidate}</td>
                      <td>{r.suggested}</td>
                      <td className="num">
                        <span className={`chip ${r.confidence >= 0.7 ? "chip-green" : r.confidence >= 0.5 ? "chip-yellow" : "chip-red"}`}>
                          {(r.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td>
                        {r.needsHuman
                          ? <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "var(--blue)", textDecoration: "none", fontSize: 10.5, fontWeight: 600 }}>Review →</a>
                          : <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>Auto-accepted</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Viz>

          <Viz title="Missing Field Checks"
               desc="Rows that loaded but lack a required field. These reduce model completeness."
               style={{ minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <CheckRow label="Snapshot reconciliation" current={dh.rowsLoaded} expected={dh.rowsLoaded} ok />
              <CheckRow label="Missing DMA"             count={142} total={dh.rowsLoaded} />
              <CheckRow label="Missing Office mapping"  count={88}  total={dh.rowsLoaded} />
              <CheckRow label="Missing Race Level"      count={37}  total={dh.rowsLoaded} ok />
              <CheckRow label="Missing Agency"          count={1_204} total={dh.rowsLoaded} warn />
              <CheckRow label="Negative cable share"    count={0}   total={dh.rowsLoaded} ok />
              <CheckRow label="Snapshot date in future" count={0}   total={dh.rowsLoaded} ok />
            </div>
          </Viz>
        </div>
      </div>
    </div>
  );
}

function CheckRow({ label, count, total, current, expected, ok, warn }) {
  const isMatch = current != null && current === expected;
  const pct = count != null ? (count / total) * 100 : null;
  const status = isMatch ? "OK"
    : count === 0 ? "OK"
    : pct != null && pct > 1 ? "Warn"
    : pct != null && pct > 0 ? "Note"
    : "OK";
  const chipCls = status === "OK" ? "chip-green" : status === "Warn" ? "chip-yellow" : "chip-gray";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px", gap: 6, alignItems: "center", fontSize: 11, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{label}</span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
        {isMatch ? "Match" : count != null ? `${count.toLocaleString()} rows` : "—"}
      </span>
      <span style={{ textAlign: "right" }}>
        <span className={`chip ${chipCls}`}>{status}</span>
      </span>
    </div>
  );
}

Object.assign(window, { CaseStudyPage, HealthPage });
