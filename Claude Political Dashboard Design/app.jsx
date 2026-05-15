/* global React, ReactDOM */
// App shell — page switcher, slicer state, sliders state.

const Fapp = window.pbData;
const { useState: useStateApp, useMemo: useMemoApp, useEffect: useEffectApp } = React;

function App() {
  const [activePage, setActivePage] = useStateApp("overview");
  // Bumped whenever data is swapped in at runtime (e.g. admin applied a
  // fresh bundle via browser database and the user just navigated back) so the
  // memoized rows/measures pipeline re-runs.
  const [dataVersion, setDataVersion] = useStateApp(0);

  useEffectApp(() => {
    function onReload() { setDataVersion((v) => v + 1); }
    window.addEventListener("pbdata:reload", onReload);
    // Also re-render when CivicAPI election results land asynchronously
    window.addEventListener("pbdata:results", onReload);
    return () => {
      window.removeEventListener("pbdata:reload", onReload);
      window.removeEventListener("pbdata:results", onReload);
    };
  }, []);

  // Global slicers
  const [filters, setFilters] = useStateApp({
    state: "All",
    dma: "All",
    office: "All",
    raceLevel: "All",
    party: "All",
    agency: "All",
    entityType: "All",
    window: "All",
  });

  // Sliders / what-if parameters
  const [tvFloor, setTvFloor] = useStateApp(50000);
  const [cableTarget, setCableTarget] = useStateApp(0.20);
  const [cableOppFloor, setCableOppFloor] = useStateApp(25000);

  // Filtered rows + measures recomputed when filters or sliders change.
  // Note: computeMeasures mutates rows in place (attaches cableProspectFlag,
  // cableOpportunity, etc.), so we re-clone whenever ANY slider changes too —
  // otherwise dependent memos see stale per-row flags.
  const filteredRows = useMemoApp(() => {
    const filtered = Fapp.applyFilters(Fapp.advertisers, filters);
    return filtered.map((r) => ({ ...r }));
  }, [filters, tvFloor, cableTarget, cableOppFloor, dataVersion]);

  const measures = useMemoApp(() => {
    return Fapp.computeMeasures(filteredRows, {
      tvSpendFloor: tvFloor,
      cableShareTarget: cableTarget,
      cableOppFloor: cableOppFloor,
    });
  }, [filteredRows, tvFloor, cableTarget, cableOppFloor]);

  function calendarStateOptions() {
    const s = new Set();
    (Fapp.POLITICAL_WINDOWS || []).forEach((w) => {
      String(w.state || "")
        .split(/[\/,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => s.add(x));
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }

  function calendarDmaOptions() {
    const s = new Set();
    (Fapp.POLITICAL_WINDOWS || []).forEach((w) => {
      const dma = w.dma || w.market;
      if (dma) s.add(dma);
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }

  // State and DMA options are intentionally limited to the maintained
  // political-window calendar so off-calendar markets never appear in the
  // prospecting UI. Other slicers still come from the full advertiser book.
  const slicerOptions = useMemoApp(() => ({
    state:    calendarStateOptions(),
    dma:      calendarDmaOptions(),
    office:   Fapp.uniqueSorted(Fapp.advertisers, "office"),
    raceLevel:Fapp.uniqueSorted(Fapp.advertisers, "raceLevel"),
    party:    Fapp.uniqueSorted(Fapp.advertisers, "party"),
    agency:   Fapp.uniqueSorted(Fapp.advertisers, "agency"),
    entityType: Fapp.ENTITY_TYPES || Fapp.uniqueSorted(Fapp.advertisers, "entityType"),
    window:   Fapp.WINDOW_STATUS,
  }), [dataVersion]);

  function onClearFilters() {
    setFilters({
      state: "All", dma: "All", office: "All", raceLevel: "All",
      party: "All", agency: "All", entityType: "All", window: "All",
    });
  }

  return (
    <Stage>
      <PBIHeader
        snapshot={Fapp.SNAPSHOT_DATE}
        rowCount={Fapp.advertisers.length}
        source={Fapp.source}
        resultsStatus={Fapp.ELECTION_RESULTS_STATUS}
        onExportPowerBI={() => Fapp.downloadPowerBIWorkbook()}
      />
      <div className="page-body">
        <SlicerDrawer
          filters={filters}
          setFilters={setFilters}
          options={slicerOptions}
          onClear={onClearFilters}
        />
        {activePage === "overview"  && <OverviewPage   filteredRows={filteredRows} measures={measures} filters={filters} />}
        {activePage === "prospects" && <ProspectsPage  filteredRows={filteredRows} measures={measures} filters={filters}
                                          tvFloor={tvFloor} setTvFloor={setTvFloor}
                                          cableTarget={cableTarget} setCableTarget={setCableTarget}
                                          cableOppFloor={cableOppFloor} setCableOppFloor={setCableOppFloor} />}
        {activePage === "trend"     && <TrendPage      filteredRows={filteredRows} filters={filters} />}
        {activePage === "detail"    && <DetailPage     filteredRows={filteredRows} filters={filters} />}
        {activePage === "race"      && <RacePage       filteredRows={filteredRows} filters={filters} />}
        {activePage === "calendar"  && <CalendarPage   filteredRows={filteredRows} filters={filters} />}
        {activePage === "pac"       && <PacPage        filters={filters} />}
        {activePage === "results"   && <CompletedPage  filteredRows={filteredRows} filters={filters} />}
        {activePage === "casestudy" && <CaseStudyPage  filteredRows={filteredRows} filters={filters} />}
        {activePage === "health"    && <HealthPage     filteredRows={filteredRows} filters={filters} />}
      </div>
      <PBITabs active={activePage} onChange={setActivePage} />
    </Stage>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
