/* global XLSX, window */
// Multi-file ETL — accepts any combination of CSV / xlsx source files,
// fingerprints each by its column headers (and sheet names for xlsx), routes
// to the matching aggregator, and produces the bundle the dashboard reads.
//
// Supported file types (auto-detected):
//   • curated_pbi               — the WS_FactSpendCurrent xlsx
//   • vivvix_home_advertiser    — Vivvix granular spend feed
//   • cross_tab_digital         — Digital spend cross-tab (Addressable)
//   • cash_on_hand_dev          — Per-advertiser FEC cash on hand
//   • fec_candidate_summary     — FEC candidate financial summary
//   • fec_committee_summary     — FEC committee financial summary
//   • fec_independent_expenditure — FEC IE bulk file
//   • fec_electioneering_comm   — FEC electioneering communications
//   • fec_communication_costs   — FEC communication costs (F76)
//   • fec_leadership            — Leadership PAC roster
//   • lobbyist                  — Lobbyist disclosure flags
//
// Public surface (window.pbETL):
//   detectFile(file)  →  Promise<{ type, label, rowCount, sample, sheet, wb }>
//   buildBundle({ files, onProgress }) → Promise<{ bundle, perFile, stats }>

(function () {
  // ====================================================================
  //   Type fingerprints
  // ====================================================================
  // Each fingerprint either matches by sheet name (for known xlsx exports)
  // or by a set of required column headers. `oneOf` matches if any of the
  // alternative headers is present (e.g. casing variants).
  const FINGERPRINTS = [
    {
      type: "curated_pbi", label: "Curated PBI snapshot",
      sheets: ["WS_FactSpendCurrent"],
    },
    {
      type: "cross_tab_digital", label: "Cross tab — Digital",
      required: ["Advertiser", "Election State", "ATV_MEDIA_TYPE", "Gross Spending/Share"],
    },
    {
      type: "cash_on_hand_dev", label: "DEV — Cash on Hand",
      required: ["Fec Id", "Advertiser", "Cash on Hand"],
    },
    {
      type: "vivvix_home_advertiser", label: "Vivvix — Home Advertiser spend",
      required: ["Market or State", "DMA", "Advertiser", "Amount"],
    },
    {
      type: "vivvix_home_advertiser", label: "Vivvix — Home Advertiser spend",
      required: ["Election State", "DMA", "Advertiser", "Amount"],
    },
    {
      type: "fec_candidate_summary", label: "FEC — Candidate Summary",
      required: ["Cand_Name", "Cand_Id", "Cash_On_Hand_COP"],
    },
    {
      type: "fec_committee_summary", label: "FEC — Committee Summary",
      required: ["CMTE_ID", "CMTE_NM", "COH_COP"],
    },
    {
      type: "fec_independent_expenditure", label: "FEC — Independent Expenditures",
      required: ["cand_name", "spe_nam", "exp_amo", "sup_opp"],
    },
    {
      type: "fec_electioneering_comm", label: "FEC — Electioneering Comm",
      required: ["COMMITTEE_NAME", "REPORTED_DISBURSEMENT_AMOUNT", "PAYEE_NAME"],
    },
    {
      type: "fec_communication_costs", label: "FEC — Communication Costs",
      required: ["CMTE_NM", "TRANSACTION_AMT", "COMMUNICATION_TP"],
    },
    {
      type: "fec_leadership", label: "FEC — Leadership PACs",
      required: ["Committee_Id", "Sponsor_Name", "Cash_on_Hand"],
    },
    {
      type: "lobbyist", label: "FEC — Lobbyist disclosures",
      required: ["Committee_Name", "Is_Lobbyist"],
    },
  ];

  function detectFromWorkbook(wb) {
    const sheetNames = wb.SheetNames || [];
    // First: sheet-name match (curated PBI)
    for (const fp of FINGERPRINTS) {
      if (!fp.sheets) continue;
      if (fp.sheets.every((s) => sheetNames.includes(s))) {
        return { fp, sheet: fp.sheets[0] };
      }
    }
    // Else: header match on the first sheet
    const firstSheet = sheetNames[0];
    if (!firstSheet) return null;
    const headers = readHeaders(wb.Sheets[firstSheet]);
    const lowered = new Set(headers.map((h) => String(h).toLowerCase()));
    for (const fp of FINGERPRINTS) {
      if (!fp.required) continue;
      const ok = fp.required.every((h) => lowered.has(String(h).toLowerCase()));
      if (ok) return { fp, sheet: firstSheet, headers };
    }
    return { fp: { type: "unknown", label: "Unknown file" }, sheet: firstSheet, headers };
  }

  function readHeaders(sheet) {
    if (!sheet) return [];
    const ref = sheet["!ref"];
    if (!ref) return [];
    const range = XLSX.utils.decode_range(ref);
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
      headers.push(cell ? String(cell.v).trim() : "");
    }
    return headers;
  }

  async function readWorkbook(file) {
    const buf = await file.arrayBuffer();
    return XLSX.read(buf, { type: "array", raw: false });
  }

  async function detectFile(file) {
    const wb = await readWorkbook(file);
    const det = detectFromWorkbook(wb) || { fp: { type: "unknown", label: "Unknown file" }, sheet: null };
    const sheet = det.sheet ? wb.Sheets[det.sheet] : null;
    let rowCount = 0;
    if (sheet && sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      rowCount = Math.max(0, range.e.r - range.s.r); // minus header
    }
    return {
      file, wb, sheet,
      type: det.fp.type,
      label: det.fp.label,
      sheetName: det.sheet,
      rowCount,
    };
  }

  // ====================================================================
  //   Name normalization (mirrors build_dashboard_data.py)
  // ====================================================================
  const NAME_STRIP_PREFIXES = [
    "the ", "friends of ", "committee to elect ", "citizens to elect ",
    "citizens for ", "committee for ", "people for ",
  ];
  const NAME_STRIP_SUFFIXES = [
    " inc", " llc", " the", " committee", " campaign",
    " for congress", " for us congress", " for u s congress",
    " for senate", " for us senate", " for u s senate",
    " for governor", " for governor of", " for lt governor",
    " for attorney general", " for secretary of state",
    " for state senate", " for state assembly", " for state house",
    " for mayor", " for re election", " for reelection",
    " victory fund", " super pac", " pac", " political action committee",
    " campaign committee", " principal campaign committee",
  ];
  function normName(s) {
    if (!s) return "";
    let v = String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of NAME_STRIP_PREFIXES) if (v.startsWith(p)) { v = v.slice(p.length); changed = true; }
      for (const s of NAME_STRIP_SUFFIXES) if (v.endsWith(s))   { v = v.slice(0, -s.length); changed = true; }
      v = v.trim();
    }
    return v;
  }

  function flipFECName(s) {
    // "SMITH, JOHN" → "John Smith"; titlecase. FEC files store CAND_NAME as
    // LAST, FIRST [MR./SEN.] — we flip to a friendlier display form.
    if (!s) return "";
    const trimmed = String(s).trim();
    const parts = trimmed.split(",");
    if (parts.length === 2) {
      const last = parts[0].trim();
      const first = parts[1].trim();
      return titleCase(first + " " + last);
    }
    return titleCase(trimmed);
  }
  function titleCase(s) {
    return String(s).toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
  }

  function round(v) { return Math.round((v || 0) * 100) / 100; }
  const sheetToRows = (sheet) => XLSX.utils.sheet_to_json(sheet, { defval: "" });

  // ====================================================================
  //   Aggregators
  // ====================================================================

  // ---- Curated PBI spend (WS_FactSpendCurrent) -----------------------
  function aggregateCurated(wb, log) {
    const sheet = wb.Sheets["WS_FactSpendCurrent"];
    const rows = sheetToRows(sheet);
    log(`Curated PBI: ${rows.length.toLocaleString()} spend rows`);
    const agg = new Map();
    rows.forEach((r) => {
      const adv = r.Advertiser; if (!adv) return;
      const k = `${adv}|${r.State || ""}|${r.DMA || ""}|${r.Office || ""}`;
      let a = agg.get(k);
      if (!a) {
        a = blankAggRow();
        a.advertiser = adv; a.advertiserType = r.AdvertiserType || "";
        a.agency = r.Agency || ""; a.state = r.State || "";
        a.dma = r.DMA || ""; a.office = r.Office || "";
        a.election = r.Election || ""; a.raceLevel = r.RaceLevel || "";
        a.party = r.Party || "";
        agg.set(k, a);
      }
      addMedia(a, r.MediaType, +r.Amount || 0);
      if (truthy(r.InPoliticalWindowMarket)) a.inWindow = true;
    });
    return finalizeAgg(agg);
  }

  // ---- Vivvix Home_Advertiser (granular spend) -----------------------
  function aggregateVivvix(wb, sheet, log) {
    const rows = sheetToRows(sheet);
    log(`Vivvix Home Advertiser: ${rows.length.toLocaleString()} spend rows`);
    const agg = new Map();
    rows.forEach((r) => {
      const adv = r.Advertiser; if (!adv) return;
      const state = r["Market or State"] || r["Election State"] || r.State || "";
      const dma = r.DMA || "";
      const office = r.Office || "";
      const mt = pickMediaType(r);
      const amt = +r.Amount || +r["Gross Spending"] || 0;
      if (!amt) return;
      const k = `${adv}|${state}|${dma}|${office}`;
      let a = agg.get(k);
      if (!a) {
        a = blankAggRow();
        a.advertiser = adv;
        a.advertiserType = r["Advertiser Type"] || "";
        a.agency = r.Agencies || r.Agency || "";
        a.state = state; a.dma = dma; a.office = office;
        a.election = r.Election || "";
        a.raceLevel = r["Office Type"] || r.RaceLevel || r["Race Level"] || "";
        a.party = r["Team Party"] || r.Party || "";
        agg.set(k, a);
      }
      addMedia(a, mt, amt);
    });
    return finalizeAgg(agg);
  }

  function pickMediaType(r) {
    const candidates = [
      r["ATV_MEDIA_TYPE (copy 2)"],
      r.ATV_MEDIA_TYPE,
      r.MediaType,
      r["Media Type"],
      r.Station,
    ];
    for (const value of candidates) {
      const text = String(value || "").trim();
      if (/^(broadcast|cable|ctv|digital|radio)$/i.test(text)) return text;
    }
    return String(candidates.find((v) => v != null && String(v).trim()) || "").trim();
  }

  function blankAggRow() {
    return {
      advertiser: "", advertiserType: "", agency: "",
      state: "", dma: "", office: "", election: "", raceLevel: "", party: "",
      broadcast: 0, cable: 0, ctv: 0, digital: 0, radio: 0, inWindow: false,
    };
  }
  function addMedia(a, mt, amt) {
    const m = String(mt || "").toLowerCase();
    if (m === "broadcast") a.broadcast += amt;
    else if (m === "cable")   a.cable   += amt;
    else if (m === "ctv")     a.ctv     += amt;
    else if (m === "digital") a.digital += amt;
    else if (m === "radio")   a.radio   += amt;
  }
  function truthy(v) {
    return v === 1 || v === true || v === "1" || /^(true|yes|y)$/i.test(String(v || ""));
  }
  function finalizeAgg(agg) {
    const out = [];
    let i = 1;
    for (const a of agg.values()) {
      const tv = a.broadcast + a.cable + a.ctv;
      const total = tv + a.digital + a.radio;
      if (total <= 0) continue;
      out.push({
        advertiserKey: i++, advertiser: a.advertiser, advertiserType: a.advertiserType,
        agency: a.agency || "Direct (No Agency)",
        state: a.state || "Unknown", dma: a.dma || "Unknown", office: a.office || "Unknown",
        raceLevel: a.raceLevel || "State Legislature", party: a.party || "Issue",
        broadcast: round(a.broadcast), cable: round(a.cable), ctv: round(a.ctv),
        digital: round(a.digital), radio: round(a.radio), total: round(total),
        tvSpend: round(tv), bcCtvSpend: round(a.broadcast + a.ctv),
        cableShare: tv > 0 ? a.cable / tv : 0,
        windowStatus: "Future", daysToElection: 174,
        inWindow: a.inWindow,
        cashOnHand: null, cycleSpend: null, fecId: null,
      });
    }
    return out;
  }

  // ---- Cross tab digital → Addressable rows --------------------------
  function aggregateDigital(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`Cross tab: ${rows.length.toLocaleString()} rows`);
    const by = new Map();
    rows.forEach((r) => {
      const mt = String(r.ATV_MEDIA_TYPE || "").toLowerCase();
      if (mt !== "digital") return;
      const adv = r.Advertiser; if (!adv) return;
      const amt = +r["Gross Spending/Share"] || 0;
      const st = r["Election State"] || "";
      const k = normName(adv);
      let d = by.get(k);
      if (!d) { d = { amount: 0, advertiser: adv, stateCounts: new Map() }; by.set(k, d); }
      d.amount += amt;
      if (st) d.stateCounts.set(st, (d.stateCounts.get(st) || 0) + 1);
    });
    by.forEach((d) => {
      let best = null, n = -1;
      d.stateCounts.forEach((v, k) => { if (v > n) { best = k; n = v; } });
      d.state = best || "Unknown";
      delete d.stateCounts;
    });
    log(`Digital: ${by.size.toLocaleString()} advertisers, $${fmtNum(sum(by, "amount"))}`);
    return by;
  }

  // ---- Cash on Hand (DEV) -------------------------------------------
  function aggregateCohDev(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`DEV Cash on Hand: ${rows.length.toLocaleString()} rows`);
    const by = new Map();
    rows.forEach((r) => {
      const adv = r.Advertiser; if (!adv) return;
      const k = normName(adv);
      if (by.has(k)) return;
      const coh = (+r.Blank || 0) || Math.abs(+r["Cash on Hand"] || 0);
      by.set(k, {
        cashOnHand: coh || null,
        cycleSpend: +r["Sorting AA"] || null,
        fecId: r["Fec Id"] ? String(r["Fec Id"]) : null,
      });
    });
    log(`Cash on Hand: ${by.size.toLocaleString()} advertisers`);
    return by;
  }

  // ---- FEC Candidate Summary → COH fallback -------------------------
  function aggregateCandidateSummary(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Candidate Summary: ${rows.length.toLocaleString()} rows`);
    const by = new Map();
    rows.forEach((r) => {
      const nm = r.Cand_Name; if (!nm) return;
      const display = flipFECName(nm);
      const k = normName(display);
      if (by.has(k)) return;
      by.set(k, {
        cashOnHand: +r.Cash_On_Hand_COP || null,
        cycleSpend: +r.Total_Disbursement || null,
        fecId: r.Cand_Id ? String(r.Cand_Id) : null,
      });
    });
    return by;
  }

  // ---- FEC Committee Summary → COH by committee name ---------------
  function aggregateCommitteeSummary(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Committee Summary: ${rows.length.toLocaleString()} rows`);
    const by = new Map();
    rows.forEach((r) => {
      const nm = r.CMTE_NM; if (!nm) return;
      const k = normName(nm);
      if (by.has(k)) return;
      by.set(k, {
        cashOnHand: +r.COH_COP || null,
        cycleSpend: +r.TTL_DISB || null,
        fecId: r.CMTE_ID ? String(r.CMTE_ID) : null,
      });
    });
    return by;
  }

  // ---- FEC Independent Expenditures → PAC rows ----------------------
  function aggregateIE(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Independent Expenditures: ${rows.length.toLocaleString()} rows`);
    return rows.map((r) => {
      const cand = flipFECName(r.cand_name || "");
      const cmte = (r.spe_nam || "").trim();
      const amt = +r.exp_amo || 0;
      const so = String(r.sup_opp || "").toUpperCase();
      return {
        committee: cmte,
        alignment: (r.cand_pty_aff || "").startsWith("D") ? "DEM"
          : (r.cand_pty_aff || "").startsWith("R") ? "REP" : "IND",
        focus: r.can_office === "S" ? "Federal Senate"
            : r.can_office === "H" ? "Federal House"
            : r.can_office === "P" ? "President" : "Other",
        target: cand, targetState: r.can_office_state || "",
        targetParty: r.cand_pty_aff || "",
        support: so === "S" ? amt : 0,
        oppose:  so === "O" ? amt : 0,
        total:   amt,
        payee:   r.pay || "",
        weekEnding: r.exp_date || "",
        source: "FEC_IE",
      };
    }).filter((r) => r.total > 0);
  }

  // ---- FEC Electioneering Communications → PAC rows -----------------
  function aggregateElectioneering(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Electioneering Comm: ${rows.length.toLocaleString()} rows`);
    return rows.map((r) => {
      const cand = flipFECName(r.CANDIDATE_NAME || "");
      const cmte = (r.COMMITTEE_NAME || "").trim();
      const amt = +r.REPORTED_DISBURSEMENT_AMOUNT || +r.CALCULATED_CANDIDATE_SHARE || 0;
      return {
        committee: cmte, alignment: "IND", focus: "Other",
        target: cand, targetState: r.CANDIDATE_STATE || "",
        targetParty: "",
        support: 0, oppose: 0, total: amt,
        payee: r.PAYEE_NAME || "",
        weekEnding: r.DISBURSEMENT_DATE || "",
        source: "FEC_ELECTIONEERING",
      };
    }).filter((r) => r.total > 0);
  }

  // ---- FEC Communication Costs → PAC rows ---------------------------
  function aggregateCommCosts(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Communication Costs: ${rows.length.toLocaleString()} rows`);
    return rows.map((r) => {
      const cand = flipFECName(r.CAND_NAME || "");
      const cmte = (r.CMTE_NM || "").trim();
      const amt = +r.TRANSACTION_AMT || 0;
      const so = String(r.SUPPORT_OPPOSE_IND || "").toUpperCase();
      return {
        committee: cmte,
        alignment: (r.CAND_PTY_AFFILIATION || "").startsWith("D") ? "DEM"
          : (r.CAND_PTY_AFFILIATION || "").startsWith("R") ? "REP" : "IND",
        focus: r.CAND_OFFICE === "S" ? "Federal Senate"
            : r.CAND_OFFICE === "H" ? "Federal House"
            : r.CAND_OFFICE === "P" ? "President" : "Other",
        target: cand, targetState: r.CAND_STATE || "",
        targetParty: r.CAND_PTY_AFFILIATION || "",
        support: so === "S" ? amt : 0,
        oppose:  so === "O" ? amt : 0,
        total:   amt,
        payee:   "",
        weekEnding: formatYYYYMMDD(r.TRANSACTION_DT),
        source: "FEC_COMM_COSTS",
      };
    }).filter((r) => r.total > 0);
  }
  function formatYYYYMMDD(v) {
    const s = String(v || "");
    if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    return s;
  }

  // ---- FEC Leadership PAC roster ------------------------------------
  function aggregateLeadership(sheet, log) {
    const rows = sheetToRows(sheet);
    log(`FEC Leadership PACs: ${rows.length.toLocaleString()} rows`);
    return rows.map((r) => ({
      committee: r.Committee_Name,
      committeeId: r.Committee_Id,
      sponsor: r.Sponsor_Name,
      cashOnHand: +r.Cash_on_Hand || 0,
      totalReceipts: +r.Total_Receipt || 0,
      totalDisbursements: +r.Total_Disbursement || 0,
      coverageEnd: r.Coverage_End_Date,
    })).filter((r) => r.committee);
  }

  // ====================================================================
  //   Merge
  // ====================================================================
  function mergeBundle({ spineRows, digitalBy, cohBys, pacRows, leadership, log }) {
    // Combine multiple COH maps (DEV + candidate summary + committee summary).
    // First definition wins; later sources fill gaps.
    const coh = new Map();
    for (const c of cohBys) {
      if (!c) continue;
      c.forEach((info, k) => { if (!coh.has(k)) coh.set(k, info); });
    }

    // Build adv index
    const byAdv = new Map();
    spineRows.forEach((r) => {
      const k = normName(r.advertiser);
      if (!byAdv.has(k)) byAdv.set(k, []);
      byAdv.get(k).push(r);
    });

    // Digital → Addressable rows
    let dMatched = 0, dUnmatched = 0, dMTotal = 0, dUTotal = 0;
    if (digitalBy) digitalBy.forEach((d, k) => {
      if (d.amount <= 0) return;
      const arr = byAdv.get(k);
      if (arr) {
        arr.sort((a, b) => b.total - a.total);
        const t = arr[0];
        spineRows.push({
          advertiser: t.advertiser, advertiserType: t.advertiserType,
          agency: t.agency, state: t.state, dma: "Addressable", office: "Digital",
          raceLevel: t.raceLevel, party: t.party,
          broadcast: 0, cable: 0, ctv: 0, digital: round(d.amount), radio: 0,
          total: round(d.amount), tvSpend: 0, bcCtvSpend: 0, cableShare: 0,
          windowStatus: t.windowStatus, daysToElection: t.daysToElection, inWindow: t.inWindow,
          cashOnHand: null, cycleSpend: null, fecId: null,
        });
        dMatched++; dMTotal += d.amount;
      } else {
        spineRows.push({
          advertiser: d.advertiser, advertiserType: "Unknown", agency: "Direct (No Agency)",
          state: d.state, dma: "Addressable", office: "Digital",
          raceLevel: "State Legislature", party: "Issue",
          broadcast: 0, cable: 0, ctv: 0, digital: round(d.amount), radio: 0,
          total: round(d.amount), tvSpend: 0, bcCtvSpend: 0, cableShare: 0,
          windowStatus: "Future", daysToElection: 174, inWindow: false,
          cashOnHand: null, cycleSpend: null, fecId: null,
        });
        dUnmatched++; dUTotal += d.amount;
      }
    });

    // Rebuild index with new Addressable rows, then attach COH
    const byAdv2 = new Map();
    spineRows.forEach((r) => {
      const k = normName(r.advertiser);
      if (!byAdv2.has(k)) byAdv2.set(k, []);
      byAdv2.get(k).push(r);
    });
    let cohMatched = 0;
    coh.forEach((info, k) => {
      const arr = byAdv2.get(k);
      if (!arr) return;
      arr.forEach((r) => {
        if (r.cashOnHand == null) r.cashOnHand = info.cashOnHand;
        if (r.cycleSpend == null) r.cycleSpend = info.cycleSpend;
        if (!r.fecId)             r.fecId      = info.fecId;
      });
      cohMatched++;
    });

    log(`Merged: digital ${dMatched}/${dMatched + dUnmatched} matched, ${dUnmatched} new — $${fmtNum(dMTotal + dUTotal)} total`);
    log(`Cash-on-hand: ${cohMatched.toLocaleString()} of ${coh.size.toLocaleString()} advertisers attached`);
    log(`PAC outside-spend rows: ${pacRows.length.toLocaleString()}`);

    spineRows.sort((a, b) => b.total - a.total);
    spineRows.forEach((r, i) => { r.advertiserKey = i + 1; });

    return {
      stats: {
        digitalMatched: dMatched, digitalUnmatched: dUnmatched,
        digitalMatchedTotal: dMTotal, digitalUnmatchedTotal: dUTotal,
        cohMatched, cohTotal: coh.size,
        pacRows: pacRows.length, leadershipPacs: leadership.length,
      },
    };
  }

  // ====================================================================
  //   Public API
  // ====================================================================
  async function buildBundle({ files, onProgress }) {
    if (!files || !files.length) throw new Error("No files provided.");
    if (typeof XLSX === "undefined") throw new Error("SheetJS not loaded.");
    const log = onProgress || (() => {});

    // Detect everything first
    const detected = [];
    for (const f of files) {
      log(`▸ ${f.name}…`);
      const d = await detectFile(f);
      detected.push(d);
      log(`  → ${d.label} (${d.rowCount.toLocaleString()} data rows)`);
    }

    // Process by type
    let spineRows = [];
    let digitalBy = null;
    const cohBys = [];
    let pacRows = [];
    let leadership = [];

    for (const d of detected) {
      try {
        switch (d.type) {
          case "curated_pbi":
            spineRows = spineRows.concat(aggregateCurated(d.wb, log));
            break;
          case "vivvix_home_advertiser":
            spineRows = spineRows.concat(aggregateVivvix(d.wb, d.sheet, log));
            break;
          case "cross_tab_digital":
            digitalBy = aggregateDigital(d.sheet, log);
            break;
          case "cash_on_hand_dev":
            cohBys.push(aggregateCohDev(d.sheet, log));
            break;
          case "fec_candidate_summary":
            cohBys.push(aggregateCandidateSummary(d.sheet, log));
            break;
          case "fec_committee_summary":
            cohBys.push(aggregateCommitteeSummary(d.sheet, log));
            break;
          case "fec_independent_expenditure":
            pacRows = pacRows.concat(aggregateIE(d.sheet, log));
            break;
          case "fec_electioneering_comm":
            pacRows = pacRows.concat(aggregateElectioneering(d.sheet, log));
            break;
          case "fec_communication_costs":
            pacRows = pacRows.concat(aggregateCommCosts(d.sheet, log));
            break;
          case "fec_leadership":
            leadership = leadership.concat(aggregateLeadership(d.sheet, log));
            break;
          case "lobbyist": {
            const rows = sheetToRows(d.sheet);
            log(`Lobbyist disclosures: ${rows.length.toLocaleString()} rows (informational only)`);
            break;
          }
          default:
            log(`  ⚠ Unknown file type for ${d.file.name}; skipped.`);
        }
      } catch (e) {
        log(`  ⚠ ${d.file.name} aggregation failed: ${e.message}`);
        console.error(e);
      }
    }

    if (!spineRows.length) {
      throw new Error("No advertiser-level spend rows found. Drop in a Curated PBI or Vivvix Home_Advertiser file as the spine.");
    }

    const { stats } = mergeBundle({ spineRows, digitalBy, cohBys, pacRows, leadership, log });

    // Snapshot date heuristics: most recent IE date or today
    const snapshotDate = pickSnapshotDate(detected) || new Date().toISOString().slice(0, 10);

    const bundle = {
      snapshotDate,
      politicalWindowsLoaded: 0,
      unmatchedAdvertiserCount: 0,
      totalAdvertiserKeys: spineRows.length,
      rowsIncluded: spineRows.length,
      advertisers: spineRows,
      pacRows,           // real PAC/IE data when present (overrides synthesized)
      leadershipPacs: leadership,
    };
    log(`✓ Bundle: ${spineRows.length.toLocaleString()} advertiser rows, ${pacRows.length.toLocaleString()} PAC rows, ${leadership.length.toLocaleString()} leadership PACs`);
    return { bundle, perFile: detected.map((d) => ({ name: d.file.name, type: d.type, label: d.label, rowCount: d.rowCount })), stats };
  }

  function pickSnapshotDate(detected) {
    // Look for a curated PBI DimSnapshot row first
    for (const d of detected) {
      if (d.type !== "curated_pbi") continue;
      const snap = d.wb.Sheets["WS_DimSnapshot"];
      if (!snap) continue;
      const r = sheetToRows(snap);
      if (r.length && r[0].SnapshotDate) return String(r[0].SnapshotDate);
    }
    return null;
  }

  function sum(map, key) {
    let s = 0;
    map.forEach((v) => { s += (v[key] || 0); });
    return s;
  }
  function fmtNum(v) { return Math.round(v || 0).toLocaleString(); }

  window.pbETL = { buildBundle, detectFile, normName };
})();
