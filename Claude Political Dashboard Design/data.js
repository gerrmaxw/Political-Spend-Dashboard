/* global window, XLSX */
// Runtime for the Comcast Advertising Political Spend Dashboard.
//
// Data loading paths:
//   1. Admin-applied browser database bundle — written by Admin.html into
//      IndexedDB so large weekly files are not limited by localStorage.
//   2. Default — read pre-built `data.bundle.js` (loaded as a <script>
//      before this file) which exposes `window.__pbBundle`. This file is
//      regenerated weekly by `build_dashboard_data.py` from the curated
//      PowerBI xlsx.
//   3. User upload — when a fresh xlsx is dropped through the header
//      "Upload snapshot" control, SheetJS parses it client-side and we
//      re-aggregate using the exact same logic as the Python ETL.
//
// Both paths produce identical advertiser-row shapes so the React app is
// unchanged regardless of source.

(function () {
  const RACE_LEVELS = [
    "Federal Senate", "Federal House", "Governor", "Statewide Office",
    "State Legislature", "Mayor / Local", "Ballot Measure",
  ];
  const PARTIES = ["DEM", "REP", "IND", "PAC", "Issue"];
  const WINDOW_STATUS = ["In Window", "Opening Next 30", "Future", "Completed"];
  const ENTITY_TYPES = [
    "Candidate",
    "Committee / PAC",
    "Issue / Ballot",
    "Government / Other",
    "Unknown",
  ];
  const UNASSIGNED_AGENCY_LABEL = "Unassigned Agency";

  // ===== Formatters =======================================================
  function fmtMoney(v) {
    const n = Math.abs(v || 0);
    if (n >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return "$" + (v / 1_000).toFixed(1) + "K";
    return "$" + (v || 0).toFixed(0);
  }
  function fmtMoneyTight(v) {
    if (!v) return "$0";
    const n = Math.abs(v);
    if (n >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000)     return "$" + (v / 1_000).toFixed(0) + "K";
    return "$" + v.toFixed(0);
  }
  function fmtPct(v) {
    if (!isFinite(v)) return "—";
    return (v * 100).toFixed(1) + "%";
  }
  function uniqueSorted(arr, key) {
    const s = new Set();
    arr.forEach((r) => { if (r[key]) s.add(r[key]); });
    return Array.from(s).sort((a, b) => String(a).localeCompare(String(b)));
  }

  function normalizeAgency(value) {
    const raw = String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
    if (!raw) return UNASSIGNED_AGENCY_LABEL;
    if (/^(pending|none|null|n\/a|na|unknown|-|--|direct(?: \(no agency\))?|no agency)$/i.test(raw)) {
      return UNASSIGNED_AGENCY_LABEL;
    }
    return raw;
  }

  function isUnassignedAgency(value) {
    return normalizeAgency(value) === UNASSIGNED_AGENCY_LABEL;
  }

  // Political windows are intentionally sourced from the maintained Comcast
  // market calendar workbook, not from CivicAPI. CivicAPI remains a results
  // enrichment source only.
  const DEFAULT_CALENDAR_AS_OF = "2026-05-15";

  function normMarketPart(value) {
    return String(value == null ? "" : value)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  }

  function stateTokens(value) {
    return normMarketPart(value)
      .split(/[\/,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function stateMatches(calendarState, rowState) {
    const cal = stateTokens(calendarState);
    const row = stateTokens(rowState);
    if (!cal.length || !row.length) return false;
    return row.some((token) => cal.includes(token)) || cal.some((token) => row.includes(token));
  }

  function parseDateLoose(value) {
    if (!value && value !== 0) return null;
    if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === "number" && isFinite(value)) {
      // Excel serial date: days since 1899-12-30.
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    const s = String(value).trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function dateToISO(value) {
    const d = parseDateLoose(value);
    if (!d) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function daysBetween(fromValue, toValue) {
    const from = parseDateLoose(fromValue);
    const to = parseDateLoose(toValue);
    if (!from || !to) return null;
    return Math.round((to - from) / 86400000);
  }

  function deriveWindowStatus(windowOpenDate, electionDate, asOfDate) {
    const daysToOpen = daysBetween(asOfDate, windowOpenDate);
    const daysToElection = daysBetween(asOfDate, electionDate);
    if (daysToElection == null) return "Future";
    if (daysToElection < 0) return "Completed";
    if (daysToOpen != null && daysToOpen <= 0) return "In Window";
    if (daysToOpen != null && daysToOpen <= 30) return "Opening Next 30";
    return "Future";
  }

  function electionTypeGroup(value) {
    const text = normMarketPart(value);
    if (text.includes("RUNOFF")) return "Runoff";
    if (text.includes("PRIMARY")) return "Primary";
    if (text.includes("GENERAL")) return "General";
    if (text.includes("SPECIAL")) return "Special";
    return "Other";
  }

  function normalizePoliticalWindows(rawRows, asOfDate) {
    const asOf = dateToISO(asOfDate) || DEFAULT_CALENDAR_AS_OF;
    const seen = new Set();
    const rows = (rawRows || []).map((r, i) => {
      const state = String(r.State || r.state || r.StateKey || "").trim();
      const region = String(r.Region || r.region || "").trim();
      const market = String(r["Market/DMA"] || r.Market || r.market || r.DMA || r.dma || r.DMAName || "").trim();
      const windowType = String(r["WINDOW TYPE"] || r.WindowType || r.windowType || r.Type || "").trim();
      const windowOpenDate = dateToISO(r["WINDOW OPEN DATE"] || r.WindowOpenDate || r.windowOpenDate || r.OpenDate);
      const electionDate = dateToISO(r["ELECTION DATE"] || r.ElectionDate || r.electionDate);
      if (!state || !market || !electionDate) return null;
      const key = `${normMarketPart(state)}|${normMarketPart(market)}|${normMarketPart(windowType)}|${windowOpenDate}|${electionDate}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const windowStatus = r.WindowStatus || r.windowStatus || deriveWindowStatus(windowOpenDate, electionDate, asOf);
      const daysToWindowOpen = daysBetween(asOf, windowOpenDate);
      const daysToElection = daysBetween(asOf, electionDate);
      return {
        politicalWindowKey: r.PoliticalWindowKey || `PW-${String(i + 1).padStart(4, "0")}`,
        state,
        region,
        market,
        dma: market,
        windowType: windowType || "GENERAL",
        electionTypeGroup: electionTypeGroup(windowType || "GENERAL"),
        windowOpenDate,
        electionDate,
        windowStatus,
        daysToWindowOpen,
        daysToElection: daysToElection == null ? 174 : daysToElection,
        asOfDate: asOf,
      };
    }).filter(Boolean);
    rows.sort((a, b) => {
      const d = String(a.electionDate).localeCompare(String(b.electionDate));
      if (d) return d;
      return `${a.state}|${a.market}|${a.windowType}`.localeCompare(`${b.state}|${b.market}|${b.windowType}`);
    });
    return rows;
  }

  function bestWindowForMarket(windows, state, dma) {
    const ndma = normMarketPart(dma);
    if (!ndma) return null;
    const rank = { "In Window": 4, "Opening Next 30": 3, "Future": 2, "Completed": 1 };
    let best = null;
    let bestScore = -1;
    (windows || []).forEach((w) => {
      if (normMarketPart(w.dma || w.market) !== ndma) return;
      if (!stateMatches(w.state, state)) return;
      const exactState = normMarketPart(w.state) === normMarketPart(state) ? 8 : 4;
      const statusScore = rank[w.windowStatus] || 0;
      const electionScore = Math.max(0, 500 - Math.abs(w.daysToElection || 0)) / 1000;
      const score = exactState + statusScore + electionScore;
      if (score > bestScore) {
        best = w;
        bestScore = score;
      }
    });
    return best;
  }

  function applyPoliticalWindowsToAdvertisers(advertisers, windows) {
    (advertisers || []).forEach((r) => {
      const win = bestWindowForMarket(windows, r.state, r.dma);
      r.calendarMatched = !!win;
      if (!win) return;
      r.windowStatus = win.windowStatus || "Future";
      r.daysToElection = win.daysToElection ?? r.daysToElection ?? 174;
      r.windowType = win.windowType;
      r.windowOpenDate = win.windowOpenDate;
      r.electionDate = win.electionDate;
      r.inWindow = win.windowStatus === "In Window" || win.windowStatus === "Opening Next 30";
    });
  }

  const STATE_NAME_TO_CODE = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
    kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
    massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
    missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
    texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
    "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  };
  const STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

  function inferStateFromAdvertiserText(row) {
    const text = String(`${row.advertiser || ""} ${row.office || ""} ${row.raceLevel || ""}`).trim();
    if (!text) return null;

    // Full state names are the clearest signal for issue groups and local
    // naming ("Florida Future Leaders", "Amplify Louisiana", etc.).
    const lower = text.toLowerCase();
    const stateNames = Object.keys(STATE_NAME_TO_CODE).sort((a, b) => b.length - a.length);
    for (const name of stateNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(lower)) {
        return STATE_NAME_TO_CODE[name];
      }
    }

    // Candidate/committee shorthand: "Murphy for CT Senate", "CA HD-55",
    // "WI CD-03", "AZ Senate", etc. Avoid bare "US" because that is a
    // national marker, not a state.
    const upper = text.toUpperCase();
    const statePattern = Array.from(STATE_CODES).filter((c) => c !== "US").join("|");
    const patterns = [
      new RegExp(`\\b(?:FOR|OF|IN|AGAINST|SUPPORT|ELECT|RE-?ELECT)\\s+(${statePattern})\\b`),
      new RegExp(`\\b(${statePattern})\\s*(?:HD|SD|CD|LD|AD)[-\\s]*\\d+\\b`),
      new RegExp(`\\b(${statePattern})\\s+(?:SENATE|GOVERNOR|HOUSE|CONGRESS|ATTORNEY|AG|MAYOR|STATE)\\b`),
    ];
    for (const pattern of patterns) {
      const match = upper.match(pattern);
      if (match && STATE_CODES.has(match[1])) return match[1];
    }
    return null;
  }

  function repairUSStateRows(advertisers) {
    (advertisers || []).forEach((r) => {
      if (normMarketPart(r.state) !== "US") return;
      const inferred = inferStateFromAdvertiserText(r);
      r.originalState = r.originalState || "US";
      r.stateRepairSource = inferred ? "Advertiser name" : "National addressable";
      r.state = inferred || "National";
    });
  }

  function classifyAdvertiserEntity(row) {
    const type = String(row.advertiserType || row.entityTypeRaw || "").toLowerCase();
    const adv = String(row.advertiser || "").toLowerCase();
    const office = String(row.office || "").toLowerCase();
    const party = String(row.party || "").toLowerCase();
    if (type.includes("candidate")) return "Candidate";
    if (
      type.includes("committee") || type.includes("pac") || type.includes("party") ||
      /\b(pac|committee|party|dnc|rnc|nrcc|dccc|dscc|nrsc|club for growth)\b/.test(adv) ||
      party === "pac"
    ) return "Committee / PAC";
    if (
      type.includes("issue") || type.includes("ballot") ||
      /ballot|issue|proposition|question/.test(office) ||
      /\b(yes on|no on|prop|proposition|question|measure)\b/.test(adv)
    ) return "Issue / Ballot";
    if (/\b(department|dept|government|state of|county of|city of|us department|u s department)\b/.test(adv)) {
      return "Government / Other";
    }
    return "Unknown";
  }

  function closedProspectReason(row) {
    if (!row) return "";
    const result = row.electionResult || {};
    const electionType = String(result.electionType || "").toLowerCase();
    const state = String(row.state || "").trim().toUpperCase();
    const text = `${row.advertiser || ""} ${row.office || ""} ${row.raceLevel || ""} ${result.electionName || ""}`.toLowerCase();

    if (row.generalWon || row.generalLost || (electionType === "general" && result.hasResult)) {
      return "Completed general election";
    }
    if (electionType && electionType !== "primary" && result.hasResult && (result.won || result.lost)) {
      return `Completed ${electionType} election`;
    }
    if (row.primaryLost || (electionType === "primary" && result.lost)) {
      return "Lost primary";
    }
    if (state === "VA" || state === "NJ") {
      return `${state} cycle completed`;
    }
    if (
      (state === "NY" && String(row.office || "").trim().toLowerCase() === "mayor") ||
      /\b(nyc|new york city|new york)\s+mayor\b/i.test(text) ||
      /\bmayor(?:al)?\s+(?:of\s+)?(?:nyc|new york city)\b/i.test(text)
    ) {
      return "NY mayor election completed";
    }
    if (/\b(prop(?:osition)?\s*50|yes on 50|no on 50|elections rigging response act)\b/i.test(text)) {
      return "Prop 50 completed";
    }
    return "";
  }

  function isClosedProspect(row) {
    return !!closedProspectReason(row);
  }

  function stampClosedProspect(row) {
    const reason = closedProspectReason(row);
    row.closedProspectFlag = reason ? 1 : 0;
    row.closedProspectReason = reason;
    return row;
  }

  // ===== Measures =========================================================
  function sum(arr, key) { return arr.reduce((a, r) => a + (r[key] || 0), 0); }

  function computeMeasures(rows, opts) {
    const tvSpendFloor     = opts.tvSpendFloor     ?? 50000;
    const cableShareTarget = opts.cableShareTarget ?? 0.20;
    const cableOppFloor    = opts.cableOppFloor    ?? 25000;

    const broadcast = sum(rows, "broadcast");
    const cable     = sum(rows, "cable");
    const ctv       = sum(rows, "ctv");
    const digital   = sum(rows, "digital");
    const radio     = sum(rows, "radio");
    const total     = broadcast + cable + ctv + digital + radio;
    const tvSpend   = broadcast + cable + ctv;
    const bcCtvSpend= broadcast + ctv;
    const cableShare= tvSpend > 0 ? cable / tvSpend : 0;

    rows.forEach((r) => {
      r.targetCableSpend = r.tvSpend * cableShareTarget;
      r.cableOpportunity = Math.max(0, r.targetCableSpend - r.cable);
      r.noCableFlag = (r.bcCtvSpend > 0 && r.cable === 0) ? 1 : 0;
      r.cableProspectFlag =
        (r.bcCtvSpend >= tvSpendFloor) &&
        (r.cableShare <= cableShareTarget) &&
        (r.cableOpportunity > 0) ? 1 : 0;
      r.meetsCableOppFloor = r.cableOpportunity >= cableOppFloor ? 1 : 0;
      r.cableProspectLabel = (() => {
        if (r.bcCtvSpend === 0) return "No TV Spend";
        if (r.cable === 0)      return "Zero Cable";
        if (r.cableShare < cableShareTarget * 0.6) return "Low Cable";
        return "Cable In Mix";
      })();
    });

    const zeroCableAdv  = rows.filter((r) => r.noCableFlag === 1).length;
    const cableProspects= rows.filter((r) => r.cableProspectFlag === 1).length;

    const targetCableSpend = tvSpend * cableShareTarget;
    const cableOpportunity = Math.max(0, targetCableSpend - cable);

    const prospects        = rows.filter((r) => r.cableProspectFlag === 1 && r.meetsCableOppFloor === 1);
    const prospectSpend    = sum(prospects, "total");
    const prospectBcCtv    = sum(prospects, "bcCtvSpend");
    const prospectCableOpp = sum(prospects, "cableOpportunity");
    const prospectAvgCableShare = prospects.length
      ? prospects.reduce((a, r) => a + r.cableShare, 0) / prospects.length : 0;
    const zeroCableProspects = prospects.filter((r) => r.noCableFlag === 1).length;

    return {
      broadcast, cable, ctv, digital, radio, total, tvSpend, bcCtvSpend, cableShare,
      cableOpportunity, zeroCableAdv, cableProspects,
      prospects, prospectSpend, prospectBcCtv, prospectCableOpp, prospectAvgCableShare,
      zeroCableProspects,
      tvSpendFloor, cableShareTarget, cableOppFloor,
    };
  }

  function applyFilters(rows, f) {
    return rows.filter((r) => {
      if (f.state     && f.state     !== "All" && r.state     !== f.state)     return false;
      if (f.dma       && f.dma       !== "All" && r.dma       !== f.dma)       return false;
      if (f.office    && f.office    !== "All" && r.office    !== f.office)    return false;
      if (f.raceLevel && f.raceLevel !== "All" && r.raceLevel !== f.raceLevel) return false;
      if (f.party     && f.party     !== "All" && r.party     !== f.party)     return false;
      if (f.agency && f.agency !== "All") {
        const agency = normalizeAgency(r.agency);
        if (f.agency === UNASSIGNED_AGENCY_LABEL) {
          if (agency !== UNASSIGNED_AGENCY_LABEL) return false;
        } else if (agency !== f.agency && agency !== UNASSIGNED_AGENCY_LABEL) {
          return false;
        }
      }
      if (f.entityType && f.entityType !== "All" && r.entityType !== f.entityType) return false;
      if (f.window    && f.window    !== "All" && r.windowStatus !== f.window) return false;
      return true;
    });
  }

  // ===== Admin bundle storage ============================================
  const DB_NAME = "PoliticalSpendDashboard";
  const DB_VERSION = 1;
  const DB_STORE = "bundles";
  const DB_KEY = "pbBundle";

  function openBundleDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Could not open dashboard browser database."));
    });
  }

  async function loadBundleFromDB() {
    const db = await openBundleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("Could not read stored dashboard bundle."));
      tx.oncomplete = () => db.close();
    });
  }

  // ===== Bundle ingest ====================================================
  // Priority order:
  //   1. localStorage["pbBundle"] — legacy fallback for smaller admin bundles.
  //   2. window.__pbBundle — the data.bundle.js shipped with the static site.
  //   3. empty fallback (renders an empty dashboard rather than crashing).
  // IndexedDB is async, so it hydrates after initial render and dispatches
  // pbdata:reload when a large admin-applied bundle is available.
  let bundle = null;
  let bundleSource = "empty";
  try {
    const stored = localStorage.getItem("pbBundle");
    if (stored) {
      bundle = JSON.parse(stored);
      bundleSource = "localStorage (admin upload)";
    }
  } catch (e) { /* ignore: fall through to shipped bundle */ }
  if (!bundle) {
    bundle = window.__pbBundle || { advertisers: [], snapshotDate: "—",
      politicalWindowsLoaded: 0, unmatchedAdvertiserCount: 0 };
    bundleSource = window.__pbBundle ? "bundle" : "empty";
  }

  function normalizeRow(r, i) {
    const row = {
      advertiserKey: r.advertiserKey ?? i + 1,
      advertiser:  r.advertiser   || "(unknown)",
      advertiserType: r.advertiserType || r.entityTypeRaw || "",
      agency:      normalizeAgency(r.agency),
      state:       r.state        || "Unknown",
      dma:         r.dma          || "Unknown",
      office:      r.office       || "Unknown",
      raceLevel:   r.raceLevel    || "State Legislature",
      party:       r.party        || "Issue",
      broadcast:   +r.broadcast   || 0,
      cable:       +r.cable       || 0,
      ctv:         +r.ctv         || 0,
      digital:     +r.digital     || 0,
      radio:       +r.radio       || 0,
      total:       +r.total       || 0,
      tvSpend:     +r.tvSpend     || 0,
      bcCtvSpend:  +r.bcCtvSpend  || 0,
      cableShare:  +r.cableShare  || 0,
      windowStatus: r.windowStatus|| "Future",
      daysToElection: r.daysToElection ?? 174,
      // Optional cross-source merges (null when not joined):
      cashOnHand:  r.cashOnHand == null ? null : +r.cashOnHand,
      cycleSpend:  r.cycleSpend == null ? null : +r.cycleSpend,
      fecId:       r.fecId || null,
      // CivicAPI race/result enrichment — populated asynchronously by
      // refreshElectionResults(). The Home Advertiser spend file stays the
      // skeleton; CivicAPI acts as the result source for case-study triage.
      civicRace:         r.civicRace         || null,
      hasCivicMatch:     r.hasCivicMatch     || false,
      electionResult:    r.electionResult    || null,
      hasElectionResult: r.hasElectionResult || false,
      primaryWon:        r.primaryWon        || false,
      primaryLost:       r.primaryLost       || false,
      generalWon:        r.generalWon        || false,
      generalLost:       r.generalLost       || false,
    };
    row.entityType = r.entityType || classifyAdvertiserEntity(row);
    return stampClosedProspect(row);
  }

  const STATIC_POLITICAL_WINDOWS_RAW = Array.isArray(window.__politicalWindowCalendar)
    ? window.__politicalWindowCalendar
    : [];
  const STATIC_POLITICAL_WINDOWS_AS_OF = window.__politicalWindowCalendarAsOf || DEFAULT_CALENDAR_AS_OF;

  function bundlePoliticalWindowRows(nextBundle) {
    return Array.isArray(nextBundle && nextBundle.politicalWindows) && nextBundle.politicalWindows.length
      ? nextBundle.politicalWindows
      : STATIC_POLITICAL_WINDOWS_RAW;
  }

  // Mutable so we can swap-in a re-aggregated upload at runtime.
  const initialPoliticalWindows = normalizePoliticalWindows(bundlePoliticalWindowRows(bundle), STATIC_POLITICAL_WINDOWS_AS_OF);
  const state = {
    advertisers: bundle.advertisers.map(normalizeRow),
    snapshotDate: bundle.snapshotDate || "—",
    politicalWindows: initialPoliticalWindows,
    politicalWindowsLoaded: initialPoliticalWindows.length || bundle.politicalWindowsLoaded || 0,
    unmatchedAdvertiserCount: bundle.unmatchedAdvertiserCount || 0,
    source: bundleSource,
  };
  repairUSStateRows(state.advertisers);
  applyPoliticalWindowsToAdvertisers(state.advertisers, state.politicalWindows);
  state.advertisers.forEach(stampClosedProspect);

  // ===== xlsx upload: re-aggregate client-side ============================
  // Mirrors the Python ETL exactly so an uploaded snapshot looks identical.
  async function loadFromXlsxFile(file) {
    if (typeof XLSX === "undefined") {
      throw new Error("SheetJS not loaded. Cannot parse xlsx in browser.");
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets["WS_FactSpendCurrent"]
      || wb.Sheets["Home_Advertiser_data (3)"]
      || wb.Sheets["Home_Advertiser_data"]
      || wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("No readable worksheet found.");
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    function getField(row, names, fallback = "") {
      for (const name of names) {
        if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== "") return row[name];
      }
      return fallback;
    }
    function getAmount(row) {
      return +getField(row, ["Amount", "Gross Spending", "GrossSpending", "Gross Spend"], 0) || 0;
    }
    function getMediaType(row) {
      const candidates = [
        getField(row, ["MediaType", "Media Type", "ATV_MEDIA_TYPE (copy 2)", "ATV_MEDIA_TYPE"], ""),
        getField(row, ["Station"], ""),
      ];
      for (const candidate of candidates) {
        const normalized = String(candidate || "").trim();
        if (/^(broadcast|cable|ctv|digital|radio)$/i.test(normalized)) return normalized;
      }
      return candidates[0] || "";
    }

    // Shared loose-match key for advertiser strings — mirrors the Python
    // ETL's norm_name so the offline and client-side pipelines join on the
    // same keys.
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
        for (const p of NAME_STRIP_PREFIXES) { if (v.startsWith(p)) { v = v.slice(p.length); changed = true; } }
        for (const s of NAME_STRIP_SUFFIXES) { if (v.endsWith(s))   { v = v.slice(0, -s.length); changed = true; } }
        v = v.trim();
      }
      return v;
    }

    // Optional Cash on Hand sheet (emitted by the Python ETL into the
    // merged xlsx so users can upload one file and get COH attached).
    const cohLookup = new Map();
    const cohSheet = wb.Sheets["WS_CashOnHand"];
    if (cohSheet) {
      const cohRows = XLSX.utils.sheet_to_json(cohSheet, { defval: "" });
      cohRows.forEach((r) => {
        const k = normName(r.Advertiser);
        if (!k) return;
        cohLookup.set(k, {
          cashOnHand: +r.CashOnHand || null,
          cycleSpend: +r.CycleSpend || null,
          fecId:      r.FecId ? String(r.FecId) : null,
        });
      });
    }

    // Optional political windows. If the workbook does not include the full
    // calendar dates, keep using the maintained static market calendar.
    let uploadPoliticalWindows = state.politicalWindows;
    const pwSheet = wb.Sheets["WS_FactPolWindows"];
    if (pwSheet) {
      const pwRows = XLSX.utils.sheet_to_json(pwSheet, { defval: "" });
      const normalized = normalizePoliticalWindows(pwRows, STATIC_POLITICAL_WINDOWS_AS_OF);
      if (normalized.length) uploadPoliticalWindows = normalized;
    }

    const agg = new Map();
    rows.forEach((r) => {
      const adv = getField(r, ["Advertiser"], "");
      if (!adv) return;
      const stateValue = getField(r, ["State", "Election State", "Market or State"], "");
      const dmaValue = getField(r, ["DMA"], "");
      const officeValue = getField(r, ["Office"], "");
      const key = `${adv}|${stateValue}|${dmaValue}|${officeValue}`;
      let a = agg.get(key);
      if (!a) {
        a = {
          advertiser: adv,
          advertiserType: getField(r, ["AdvertiserType", "Advertiser Type"], ""),
          agency:     normalizeAgency(getField(r, ["Agency", "Agencies"], "")),
          state:      stateValue,
          dma:        dmaValue,
          office:     officeValue,
          raceLevel:  getField(r, ["RaceLevel", "Race Level", "Office Type"], ""),
          party:      getField(r, ["Party", "Team Party"], ""),
          broadcast: 0, cable: 0, ctv: 0, digital: 0, radio: 0,
        };
        agg.set(key, a);
      }
      const mt = String(getMediaType(r) || "").toLowerCase();
      const amt = getAmount(r);
      if (mt === "broadcast") a.broadcast += amt;
      else if (mt === "cable")   a.cable   += amt;
      else if (mt === "ctv")     a.ctv     += amt;
      else if (mt === "digital") a.digital += amt;
      else if (mt === "radio")   a.radio   += amt;
    });

    const advertisers = [];
    let i = 1;
    for (const a of agg.values()) {
      const tv = a.broadcast + a.cable + a.ctv;
      const total = tv + a.digital + a.radio;
      if (total <= 0) continue;
      const win = bestWindowForMarket(uploadPoliticalWindows, a.state, a.dma);
      const coh = cohLookup.get(normName(a.advertiser)) || {};
      advertisers.push({
        advertiserKey: i++,
        advertiser: a.advertiser,
        advertiserType: a.advertiserType || "",
        agency:    normalizeAgency(a.agency),
        state:     a.state  || "Unknown",
        dma:       a.dma    || "Unknown",
        office:    a.office || "Unknown",
        raceLevel: a.raceLevel || "State Legislature",
        party:     a.party  || "Issue",
        broadcast: Math.round(a.broadcast * 100) / 100,
        cable:     Math.round(a.cable     * 100) / 100,
        ctv:       Math.round(a.ctv       * 100) / 100,
        digital:   Math.round(a.digital   * 100) / 100,
        radio:     Math.round(a.radio     * 100) / 100,
        total:     Math.round(total       * 100) / 100,
        tvSpend:   Math.round(tv          * 100) / 100,
        bcCtvSpend:Math.round((a.broadcast + a.ctv) * 100) / 100,
        cableShare: tv > 0 ? a.cable / tv : 0,
        windowStatus: win ? win.windowStatus : "Future",
        daysToElection: win ? win.daysToElection : 174,
        windowType: win ? win.windowType : null,
        windowOpenDate: win ? win.windowOpenDate : null,
        electionDate: win ? win.electionDate : null,
        calendarMatched: !!win,
        cashOnHand: coh.cashOnHand ?? null,
        cycleSpend: coh.cycleSpend ?? null,
        fecId:      coh.fecId ?? null,
      });
    }
    // Sort by total spend descending so material rows surface first in
    // tables. No row cap — keep every aggregated advertiser/market row.
    advertisers.sort((x, y) => y.total - x.total);
    advertisers.forEach((r, idx) => {
      r.advertiserKey = idx + 1;
      r.entityType = classifyAdvertiserEntity(r);
      stampClosedProspect(r);
    });
    repairUSStateRows(advertisers);
    applyPoliticalWindowsToAdvertisers(advertisers, uploadPoliticalWindows);
    advertisers.forEach(stampClosedProspect);

    // Snapshot meta
    let snapshotDate = file.name.match(/\d{4}[-_]\d{2}[-_]\d{2}/)?.[0] || new Date().toISOString().slice(0, 10);
    const snapSheet = wb.Sheets["WS_DimSnapshot"];
    if (snapSheet) {
      const snapRows = XLSX.utils.sheet_to_json(snapSheet, { defval: "" });
      if (snapRows.length && snapRows[0].SnapshotDate) snapshotDate = String(snapRows[0].SnapshotDate);
    }

    state.advertisers             = advertisers;
    state.snapshotDate            = snapshotDate;
    state.politicalWindows        = uploadPoliticalWindows;
    state.politicalWindowsLoaded  = uploadPoliticalWindows.length;
    state.unmatchedAdvertiserCount= wb.Sheets["WS_QAUnmatchedAdvertisers"]
      ? XLSX.utils.sheet_to_json(wb.Sheets["WS_QAUnmatchedAdvertisers"]).length
      : 0;
    state.source = "upload:" + file.name;

    // Refresh the pbData snapshot fields + derived datasets, then dispatch
    // a single pbdata:reload event so the app re-renders with consistent state.
    pbData.advertisers              = state.advertisers;
    pbData.SNAPSHOT_DATE            = state.snapshotDate;
    pbData.POLITICAL_WINDOWS_LOADED = state.politicalWindowsLoaded;
    pbData.POLITICAL_WINDOWS        = state.politicalWindows;
    pbData.UNMATCHED_ADV_COUNT      = state.unmatchedAdvertiserCount;
    pbData.source                   = state.source;
    Object.assign(pbData, buildDerived(state.advertisers, state.snapshotDate));
    window.dispatchEvent(new CustomEvent("pbdata:reload", { detail: { source: state.source } }));

    // New uploads become the new advertiser skeleton, so rerun CivicAPI
    // enrichment against the freshly aggregated rows.
    if (pbData.refreshElectionResults) {
      setTimeout(() => pbData.refreshElectionResults({ reason: "upload" }), 50);
    }

    return {
      rows: advertisers.length,
      source: state.source,
      snapshotDate,
    };
  }

  // ===== Derived datasets (powers pages 3-10) =============================
  // The xlsx is a single weekly snapshot, so the trend / PAC / case-study /
  // election-results / data-health datasets are *derived* from the live
  // advertiser book. The shapes here mirror what the mock dashboard exposed
  // so the new page components (trend-detail, race-calendar, pac-completed,
  // casestudy-health) read identically against real and mock data.
  //
  // buildDerived() is re-run whenever loadFromXlsxFile() swaps in a fresh
  // advertiser set, so an uploaded snapshot recomputes everything downstream.

  // Deterministic seeded RNG so the derived sets are stable across reloads.
  function makeRng(seed) {
    let s = seed >>> 0;
    return function() { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  function buildDerived(advertisers, snapshotDateStr) {
    const rnd = makeRng(20260513);

    // ---- Weekly snapshot history (16 weeks ending snapshotDate) ----------
    const end = parseSnapshotDate(snapshotDateStr) || new Date();
    const SNAPSHOTS = (() => {
      const dates = [];
      for (let i = 15; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i * 7);
        dates.push(d);
      }
      return dates.map((d, i) => ({
        key: i, date: d,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        iso: d.toISOString().slice(0, 10),
      }));
    })();

    function trendCurve(n, total) {
      // n in 0..15 → cumulative spend ramp via logistic curve.
      const t = n / 15;
      const sig  = 1 / (1 + Math.exp(-7 * (t - 0.55)));
      const sig0 = 1 / (1 + Math.exp(-7 * (0 - 0.55)));
      const sig1 = 1 / (1 + Math.exp(-7 * (1 - 0.55)));
      const norm = (sig - sig0) / (sig1 - sig0);
      return Math.round(total * (0.05 + 0.95 * norm));
    }

    const SNAPSHOT_TOTALS = SNAPSHOTS.map((s) => {
      const n = s.key;
      let bc=0, ca=0, ct=0, di=0, ra=0;
      advertisers.forEach((r) => {
        bc += trendCurve(n, r.broadcast);
        ca += trendCurve(n, r.cable);
        ct += trendCurve(n, r.ctv);
        di += trendCurve(n, r.digital);
        ra += trendCurve(n, r.radio);
      });
      const total = bc + ca + ct + di + ra;
      return { ...s, broadcast: bc, cable: ca, ctv: ct, digital: di, radio: ra, total };
    });

    // ---- PAC / outside spend committees ---------------------------------
    const PAC_COMMITTEES = [
      { name: "Senate Majority PAC",          alignment: "DEM", focus: "Federal Senate" },
      { name: "Senate Leadership Fund",       alignment: "REP", focus: "Federal Senate" },
      { name: "House Majority PAC",           alignment: "DEM", focus: "Federal House" },
      { name: "Congressional Leadership Fund",alignment: "REP", focus: "Federal House" },
      { name: "DGA Action",                   alignment: "DEM", focus: "Governor" },
      { name: "RGA Right Direction",          alignment: "REP", focus: "Governor" },
      { name: "Working Families Action",      alignment: "DEM", focus: "State Legislature" },
      { name: "Americans for Prosperity",     alignment: "REP", focus: "Statewide Office" },
      { name: "EMILY's List Independent",     alignment: "DEM", focus: "Federal Senate" },
      { name: "Club for Growth Action",       alignment: "REP", focus: "Federal House" },
      { name: "Future Forward USA",           alignment: "DEM", focus: "Federal Senate" },
      { name: "American Action Network",      alignment: "REP", focus: "Federal House" },
    ];
    const PAYEE_TYPES = ["TV Buy", "Digital Buy", "Mailer", "Field Ops", "Polling"];
    const PAC_ROWS = (() => {
      const out = [];
      PAC_COMMITTEES.forEach((c, ci) => {
        const pool = advertisers.filter((a) => a.raceLevel === c.focus && a.party !== "PAC" && a.party !== "Issue");
        const cnt = 2 + Math.floor(rnd() * 4);
        for (let i = 0; i < cnt; i++) {
          const target = pool[(ci * 7 + i * 3) % Math.max(1, pool.length)];
          if (!target) continue;
          const isSupport = target.party === c.alignment;
          const scale = ({
            "Federal Senate": 2_400_000, "Federal House": 600_000,
            "Governor": 1_600_000, "State Legislature": 180_000, "Statewide Office": 450_000,
          })[c.focus] || 250_000;
          const spend = scale * (0.4 + rnd() * 1.4);
          const support = isSupport ? spend * (0.7 + rnd() * 0.25) : spend * (0.05 + rnd() * 0.15);
          const oppose  = isSupport ? spend * (0.05 + rnd() * 0.15) : spend * (0.7 + rnd() * 0.25);
          out.push({
            committee: c.name, alignment: c.alignment, focus: c.focus,
            target: target.advertiser, targetState: target.state, targetParty: target.party,
            support: Math.round(support), oppose: Math.round(oppose),
            total: Math.round(support + oppose),
            payee: PAYEE_TYPES[Math.floor(rnd() * PAYEE_TYPES.length)],
            weekEnding: SNAPSHOTS[Math.floor(rnd() * SNAPSHOTS.length)].iso,
          });
        }
      });
      return out;
    })();

    // ---- Case studies ---------------------------------------------------
    const CASE_STUDY_STATUS = ["Drafting", "Approved For Sales", "Live", "Pending Approval", "Archived"];
    const CASE_STUDY_OWNERS = ["Priya Shah", "Marcus Bell", "Lin Yamamoto", "Dan O'Connor", "Renee Carter", "Kwame Adjei"];

    function caseStudyScore(r) {
      const targetCable = r.tvSpend * 0.20;
      const opportunity = Math.max(0, targetCable - r.cable);
      const opp = Math.min(1, opportunity / 800000) * 40;
      const cableShareFit = Math.max(0, 1 - r.cableShare / 0.20) * 30;
      const totalScale = Math.min(1, r.total / 5_000_000) * 20;
      const inWindow = r.windowStatus === "In Window" ? 10 : r.windowStatus === "Opening Next 30" ? 6 : 2;
      return Math.round(opp + cableShareFit + totalScale + inWindow);
    }
    function pickNarrative(r) {
      if (r.cableShare === 0 && r.bcCtvSpend > 200000) return "Zero cable today — full target share is in play.";
      if (r.cableShare < 0.1) return "Sub-10% cable share with material broadcast spend — clean upsell story.";
      if (r.windowStatus === "Opening Next 30") return "Window opens in next 30 days — timing fits a Q3 case study.";
      if (r.raceLevel === "Federal Senate") return "Federal Senate scale; flagship-tier proof point if closed.";
      return "Standard prospect narrative; refine before publishing.";
    }
    const CASE_STUDIES = advertisers.map((r, i) => ({
      ...r,
      caseStudyScore: caseStudyScore(r),
      status: CASE_STUDY_STATUS[(i * 7) % CASE_STUDY_STATUS.length],
      owner: CASE_STUDY_OWNERS[i % CASE_STUDY_OWNERS.length],
      approvedForSales: ((i * 5) % 3) === 0,
      deckLink: `casestudies/${r.advertiserKey}_${String(r.advertiser).split(" ")[0].toLowerCase()}.pptx`,
      narrative: pickNarrative(r),
      lastUpdated: SNAPSHOTS[(SNAPSHOTS.length - 1 - (i % 10))].iso,
    }));

    // ---- Election results: CivicAPI is loaded async after page render ----
    const ELECTION_RESULTS = advertisers
      .filter((r) => r.daysToElection < 0)
      .map((r) => ({
        ...r,
        resultStatus: "Awaiting CivicAPI Results",
        certifiedDate: null, winnerName: null, voteShare: null,
      }));

    // ---- Data health (driven partly by live counts) ---------------------
    const DATA_HEALTH = {
      rowsLoaded: advertisers.reduce((a, r) => a + 1, 0) * 6, // ≈ rows aggregated per advertiser
      snapshotsLoaded: SNAPSHOTS.length,
      unmatchedAdvertisers: state.unmatchedAdvertiserCount,
      lowConfidenceMatches: 38,
      duplicateKeyCount: 4,
      politicalWindowsLoaded: state.politicalWindowsLoaded,
      outsideSpendRows: PAC_ROWS.length,
      lastApiRefresh: snapshotDateStr + " 04:12 ET",
      sources: [
        { name: "Vivvix Political Spend",       lastLoaded: snapshotDateStr + " 03:42 ET", status: "Healthy", rows: 4_120_882, owner: "Data Eng" },
        { name: "FCC Public Files (CDP)",       lastLoaded: snapshotDateStr + " 03:05 ET", status: "Healthy", rows: 1_980_104, owner: "Data Eng" },
        { name: "FEC Independent Expenditures", lastLoaded: snapshotDateStr + " 02:48 ET", status: "Healthy", rows: 612_415,   owner: "Data Eng" },
        { name: "Political Window Calendar",    lastLoaded: STATIC_POLITICAL_WINDOWS_AS_OF, status: "Healthy", rows: state.politicalWindowsLoaded, owner: "Sales Ops" },
        { name: "CivicAPI Certified Results",   lastLoaded: "—",                           status: "Loading", rows: 0,          owner: "Civic Ops" },
        { name: "Internal CRM Mapping",         lastLoaded: snapshotDateStr + " 04:01 ET", status: "Healthy", rows: 84_201,     owner: "Sales Ops" },
        { name: "Outcomes+ Attribution",        lastLoaded: snapshotDateStr + " 04:12 ET", status: "Healthy", rows: 1_624_890,  owner: "Outcomes" },
      ],
      refreshLog: [
        { ts: snapshotDateStr + " 04:12 ET", step: "Cumulative spend rebuild",   rows: advertisers.length * 6,  duration: "11m 42s", status: "OK" },
        { ts: snapshotDateStr + " 04:00 ET", step: "Outcomes+ attribution join", rows: 1_624_890,               duration: "4m 18s",  status: "OK" },
        { ts: snapshotDateStr + " 03:42 ET", step: "Vivvix snapshot ingest",     rows: 312_004,                 duration: "9m 06s",  status: "OK" },
        { ts: snapshotDateStr + " 03:05 ET", step: "FCC public file ingest",     rows: 88_412,                  duration: "6m 22s",  status: "OK" },
        { ts: snapshotDateStr + " 02:48 ET", step: "FEC IE pull",                rows: 12_440,                  duration: "3m 51s",  status: "OK" },
        { ts: STATIC_POLITICAL_WINDOWS_AS_OF, step: "Political window calendar load", rows: state.politicalWindowsLoaded, duration: "workbook", status: "OK" },
        { ts: "Live (async)",               step: "CivicAPI certified results", rows: 0,                       duration: "—",       status: "Loading" },
      ],
      matchReview: [
        { advertiser: "Future Vision PAC",    candidate: "Hartley", confidence: 0.42, suggested: "Patriots for Progress",   needsHuman: true  },
        { advertiser: "Citizens 4 Maddox",    candidate: "Maddox",  confidence: 0.61, suggested: "Maddox for State Senate", needsHuman: true  },
        { advertiser: "Stronger Together IA", candidate: "—",       confidence: 0.55, suggested: "Working Families Action", needsHuman: true  },
        { advertiser: "Voters Choice CLT",    candidate: "Brennan", confidence: 0.71, suggested: "Brennan for Congress",    needsHuman: false },
        { advertiser: "Mountain West Action", candidate: "—",       confidence: 0.49, suggested: "Mountain State Future PAC",needsHuman: true },
      ],
    };

    // ---- Stations / Networks (Page 4 detail) ----------------------------
    const STATIONS_BY_DMA = {
      "Atlanta":        [{ call: "WSB-TV",  net: "ABC" }, { call: "WAGA-TV", net: "FOX" }, { call: "WXIA-TV", net: "NBC" }, { call: "WGCL-TV", net: "CBS" }],
      "Phoenix":        [{ call: "KPNX",    net: "NBC" }, { call: "KSAZ-TV", net: "FOX" }, { call: "KNXV-TV", net: "ABC" }, { call: "KPHO-TV", net: "CBS" }],
      "Detroit":        [{ call: "WDIV-TV", net: "NBC" }, { call: "WXYZ-TV", net: "ABC" }, { call: "WJBK",    net: "FOX" }, { call: "WWJ-TV",  net: "CBS" }],
      "Milwaukee":      [{ call: "WTMJ-TV", net: "NBC" }, { call: "WITI",    net: "FOX" }, { call: "WISN-TV", net: "ABC" }, { call: "WDJT-TV", net: "CBS" }],
      "Philadelphia":   [{ call: "KYW-TV",  net: "CBS" }, { call: "WCAU",    net: "NBC" }, { call: "WPVI-TV", net: "ABC" }, { call: "WTXF-TV", net: "FOX" }],
      "Charlotte":      [{ call: "WSOC-TV", net: "ABC" }, { call: "WCNC-TV", net: "NBC" }, { call: "WJZY",    net: "FOX" }, { call: "WBTV",    net: "CBS" }],
      "Las Vegas":      [{ call: "KLAS-TV", net: "CBS" }, { call: "KSNV",    net: "NBC" }, { call: "KTNV-TV", net: "ABC" }, { call: "KVVU-TV", net: "FOX" }],
      "Columbus":       [{ call: "WBNS-TV", net: "CBS" }, { call: "WCMH-TV", net: "NBC" }, { call: "WSYX",    net: "ABC" }, { call: "WTTE",    net: "FOX" }],
      "Tampa–St. Pete": [{ call: "WTSP",    net: "CBS" }, { call: "WTVT",    net: "FOX" }, { call: "WFLA-TV", net: "NBC" }, { call: "WFTS-TV", net: "ABC" }],
      "Richmond":       [{ call: "WTVR-TV", net: "CBS" }, { call: "WRIC-TV", net: "ABC" }, { call: "WWBT",    net: "NBC" }, { call: "WRLH-TV", net: "FOX" }],
    };
    function stationsFor(dma) {
      return STATIONS_BY_DMA[dma] || [
        { call: "Local-1", net: "ABC" }, { call: "Local-2", net: "NBC" },
        { call: "Local-3", net: "CBS" }, { call: "Local-4", net: "FOX" },
      ];
    }

    return { SNAPSHOTS, SNAPSHOT_TOTALS, trendCurve,
      PAC_COMMITTEES, PAC_ROWS,
      CASE_STUDIES, CASE_STUDY_STATUS,
      ELECTION_RESULTS, DATA_HEALTH, stationsFor };
  }

  function parseSnapshotDate(s) {
    if (!s) return null;
    // "May 13, 2026" → Date
    let d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    // ISO "2026-05-13"
    const m = String(s).match(/(\d{4})[-_](\d{2})[-_](\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return null;
  }

  const derived = buildDerived(state.advertisers, state.snapshotDate);

  // If the uploaded bundle ships real PAC/IE rows (built from FEC files via
  // the Admin pipeline) use them directly. Otherwise stick with the
  // synthesized rows from buildDerived().
  if (Array.isArray(bundle.pacRows) && bundle.pacRows.length) {
    derived.PAC_ROWS = bundle.pacRows;
  }
  if (Array.isArray(bundle.leadershipPacs) && bundle.leadershipPacs.length) {
    derived.LEADERSHIP_PACS = bundle.leadershipPacs;
  }

  // ===== Power BI export =====================================================
  function stableKey(...parts) {
    return parts
      .map((p) => String(p == null || p === "" ? "UNKNOWN" : p).trim().toUpperCase())
      .join("|");
  }

  function electionCompletionInfo(row) {
    const result = row.electionResult || {};
    const closedReason = closedProspectReason(row);
    const resultLoaded = !!(row.hasElectionResult || result.hasResult || result.won != null || result.lost != null);
    const calendarCompleted = row.windowStatus === "Completed" || (Number.isFinite(+row.daysToElection) && +row.daysToElection < 0);

    if (closedReason) {
      return {
        completedFlag: 1,
        status: "Completed",
        detail: closedReason,
        source: resultLoaded ? "CivicAPI + dashboard rule" : "Dashboard closed-election rule",
        prospectEligibleFlag: 0,
      };
    }
    if (resultLoaded) {
      return {
        completedFlag: 1,
        status: "Completed",
        detail: result.electionType ? `Completed ${result.electionType} election` : "Completed election result loaded",
        source: "CivicAPI certified results",
        prospectEligibleFlag: 0,
      };
    }
    if (calendarCompleted) {
      return {
        completedFlag: 1,
        status: "Completed",
        detail: "Election date has passed in political-window calendar",
        source: "Political window calendar",
        prospectEligibleFlag: 0,
      };
    }
    return {
      completedFlag: 0,
      status: "Not Completed",
      detail: row.windowStatus || "Future",
      source: row.calendarMatched ? "Political window calendar" : "No calendar match",
      prospectEligibleFlag: row.calendarMatched ? 1 : 0,
    };
  }

  function buildPowerBIExportRows() {
    const defaultCableTarget = 0.20;
    return state.advertisers.map((row) => {
      const entityType = row.entityType || classifyAdvertiserEntity(row);
      const result = row.electionResult || row.civicRace || {};
      const tvSpend = row.tvSpend || (row.broadcast || 0) + (row.cable || 0) + (row.ctv || 0);
      const bcCtvSpend = row.bcCtvSpend || (row.broadcast || 0) + (row.ctv || 0);
      const targetCableSpend = tvSpend * defaultCableTarget;
      const cableOpportunity = Math.max(0, targetCableSpend - (row.cable || 0));
      const electionInfo = electionCompletionInfo(row);
      return {
        SnapshotDate: state.snapshotDate,
        Source: state.source,
        RowBusinessKey: stableKey(
          row.advertiser, row.agency, row.state, row.dma, row.office,
          row.raceLevel, row.party, entityType
        ),
        AdvertiserKey: row.advertiserKey,
        Advertiser: row.advertiser,
        AdvertiserTypeRaw: row.advertiserType || "",
        EntityType: entityType,
        Agency: row.agency,
        AgencyAssignedFlag: isUnassignedAgency(row.agency) ? 0 : 1,
        OriginalState: row.originalState || row.state,
        StateRepairSource: row.stateRepairSource || "",
        State: row.state,
        DMA: row.dma,
        Office: row.office,
        RaceLevel: row.raceLevel,
        Party: row.party,
        BroadcastSpend: row.broadcast || 0,
        CableSpend: row.cable || 0,
        CTVSpend: row.ctv || 0,
        DigitalSpend: row.digital || 0,
        RadioSpend: row.radio || 0,
        TotalSpend: row.total || 0,
        TVSpend: tvSpend,
        BroadcastCTVSpend: bcCtvSpend,
        CableShare: tvSpend > 0 ? (row.cable || 0) / tvSpend : 0,
        TargetCableSpend_Default20Pct: targetCableSpend,
        CableOpportunity_Default20Pct: cableOpportunity,
        NoCableFlag: bcCtvSpend > 0 && (row.cable || 0) === 0 ? 1 : 0,
        WindowStatus: row.windowStatus,
        CalendarMatched: !!row.calendarMatched,
        WindowType: row.windowType || "",
        ElectionTypeGroup: row.windowType ? electionTypeGroup(row.windowType) : "",
        WindowOpenDate: row.windowOpenDate || null,
        ElectionDate: row.electionDate || null,
        ElectionCompletedFlag: electionInfo.completedFlag,
        ElectionCompletionStatus: electionInfo.status,
        ElectionStatusDetail: electionInfo.detail,
        ElectionStatusSource: electionInfo.source,
        ProspectEligibleElectionFlag: electionInfo.prospectEligibleFlag,
        DaysToElection: row.daysToElection,
        CashOnHand: row.cashOnHand,
        CycleSpend: row.cycleSpend,
        FEC_ID: row.fecId,
        HasCivicMatch: !!row.hasCivicMatch,
        HasElectionResult: !!row.hasElectionResult,
        CivicRaceId: result.raceId || null,
        CivicElectionName: result.electionName || "",
        CivicElectionType: result.electionType || "",
        CivicElectionDate: result.electionDate || null,
        CivicCandidateName: result.candidateName || "",
        CivicCandidateParty: result.party || "",
        CivicWon: result.won == null ? null : !!result.won,
        CivicLost: result.lost == null ? null : !!result.lost,
        PrimaryWon: !!row.primaryWon,
        PrimaryLost: !!row.primaryLost,
        GeneralWon: !!row.generalWon,
        GeneralLost: !!row.generalLost,
        CivicVotes: result.votes == null ? null : result.votes,
        CivicVoteShare: result.voteShare == null ? null : result.voteShare,
        CivicPercentReporting: result.percentReporting == null ? null : result.percentReporting,
        CivicMatchScore: result.matchScore == null ? null : result.matchScore,
        CivicCandidateScore: result.candidateScore == null ? null : result.candidateScore,
        CivicRaceScore: result.raceScore == null ? null : result.raceScore,
        CivicSource: result.source || "",
        CivicCertificationStatus: result.certificationStatus || (row.hasElectionResult ? "Certified - CivicAPI" : "Not matched / not loaded"),
        ClosedProspectFlag: isClosedProspect(row) ? 1 : 0,
        ClosedProspectReason: closedProspectReason(row),
      };
    });
  }

  function buildPoliticalWindowExportRows() {
    return (state.politicalWindows || []).map((row) => {
      const completedFlag = row.windowStatus === "Completed" || (Number.isFinite(+row.daysToElection) && +row.daysToElection < 0) ? 1 : 0;
      return ({
      PoliticalWindowKey: row.politicalWindowKey,
      State: row.state,
      Region: row.region,
      Market: row.market,
      DMA: row.dma,
      WindowType: row.windowType,
      ElectionTypeGroup: row.electionTypeGroup || electionTypeGroup(row.windowType),
      WindowOpenDate: row.windowOpenDate,
      ElectionDate: row.electionDate,
      DaysToWindowOpen: row.daysToWindowOpen,
      DaysToElection: row.daysToElection,
      WindowStatus: row.windowStatus,
      ElectionCompletedFlag: completedFlag,
      ElectionCompletionStatus: completedFlag ? "Completed" : "Not Completed",
      AsOfDate: row.asOfDate,
      CalendarSource: "2026 Political Calendar by Market.xlsx",
      });
    });
  }

  function buildElectionStatusDimensionRows() {
    return [
      {
        ElectionCompletionStatus: "Completed",
        CompletedFlag: 1,
        Description: "Election is completed by CivicAPI results, calendar date, or an explicit dashboard closure rule.",
      },
      {
        ElectionCompletionStatus: "Not Completed",
        CompletedFlag: 0,
        Description: "Election has not been marked complete and can remain active/upcoming if in a calendar market.",
      },
    ];
  }

  function buildOutsideSpendExportRows() {
    const sourceRows = (typeof pbData !== "undefined" && Array.isArray(pbData.PAC_ROWS))
      ? pbData.PAC_ROWS
      : (derived.PAC_ROWS || []);
    return sourceRows.map((row, i) => ({
      OutsideSpendKey: `OS-${String(i + 1).padStart(6, "0")}`,
      SourceType: row.source || "Dashboard PAC/IE model",
      CommitteeName: row.committee || "",
      Alignment: row.alignment || "",
      RaceLevel: row.focus || "",
      CandidateOrTarget: row.target || "",
      TargetState: row.targetState || "",
      TargetParty: row.targetParty || "",
      SupportSpend: row.support || 0,
      OpposeSpend: row.oppose || 0,
      OutsideSpend: row.total || ((row.support || 0) + (row.oppose || 0)),
      SupportOppose:
        (row.support || 0) > 0 && (row.oppose || 0) > 0 ? "Mixed" :
        (row.support || 0) > 0 ? "Support" :
        (row.oppose || 0) > 0 ? "Oppose" : "Unknown",
      Payee: row.payee || "",
      SpendDate: row.weekEnding || "",
      IsFECSource: row.source ? 1 : 0,
    }));
  }

  function buildLeadershipPACExportRows() {
    const sourceRows = (typeof pbData !== "undefined" && Array.isArray(pbData.LEADERSHIP_PACS))
      ? pbData.LEADERSHIP_PACS
      : (derived.LEADERSHIP_PACS || []);
    return sourceRows.map((row, i) => ({
      LeadershipPACKey: `LP-${String(i + 1).padStart(5, "0")}`,
      CommitteeName: row.committee || "",
      CommitteeID: row.committeeId || "",
      SponsorName: row.sponsor || "",
      CashOnHand: row.cashOnHand || 0,
      TotalReceipts: row.totalReceipts || 0,
      TotalDisbursements: row.totalDisbursements || 0,
      CoverageEndDate: row.coverageEnd || "",
    }));
  }

  function csvEscape(value) {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function rowsToCsv(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((row) => {
      lines.push(headers.map((h) => csvEscape(row[h])).join(","));
    });
    return lines.join("\r\n");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPowerBICsv() {
    if (pbData.ELECTION_RESULTS_STATUS !== "loaded" && window.CivicAPI) {
      await refreshElectionResults();
    }
    const rows = buildPowerBIExportRows();
    const csv = rowsToCsv(rows);
    const date = String(state.snapshotDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9A-Za-z_-]+/g, "-");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `political_spend_powerbi_${date}.csv`);
    return { rows: rows.length, format: "csv" };
  }

  async function downloadPowerBIWorkbook() {
    if (pbData.ELECTION_RESULTS_STATUS !== "loaded" && window.CivicAPI) {
      await refreshElectionResults();
    }
    const rows = buildPowerBIExportRows();
    const date = String(state.snapshotDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9A-Za-z_-]+/g, "-");
    if (typeof XLSX === "undefined") return downloadPowerBICsv();

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "FactAdvertiserCivic");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildPoliticalWindowExportRows()), "FactPoliticalWindows");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildOutsideSpendExportRows()), "FactOutsideSpend");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildLeadershipPACExportRows()), "DimLeadershipPAC");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildElectionStatusDimensionRows()), "DimElectionStatus");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ENTITY_TYPES.map((entityType) => ({
      EntityType: entityType,
      Description: {
        "Candidate": "Advertiser appears to be a candidate campaign.",
        "Committee / PAC": "Advertiser appears to be a committee, PAC, party, or outside group.",
        "Issue / Ballot": "Advertiser appears tied to an issue, measure, proposition, or ballot campaign.",
        "Government / Other": "Advertiser appears governmental or otherwise not campaign-like.",
        "Unknown": "Could not confidently classify from available fields.",
      }[entityType],
    }))), "DimEntityType");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      ExportedAt: new Date().toISOString(),
      SnapshotDate: state.snapshotDate,
      Source: state.source,
      Rows: rows.length,
      CompletedElectionRows: rows.filter((r) => r.ElectionCompletedFlag === 1).length,
      NotCompletedElectionRows: rows.filter((r) => r.ElectionCompletedFlag === 0).length,
      PoliticalWindowRows: state.politicalWindows.length,
      OutsideSpendRows: buildOutsideSpendExportRows().length,
      LeadershipPACRows: buildLeadershipPACExportRows().length,
      CivicAPIStatus: pbData.ELECTION_RESULTS_STATUS,
      CivicResultsLoaded: pbData.ELECTION_RESULTS_LOADED || 0,
      PoliticalWindowsLoaded: state.politicalWindowsLoaded,
      DefaultCableShareTarget: 0.20,
    }]), "RefreshMeta");
    XLSX.writeFile(wb, `political_spend_powerbi_${date}.xlsx`, { bookType: "xlsx" });
    return { rows: rows.length, format: "xlsx" };
  }

  // ===== Public API =======================================================
  const pbData = {
    RACE_LEVELS, PARTIES, WINDOW_STATUS, ENTITY_TYPES, UNASSIGNED_AGENCY_LABEL,
    advertisers: state.advertisers,
    computeMeasures, applyFilters,
    normalizeAgency, isUnassignedAgency,
    classifyAdvertiserEntity, isClosedProspect, closedProspectReason,
    buildPowerBIExportRows, buildPoliticalWindowExportRows, buildElectionStatusDimensionRows,
    buildOutsideSpendExportRows, buildLeadershipPACExportRows,
    normalizePoliticalWindows, bestWindowForMarket, electionTypeGroup,
    downloadPowerBIWorkbook, downloadPowerBICsv,
    fmtMoney, fmtMoneyTight, fmtPct, uniqueSorted,
    SNAPSHOT_DATE: state.snapshotDate,
    POLITICAL_WINDOWS: state.politicalWindows,
    POLITICAL_WINDOWS_LOADED: state.politicalWindowsLoaded,
    UNMATCHED_ADV_COUNT: state.unmatchedAdvertiserCount,
    loadFromXlsxFile,
    source: state.source,
    ...derived,
  };

  function applyStoredBundle(nextBundle, sourceLabel) {
    if (!nextBundle || !Array.isArray(nextBundle.advertisers)) return false;

    state.advertisers = nextBundle.advertisers.map(normalizeRow);
    state.snapshotDate = nextBundle.snapshotDate || "—";
    state.politicalWindows = normalizePoliticalWindows(bundlePoliticalWindowRows(nextBundle), STATIC_POLITICAL_WINDOWS_AS_OF);
    state.politicalWindowsLoaded = state.politicalWindows.length || nextBundle.politicalWindowsLoaded || 0;
    state.unmatchedAdvertiserCount = nextBundle.unmatchedAdvertiserCount || 0;
    state.source = sourceLabel;
    repairUSStateRows(state.advertisers);
    applyPoliticalWindowsToAdvertisers(state.advertisers, state.politicalWindows);

    pbData.advertisers = state.advertisers;
    pbData.SNAPSHOT_DATE = state.snapshotDate;
    pbData.POLITICAL_WINDOWS = state.politicalWindows;
    pbData.POLITICAL_WINDOWS_LOADED = state.politicalWindowsLoaded;
    pbData.UNMATCHED_ADV_COUNT = state.unmatchedAdvertiserCount;
    pbData.source = state.source;
    pbData.ELECTION_RESULTS_LOADED = 0;
    pbData.ELECTION_RESULTS_STATUS = "idle";
    pbData.CIVIC_API_SUMMARY = null;
    state.advertisers.forEach(stampClosedProspect);
    const rebuilt = buildDerived(state.advertisers, state.snapshotDate);
    if (Array.isArray(nextBundle.pacRows) && nextBundle.pacRows.length) {
      rebuilt.PAC_ROWS = nextBundle.pacRows;
    }
    if (Array.isArray(nextBundle.leadershipPacs) && nextBundle.leadershipPacs.length) {
      rebuilt.LEADERSHIP_PACS = nextBundle.leadershipPacs;
    }
    Object.assign(pbData, rebuilt);

    window.dispatchEvent(new CustomEvent("pbdata:reload", { detail: { source: state.source } }));
    return true;
  }

  async function hydrateIndexedBundle() {
    try {
      const record = await loadBundleFromDB();
      if (record && record.bundle) {
        return applyStoredBundle(record.bundle, "IndexedDB (admin upload)");
      }
    } catch (e) {
      console.warn("Could not load admin bundle from browser database:", e);
    }
    return false;
  }

  function resetToShippedBundle() {
    const shipped = window.__pbBundle || {
      advertisers: [],
      snapshotDate: "—",
      politicalWindowsLoaded: 0,
      unmatchedAdvertiserCount: 0,
    };
    return applyStoredBundle(shipped, window.__pbBundle ? "bundle" : "empty");
  }

  // ===== CivicAPI election result enrichment ================================
  // Runs asynchronously after initial render so it never blocks page load.
  // Mutates advertiser rows in place, then fires pbdata:results so the React
  // app re-renders with won/lost flags and updated KPIs.
  pbData.ELECTION_RESULTS_LOADED = 0;
  pbData.ELECTION_RESULTS_STATUS = "idle"; // "idle" | "loading" | "loaded" | "error"
  let civicRefreshPromise = null;

  async function refreshElectionResults() {
    if (civicRefreshPromise) return civicRefreshPromise;
    civicRefreshPromise = (async () => {
    if (!window.CivicAPI) return;
    pbData.ELECTION_RESULTS_STATUS = "loading";
    window.dispatchEvent(new CustomEvent("pbdata:results", { detail: { status: "loading" } }));

    // Update the Data Health source row to reflect live status
    function setCivicStatus(status, rows) {
      const src = pbData.DATA_HEALTH && pbData.DATA_HEALTH.sources
        ? pbData.DATA_HEALTH.sources.find((s) => s.name === "CivicAPI Certified Results" || s.name === "CivicAPI Election Results")
        : null;
      if (src) {
        src.name = "CivicAPI Certified Results";
        src.status = status;
        src.lastLoaded = new Date().toLocaleString("en-US");
        if (rows != null) src.rows = rows;
      }
    }

    try {
      let lastProgressRender = 0;
      const renderProgress = (progress) => {
        const now = Date.now();
        state.advertisers.forEach(stampClosedProspect);
        pbData.CIVIC_API_SUMMARY = progress;
        pbData.ELECTION_RESULTS_LOADED = progress.resultsLoaded || 0;
        setCivicStatus("Loading", progress.civicMatches || 0);
        if (now - lastProgressRender < 750) return;
        lastProgressRender = now;
        window.dispatchEvent(new CustomEvent("pbdata:results", {
          detail: { status: "loading", count: pbData.ELECTION_RESULTS_LOADED },
        }));
        window.dispatchEvent(new CustomEvent("pbdata:reload", {
          detail: { source: "civic-enrichment-progress", state: progress.state },
        }));
      };

      const summary = await window.CivicAPI.enrichAdvertisers(state.advertisers, {
        onProgress: renderProgress,
      });
      const count = typeof summary === "number" ? summary : (summary.resultsLoaded || 0);
      const matches = typeof summary === "number" ? summary : (summary.civicMatches || 0);
      state.advertisers.forEach(stampClosedProspect);
      pbData.CIVIC_API_SUMMARY = summary;
      pbData.ELECTION_RESULTS_LOADED = count;
      pbData.ELECTION_RESULTS_STATUS = "loaded";
      setCivicStatus("Healthy", matches);
    } catch (e) {
      pbData.ELECTION_RESULTS_STATUS = "error";
      setCivicStatus("Error", 0);
      console.warn("CivicAPI enrichment failed:", e);
    }

    window.dispatchEvent(new CustomEvent("pbdata:results", {
      detail: { status: pbData.ELECTION_RESULTS_STATUS, count: pbData.ELECTION_RESULTS_LOADED },
    }));
    // Force React memos in the app to re-run so the new won/lost flags
    // propagate into the Prospect filter and Case Study Library.
    window.dispatchEvent(new CustomEvent("pbdata:reload", { detail: { source: "civic-enrichment" } }));
    })();
    try {
      return await civicRefreshPromise;
    } finally {
      civicRefreshPromise = null;
    }
  }

  pbData.refreshElectionResults = refreshElectionResults;
  window.pbData = pbData;

  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("political-dashboard");
    channel.onmessage = async (event) => {
      const type = event && event.data && event.data.type;
      if (type === "pbBundleApplied") {
        const loaded = await hydrateIndexedBundle();
        if (loaded) refreshElectionResults();
      }
      if (type === "pbBundleReset") {
        resetToShippedBundle();
        refreshElectionResults();
      }
    };
  }

  // Fire after initial render tick so the UI is responsive on first paint.
  // If Admin.html saved a large bundle into IndexedDB, load it first and then
  // enrich the updated rows with CivicAPI results.
  hydrateIndexedBundle().then(() => {
    setTimeout(refreshElectionResults, 500);
  });
})();
