// CivicAPI v2 integration for the Claude / Comcast Advertising dashboard.
//
// CivicAPI docs: https://civicapi.org/api-documentation
//   GET /race/search?startDate=[date]&endDate=[date]&query=[string]
//       &country=[string]&province=[string]&district=[string]
//       &election_type=[string]&limit=[integer]
//   GET /race/{raceid}?data=json
//
// The spend file remains the dashboard skeleton. CivicAPI is treated as the
// election-results source of record for this case-study workflow: find likely
// race/candidate context for advertiser rows, then stamp vote totals, vote
// share, and win/loss flags when the API returns result data.

(function () {
  const DIRECT_BASE = "https://civicapi.org/api/v2";
  const LOCAL_PROXY_BASE = "/api/civic";
  const LOCAL_PROXY_ABSOLUTE = "http://127.0.0.1:8765/api/civic";
  const DEFAULT_START = "2025-01-01";
  const DEFAULT_END = "2026-12-31";
  const DEFAULT_LIMIT = 500;
  const MAX_STATE_FETCHES = 55;
  const MAX_DETAIL_FETCHES = 600;

  const _cache = new Map();

  const US_STATES = new Set([
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
    "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
    "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
    "WI", "WY", "DC",
  ]);

  const STATE_NAMES = {
    Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
    Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
    Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
    Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
    Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
    Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
    Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
    Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
    "District of Columbia": "DC",
  };

  const STRIP_PREFIXES = [
    "the ", "friends of ", "committee to elect ", "citizens to elect ",
    "citizens for ", "committee for ", "people for ", "elect ",
  ];
  const STRIP_SUFFIXES = [
    " inc", " llc", " committee", " campaign", " campaign committee",
    " principal campaign committee", " for congress", " for us congress",
    " for u s congress", " for senate", " for us senate", " for u s senate",
    " for governor", " for governor of", " for lt governor",
    " for attorney general", " for secretary of state", " for state senate",
    " for state assembly", " for state house", " for mayor",
    " for city council", " for county commissioner", " for commissioner",
    " for supervisor", " for school board", " for judge", " for sheriff",
    " for re election", " for reelection", " victory fund", " super pac",
    " pac", " political action committee",
  ];
  const STATE_TOKEN_PATTERN =
    "a[klrz]|c[aot]|d[ce]|fl|ga|hi|i[adln]|k[sy]|la|m[adeinost]|n[cdehjmvxy]|o[hk]|or|pa|ri|s[cd]|t[nx]|ut|v[at]|w[aviy]";
  const OFFICE_TOKEN_PATTERN =
    "senate|governor|house|congress|mayor|attorney general|secretary of state|state senate|state house|assembly|city council|county commissioner|commissioner|supervisor|school board|judge|sheriff";

  function normName(value) {
    if (!value) return "";
    let v = String(value)
      .toLowerCase()
      .replace(/\b(19|20)\d{2}\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    v = v
      .replace(new RegExp(`\\bfor\\s+(?:${STATE_TOKEN_PATTERN})\\s+(?:${OFFICE_TOKEN_PATTERN})\\b`, "g"), " ")
      .replace(new RegExp(`\\bfor\\s+(?:${STATE_TOKEN_PATTERN})\\s+(?:hd|sd|cd|district)?\\s*\\d{1,3}\\b`, "g"), " ")
      .replace(new RegExp(`\\bfor\\s+(?:u\\s*s|us|united states)\\s+(?:${OFFICE_TOKEN_PATTERN})\\b`, "g"), " ");
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of STRIP_PREFIXES) {
        if (v.startsWith(p)) { v = v.slice(p.length).trim(); changed = true; }
      }
      for (const s of STRIP_SUFFIXES) {
        if (v.endsWith(s)) { v = v.slice(0, -s.length).trim(); changed = true; }
      }
    }
    return v;
  }

  function tokens(value) {
    return normName(value).split(" ").filter((w) => w.length > 2);
  }

  function nameSimilarity(a, b) {
    const na = normName(a);
    const nb = normName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    const wa = tokens(na);
    const wb = new Set(tokens(nb));
    if (!wa.length || !wb.size) return 0;
    const shared = wa.filter((w) => wb.has(w)).length;
    return shared / Math.max(wa.length, wb.size);
  }

  function normalizeState(value) {
    if (!value) return "";
    const raw = String(value).trim();
    const upper = raw.toUpperCase();
    if (US_STATES.has(upper)) return upper;
    if (raw.includes("/")) {
      const parts = raw.split("/").map((p) => normalizeState(p)).filter(Boolean);
      return parts[0] || "";
    }
    return STATE_NAMES[raw.replace(/\s+/g, " ")] || "";
  }

  function isCandidateLike(row) {
    const adv = String(row.advertiser || "");
    const type = String(row.advertiserType || row.entityType || "").toLowerCase();
    const office = String(row.office || "").toLowerCase();
    if (type.includes("candidate")) return true;
    if (/\bfor\b/i.test(adv) && !/\b(pay|against|yes|no|question|prop|proposition)\b/i.test(adv)) return true;
    if (office && !/(issue|ballot|digital|other)/i.test(office) && /\bfor\b/i.test(adv)) return true;
    return false;
  }

  function normalizeElectionType(value, electionName) {
    const raw = `${value || ""} ${electionName || ""}`.toLowerCase();
    if (raw.includes("primary")) return "primary";
    if (raw.includes("general")) return "general";
    if (raw.includes("runoff")) return "runoff";
    if (raw.includes("special")) return "special";
    return raw.trim() || "unknown";
  }

  function getRaceCandidates(race) {
    if (!race) return [];
    if (Array.isArray(race.candidates)) return race.candidates;
    if (race.results && Array.isArray(race.results)) return race.results;
    return [];
  }

  function findCandidateMatch(row, race) {
    const candidates = getRaceCandidates(race);
    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const cName = candidate.name || candidate.candidateName || "";
      const score = nameSimilarity(row.advertiser, cName);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return { candidate: best, score: bestScore };
  }

  function raceOfficeScore(row, race) {
    const officeText = `${row.office || ""} ${row.raceLevel || ""}`;
    const raceText = `${race.election_name || race.name || ""} ${race.election_type || ""}`;
    const score = nameSimilarity(officeText, raceText);
    if (/governor/i.test(officeText) && /governor/i.test(raceText)) return Math.max(score, 0.9);
    if (/senate/i.test(officeText) && /senate/i.test(raceText)) return Math.max(score, 0.8);
    if (/house|congress/i.test(officeText) && /house|congress/i.test(raceText)) return Math.max(score, 0.8);
    if (/mayor/i.test(officeText) && /mayor/i.test(raceText)) return Math.max(score, 0.8);
    return score;
  }

  function hasResult(candidate, race) {
    if (!candidate) return false;
    if (candidate.winner === true) return true;
    const candidates = getRaceCandidates(race);
    const anyWinner = candidates.some((c) => c.winner === true);
    const hasVotes = candidates.some((c) => Number(c.votes || 0) > 0 || Number(c.percent || 0) > 0);
    return anyWinner || hasVotes;
  }

  function parseResultNumber(value) {
    if (value == null || value === "") return null;
    const n = Number(String(value).replace(/,/g, "").replace(/%/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function buildResult(row, race, candidate, candidateScore, raceScore) {
    const candidates = getRaceCandidates(race);
    const electionType = normalizeElectionType(race.election_type || race.type, race.election_name || race.name);
    const electionDate = race.election_date || race.date || null;
    const candidateVotes = parseResultNumber(candidate && (candidate.votes ?? candidate.voteCount ?? candidate.vote_count));
    const candidatePercent = parseResultNumber(candidate && (candidate.percent ?? candidate.voteShare ?? candidate.vote_share));
    const voteShare = candidatePercent == null
      ? null
      : (candidatePercent > 1 ? candidatePercent / 100 : candidatePercent);
    const voteValues = candidates
      .map((c) => parseResultNumber(c.votes ?? c.voteCount ?? c.vote_count))
      .filter((v) => v != null);
    const topVotes = voteValues.length ? Math.max(...voteValues) : null;
    const anyWinner = candidates.some((c) => c.winner === true);
    const realResult = hasResult(candidate, race);
    const explicitWinner = !!(candidate && candidate.winner === true);
    const inferredVoteWinner = !anyWinner && candidateVotes != null && topVotes != null && candidateVotes === topVotes && topVotes > 0;
    const winner = realResult ? (explicitWinner || inferredVoteWinner) : false;
    const lost = realResult
      ? (anyWinner ? !explicitWinner : (candidateVotes != null && topVotes != null && candidateVotes < topVotes))
      : false;

    return {
      raceId: race.id || race.raceid || race.race_id || null,
      electionType,
      electionDate,
      electionName: race.election_name || race.name || "",
      candidateName: candidate ? (candidate.name || candidate.candidateName || row.advertiser) : row.advertiser,
      party: candidate ? (candidate.party || "") : "",
      won: realResult ? winner : false,
      lost,
      votes: candidateVotes,
      voteShare,
      percentReporting: Number(race.percent_reporting || 0) || null,
      matchScore: Number((candidateScore * 0.85 + raceScore * 0.15).toFixed(3)),
      candidateScore: Number(candidateScore.toFixed(3)),
      raceScore: Number(raceScore.toFixed(3)),
      hasResult: realResult,
      source: "CivicAPI",
      certificationStatus: realResult ? "Certified - CivicAPI" : "Awaiting CivicAPI Results",
    };
  }

  function pickBestRace(row, races) {
    let best = null;
    let bestScore = 0;
    for (const race of races || []) {
      const { candidate, score: candidateScore } = findCandidateMatch(row, race);
      const officeScore = raceOfficeScore(row, race);
      const score = candidateScore * 0.85 + officeScore * 0.15;
      if (candidate && candidateScore >= 0.5 && score > bestScore) {
        best = { race, candidate, candidateScore, officeScore };
        bestScore = score;
      }
    }
    return best;
  }

  function queryString(params) {
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== "") urlParams.set(k, String(v));
    });
    return urlParams.toString();
  }

  function candidateBases() {
    const bases = [];
    if (window.location.protocol === "file:") {
      bases.push(LOCAL_PROXY_ABSOLUTE);
    }
    if (/^https?:/.test(window.location.protocol)) {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        bases.push(LOCAL_PROXY_BASE);
      }
    }
    bases.push(DIRECT_BASE);
    return bases;
  }

  async function apiGet(path) {
    const cacheKey = path;
    if (_cache.has(cacheKey)) return _cache.get(cacheKey);
    let lastError = null;
    for (const base of candidateBases()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(base + path, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) {
          lastError = new Error(`CivicAPI ${resp.status} ${path}`);
          continue;
        }
        const data = await resp.json();
        _cache.set(cacheKey, data);
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error(`CivicAPI request failed: ${path}`);
  }

  async function searchRacesByState(state, options = {}) {
    const province = normalizeState(state);
    if (!province) return [];
    const qs = queryString({
      country: "US",
      province,
      query: options.query || undefined,
      startDate: options.startDate || DEFAULT_START,
      endDate: options.endDate || DEFAULT_END,
      limit: options.limit || DEFAULT_LIMIT,
    });
    const data = await apiGet(`/race/search?${qs}`);
    return data.races || data.items || data.results || [];
  }

  async function getRaceById(raceId) {
    if (!raceId) return null;
    return apiGet(`/race/${encodeURIComponent(raceId)}?data=json`);
  }

  function officeQueriesForRows(rows) {
    const queries = new Set();
    for (const row of rows || []) {
      const text = `${row.office || ""} ${row.raceLevel || ""}`.toLowerCase();
      if (/\bsenate\b/.test(text)) queries.add("Senate");
      if (/\bgovernor\b/.test(text)) queries.add("Governor");
      if (/\bhouse\b|\bcongress\b/.test(text)) queries.add("House");
      if (/\bmayor\b/.test(text)) queries.add("Mayor");
      if (/\battorney general\b/.test(text)) queries.add("Attorney General");
      if (/\bsecretary of state\b/.test(text)) queries.add("Secretary of State");
    }
    return Array.from(queries).slice(0, 5);
  }

  function mergeRaces(...raceLists) {
    const merged = [];
    const seen = new Set();
    for (const list of raceLists) {
      for (const race of list || []) {
        const id = race.id || race.raceid || race.race_id || JSON.stringify(race).slice(0, 120);
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(race);
      }
    }
    return merged;
  }

  async function enrichAdvertisers(advertisers, options = {}) {
    const rows = (advertisers || []).filter((r) => isCandidateLike(r));
    const byState = new Map();
    rows.forEach((row) => {
      const state = normalizeState(row.state);
      if (!state) return;
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state).push(row);
    });

    advertisers.forEach((row) => {
      row.civicRace = null;
      row.hasCivicMatch = false;
      row.electionResult = null;
      row.hasElectionResult = false;
      row.primaryWon = false;
      row.primaryLost = false;
      row.generalWon = false;
      row.generalLost = false;
    });

    let stateFetches = 0;
    let detailFetches = 0;
    let civicMatches = 0;
    let resultsLoaded = 0;
    const errors = [];

    for (const [state, stateRows] of byState.entries()) {
      if (stateFetches >= MAX_STATE_FETCHES) break;
      stateFetches += 1;
      let races = [];
      try {
        const targeted = [];
        for (const query of officeQueriesForRows(stateRows)) {
          try {
            targeted.push(...await searchRacesByState(state, { ...options, query, limit: 100 }));
          } catch (err) {
            errors.push(`${state} ${query}: ${err.message || err}`);
          }
        }
        races = await searchRacesByState(state, options);
        races = mergeRaces(targeted, races);
      } catch (err) {
        errors.push(`${state}: ${err.message || err}`);
        continue;
      }

      const emitProgress = () => {
        if (typeof options.onProgress !== "function") return;
        options.onProgress({
          state,
          candidateRows: rows.length,
          statesQueried: stateFetches,
          civicMatches,
          resultsLoaded,
          errors,
        });
      };

      for (const row of stateRows) {
        const match = pickBestRace(row, races);
        if (!match) continue;

        let race = match.race;
        let candidate = match.candidate;
        let candidateScore = match.candidateScore;
        const raceId = race.id || race.raceid || race.race_id;
        if (raceId && detailFetches < MAX_DETAIL_FETCHES) {
          try {
            const detail = await getRaceById(raceId);
            if (detail && (detail.candidates || detail.election_name || detail.name)) {
              race = { ...race, ...detail };
              const detailMatch = findCandidateMatch(row, race);
              if (detailMatch.candidate && detailMatch.score >= 0.5) {
                candidate = detailMatch.candidate;
                candidateScore = detailMatch.score;
              }
              detailFetches += 1;
            }
          } catch (err) {
            // Search payload already has enough candidate context for a useful
            // dashboard match, so detail failures are non-blocking.
          }
        }

        const result = buildResult(row, race, candidate, candidateScore, match.officeScore);
        row.civicRace = result;
        row.hasCivicMatch = true;
        civicMatches += 1;

        if (result.hasResult) {
          row.electionResult = result;
          row.hasElectionResult = true;
          row.primaryWon = result.electionType === "primary" && result.won;
          row.primaryLost = result.electionType === "primary" && result.lost;
          row.generalWon = result.electionType === "general" && result.won;
          row.generalLost = result.electionType === "general" && result.lost;
          resultsLoaded += 1;
        }
        emitProgress();
      }

      emitProgress();
    }

    return {
      candidateRows: rows.length,
      statesQueried: stateFetches,
      civicMatches,
      resultsLoaded,
      errors,
    };
  }

  window.CivicAPI = {
    normName,
    nameSimilarity,
    normalizeState,
    searchRacesByState,
    getRaceById,
    enrichAdvertisers,
  };
})();
