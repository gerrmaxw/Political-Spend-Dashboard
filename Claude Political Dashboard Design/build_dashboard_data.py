"""Aggregate the political-spend source xlsx files into JSON the dashboard consumes.

Sources (positional args, all optional except the first):
  1. Curated PowerBI xlsx (FactSpendCurrent: Broadcast/CTV/Cable/Radio)
  2. Cross tab xlsx     (Digital spend by Advertiser, Election State, week)
  3. Cash on Hand xlsx  (per-advertiser cash on hand + cycle spend)
  4. (output) JSON path; defaults to ./data.json

The curated xlsx is the spine: each row is one aggregated (Advertiser, State,
DMA, Office) entry with broadcast/cable/ctv/radio columns. We then merge:

  • Digital  → aggregated by Advertiser from Cross tab, then injected onto
    each advertiser's largest-spend market row (digital isn't DMA-specific
    in this dataset; the file uses DMA="Addressable").
  • Cash on hand / cycle spend → matched by normalized Advertiser name from
    the COH file, attached to every row of that advertiser.

The output is the same JSON shape `data.js` already consumes, with two new
fields per advertiser row: `cashOnHand`, `cycleSpend`. Digital appears in
the existing `digital` column.
"""
import json, sys, zipfile, re
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NSP = f"{{{NS}}}"


# ---------- xlsx helpers ----------------------------------------------------

def col_letter_to_idx(letters):
    n = 0
    for c in letters:
        n = n * 26 + (ord(c.upper()) - ord('A') + 1)
    return n - 1

def parse_cell_ref(ref):
    i = 0
    while i < len(ref) and ref[i].isalpha():
        i += 1
    return col_letter_to_idx(ref[:i])

def load_shared_strings(z):
    if 'xl/sharedStrings.xml' not in z.namelist():
        return []
    with z.open('xl/sharedStrings.xml') as f:
        tree = ET.parse(f)
    out = []
    for si in tree.getroot().findall(f'{NSP}si'):
        out.append(''.join(t.text or '' for t in si.iter(f'{NSP}t')))
    return out

def get_sheet_paths(z):
    """Return {sheet name → internal xml path}."""
    with z.open('xl/workbook.xml') as f:
        wb = ET.parse(f).getroot()
    sheets = {}
    rel_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    for s in wb.iter(f'{NSP}sheet'):
        sheets[s.get('name')] = s.get(f'{{{rel_ns}}}id')
    with z.open('xl/_rels/workbook.xml.rels') as f:
        rels = ET.parse(f).getroot()
    rel_map = {r.get('Id'): r.get('Target') for r in rels}
    out = {}
    for name, rid in sheets.items():
        tgt = rel_map.get(rid, '')
        tgt = tgt.lstrip('/').replace('xl/', '', 1) if tgt.startswith('/') else tgt.lstrip('./')
        out[name] = 'xl/' + tgt if not tgt.startswith('xl/') else tgt
    return out

def iter_rows(z, sheet_path, shared):
    """Yield rows as lists indexed by column position."""
    with z.open(sheet_path) as f:
        for ev, el in ET.iterparse(f, events=('end',)):
            if el.tag != f'{NSP}row':
                continue
            cells = {}
            for c in el.findall(f'{NSP}c'):
                ref = c.get('r')
                if ref is None:
                    continue
                idx = parse_cell_ref(ref)
                t = c.get('t')
                v = c.find(f'{NSP}v')
                val = None
                if v is not None and v.text is not None:
                    if t == 's':
                        val = shared[int(v.text)]
                    elif t == 'b':
                        val = v.text == '1'
                    elif t in ('str', 'inlineStr'):
                        val = v.text
                    else:
                        try: val = float(v.text)
                        except ValueError: val = v.text
                else:
                    is_el = c.find(f'{NSP}is')
                    if is_el is not None:
                        val = ''.join(t.text or '' for t in is_el.iter(f'{NSP}t'))
                cells[idx] = val
            if not cells:
                el.clear()
                continue
            max_idx = max(cells)
            yield [cells.get(i) for i in range(max_idx + 1)]
            el.clear()


# ---------- normalization helpers -------------------------------------------

_NAME_STRIP_PREFIXES = (
    'the ', 'friends of ', 'committee to elect ', 'citizens to elect ',
    'citizens for ', 'committee for ', 'people for ',
)
_NAME_STRIP_SUFFIXES = (
    ' inc', ' llc', ' the', ' committee', ' campaign',
    ' for congress', ' for us congress', ' for u s congress',
    ' for senate', ' for us senate', ' for u s senate',
    ' for governor', ' for governor of', ' for lt governor',
    ' for attorney general', ' for secretary of state',
    ' for state senate', ' for state assembly', ' for state house',
    ' for mayor', ' for re election', ' for reelection',
    ' victory fund', ' super pac', ' pac', ' political action committee',
    ' campaign committee', ' principal campaign committee',
)

def norm_name(s):
    """Loose-match key for advertiser strings.

    Lowercases, collapses non-alphanumerics, then strips a generous set of
    PAC / committee / campaign suffixes and a handful of common prefixes
    (Friends of X, The X, Citizens for X) iteratively until stable. The aim
    is to collapse the many surface forms of the same political entity into
    a single match key across Vivvix / Cross tab / FEC feeds.
    """
    if not s:
        return ''
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    s = re.sub(r'\s+', ' ', s)
    changed = True
    while changed:
        changed = False
        for pre in _NAME_STRIP_PREFIXES:
            if s.startswith(pre):
                s = s[len(pre):]
                changed = True
        for suf in _NAME_STRIP_SUFFIXES:
            if s.endswith(suf):
                s = s[: -len(suf)]
                changed = True
        s = s.strip()
    return s


# ---------- 1. curated PBI spine --------------------------------------------

def build_advertiser_rows(curated_path):
    print(f"[1/3] Reading curated PBI xlsx: {curated_path}", file=sys.stderr)
    with zipfile.ZipFile(curated_path) as z:
        shared = load_shared_strings(z)
        sheets = get_sheet_paths(z)

        spend_iter = iter_rows(z, sheets['WS_FactSpendCurrent'], shared)
        header = next(spend_iter)
        idx = {h: i for i, h in enumerate(header) if h is not None}
        def g(row, k):
            i = idx.get(k)
            return row[i] if i is not None and i < len(row) else None

        agg = defaultdict(lambda: {
            'advertiser': '', 'advertiserType': '', 'agency': '',
            'state': '', 'dma': '', 'office': '',
            'election': '', 'raceLevel': '', 'party': '',
            'broadcast': 0.0, 'cable': 0.0, 'ctv': 0.0,
            'digital': 0.0, 'radio': 0.0,
            'inWindow': False,
        })
        n = 0
        for row in spend_iter:
            adv = g(row, 'Advertiser') or ''
            state = g(row, 'State') or ''
            dma = g(row, 'DMA') or ''
            office = g(row, 'Office') or ''
            mt = (g(row, 'MediaType') or '').strip().lower()
            amt = g(row, 'Amount') or 0.0
            if not isinstance(amt, (int, float)):
                try: amt = float(amt)
                except: amt = 0.0
            if not adv:
                continue
            key = (adv, state, dma, office)
            a = agg[key]
            a['advertiser']     = adv
            a['advertiserType'] = g(row, 'AdvertiserType') or a['advertiserType']
            a['agency']         = g(row, 'Agency')         or a['agency']
            a['state']          = state
            a['dma']            = dma
            a['office']         = office
            a['election']       = g(row, 'Election')       or a['election']
            a['raceLevel']      = g(row, 'RaceLevel')      or a['raceLevel']
            a['party']          = g(row, 'Party')          or a['party']
            if   mt == 'broadcast': a['broadcast'] += amt
            elif mt == 'cable':     a['cable']     += amt
            elif mt == 'ctv':       a['ctv']       += amt
            elif mt == 'digital':   a['digital']   += amt
            elif mt == 'radio':     a['radio']     += amt
            iw = g(row, 'InPoliticalWindowMarket')
            if iw in (1, 1.0, True, 'TRUE', 'True', 'true'):
                a['inWindow'] = True
            n += 1
            if n % 5000 == 0:
                print(f"  …read {n} spend rows", file=sys.stderr)

        # Political windows lookup → window status / days
        win_lookup = {}
        pw_path = sheets.get('WS_FactPolWindows')
        if pw_path:
            piw = iter_rows(z, pw_path, shared)
            ph = next(piw)
            pidx = {h: i for i, h in enumerate(ph) if h is not None}
            def pg(r, k):
                i = pidx.get(k)
                return r[i] if i is not None and i < len(r) else None
            rank = {'In Window': 4, 'Opening Next 30': 3, 'Future': 2, 'Completed': 1}
            for row in piw:
                st  = pg(row, 'State') or pg(row, 'StateName') or ''
                dma = pg(row, 'DMA')   or pg(row, 'DMAName')   or ''
                ws  = pg(row, 'WindowStatus') or ''
                dte = pg(row, 'DaysToElection')
                try: dte = int(dte) if dte is not None else None
                except: dte = None
                key = (st, dma)
                cur = win_lookup.get(key)
                if cur is None or rank.get(ws, 0) > rank.get(cur['status'], 0):
                    win_lookup[key] = {'status': ws, 'days': dte}

        # Snapshot meta
        snap_path = sheets.get('WS_DimSnapshot')
        snapshot_date = ''
        if snap_path:
            si = iter_rows(z, snap_path, shared)
            next(si)
            for row in si:
                if row and row[0]:
                    snapshot_date = str(row[0])
                    break

        unmatched = 0
        unm_path = sheets.get('WS_QAUnmatchedAdvertisers')
        if unm_path:
            ui = iter_rows(z, unm_path, shared); next(ui)
            for _ in ui: unmatched += 1

        pw_count = 0
        if pw_path:
            piw = iter_rows(z, pw_path, shared); next(piw)
            for _ in piw: pw_count += 1

    print(f"  spend rows read: {n}; unique (adv,state,dma,office) keys: {len(agg)}", file=sys.stderr)

    rows = []
    i = 1
    for (adv, st, dma, office), a in agg.items():
        tv = a['broadcast'] + a['cable'] + a['ctv']
        total = tv + a['digital'] + a['radio']
        if total <= 0:
            continue
        win = win_lookup.get((st, dma), {'status': 'Future', 'days': None})
        rows.append({
            'advertiserKey': i,
            'advertiser':     adv,
            'advertiserType': a['advertiserType'],
            'agency':         a['agency'] or 'Direct (No Agency)',
            'state':          st or 'Unknown',
            'dma':            dma or 'Unknown',
            'office':         office or 'Unknown',
            'raceLevel':      a['raceLevel'] or 'State Legislature',
            'party':          a['party'] or 'Issue',
            'broadcast':      round(a['broadcast'], 2),
            'cable':          round(a['cable'],     2),
            'ctv':            round(a['ctv'],       2),
            'digital':        round(a['digital'],   2),
            'radio':          round(a['radio'],     2),
            'total':          round(total,          2),
            'tvSpend':        round(tv,             2),
            'bcCtvSpend':     round(a['broadcast'] + a['ctv'], 2),
            'cableShare':     round((a['cable']/tv) if tv > 0 else 0, 5),
            'windowStatus':   win['status'] or 'Future',
            'daysToElection': win['days'] if win['days'] is not None else 174,
            'inWindow':       a['inWindow'],
            'cashOnHand':     None,
            'cycleSpend':     None,
        })
        i += 1

    return rows, {
        'snapshotDate': snapshot_date,
        'politicalWindowsLoaded': pw_count,
        'unmatchedAdvertiserCount': unmatched,
    }


# ---------- 2. Digital from Cross tab ---------------------------------------

def aggregate_digital(cross_tab_path):
    """Aggregate Digital from Cross tab → {norm_name: {amount, state, advertiser}}.

    Keys are normalized advertiser names so they can be joined to the curated
    PBI rows. We also keep a representative display name and the most-common
    Election State so unmatched advertisers still surface with useful metadata.
    """
    print(f"[2/3] Reading Cross tab (digital): {cross_tab_path}", file=sys.stderr)
    out = defaultdict(lambda: {'amount': 0.0, 'advertiser': '', 'state_counts': defaultdict(int)})
    with zipfile.ZipFile(cross_tab_path) as z:
        shared = load_shared_strings(z)
        sheets = get_sheet_paths(z)
        sheet_path = list(sheets.values())[0]
        it = iter_rows(z, sheet_path, shared)
        header = next(it)
        idx = {h: i for i, h in enumerate(header) if h is not None}
        adv_i = idx.get('Advertiser')
        st_i  = idx.get('Election State')
        mt_i  = idx.get('ATV_MEDIA_TYPE')
        amt_i = idx.get('Gross Spending/Share')
        if adv_i is None or mt_i is None or amt_i is None:
            raise RuntimeError(f"Cross tab missing expected columns; saw: {header}")
        n = 0
        for row in it:
            mt = str(row[mt_i] if mt_i < len(row) else '').strip().lower()
            if mt != 'digital':
                continue
            adv = row[adv_i] if adv_i < len(row) else None
            if not adv: continue
            amt = row[amt_i] if amt_i < len(row) else 0
            try: amt = float(amt)
            except: amt = 0.0
            st  = str(row[st_i] if (st_i is not None and st_i < len(row)) else '').strip()
            k = norm_name(adv)
            d = out[k]
            d['amount'] += amt
            if not d['advertiser']:
                d['advertiser'] = adv
            if st:
                d['state_counts'][st] += 1
            n += 1
            if n % 100_000 == 0:
                print(f"  …processed {n} digital rows", file=sys.stderr)
    # Reduce state_counts → single dominant state
    for k, d in out.items():
        if d['state_counts']:
            d['state'] = max(d['state_counts'].items(), key=lambda kv: kv[1])[0]
        else:
            d['state'] = 'Unknown'
        del d['state_counts']
    total = sum(d['amount'] for d in out.values())
    print(f"  digital advertisers: {len(out)}; total digital $: {total:,.0f}", file=sys.stderr)
    return out


# ---------- 3. Cash on Hand --------------------------------------------------

def aggregate_cash_on_hand(coh_path):
    """Returns {norm_advertiser_name: {cashOnHand, cycleSpend, fecId}}."""
    print(f"[3/3] Reading Cash on Hand: {coh_path}", file=sys.stderr)
    by_adv = {}
    with zipfile.ZipFile(coh_path) as z:
        shared = load_shared_strings(z)
        sheets = get_sheet_paths(z)
        sheet_path = list(sheets.values())[0]
        it = iter_rows(z, sheet_path, shared)
        header = next(it)
        idx = {h: i for i, h in enumerate(header) if h is not None}
        adv_i = idx.get('Advertiser')
        fec_i = idx.get('Fec Id')
        coh_i = idx.get('Cash on Hand')
        # "Blank" column carries the same magnitude as Cash on Hand with
        # opposite sign — we prefer the positive value.
        blk_i = idx.get('Blank')
        spend_i = idx.get('Sorting AA')
        if adv_i is None:
            raise RuntimeError(f"COH missing Advertiser column; saw: {header}")
        for row in it:
            adv = row[adv_i] if adv_i is not None and adv_i < len(row) else None
            if not adv:
                continue
            k = norm_name(adv)
            if k in by_adv:
                continue  # one row per advertiser is enough; the file repeats per agency
            def _num(i):
                if i is None or i >= len(row): return None
                v = row[i]
                if v is None: return None
                try: return float(v)
                except: return None
            coh = _num(blk_i)
            if coh is None:
                cn = _num(coh_i)
                coh = abs(cn) if cn is not None else None
            spend = _num(spend_i)
            fec = row[fec_i] if fec_i is not None and fec_i < len(row) else None
            by_adv[k] = {
                'cashOnHand': round(coh, 2) if coh is not None else None,
                'cycleSpend': round(spend, 2) if spend is not None else None,
                'fecId': str(fec) if fec else None,
            }
    print(f"  cash-on-hand records: {len(by_adv)}", file=sys.stderr)
    return by_adv


# ---------- merge -----------------------------------------------------------

def merge_extras(adv_rows, digital_by_adv, coh_by_adv):
    """Inject Digital and Cash-on-Hand into the advertiser row set.

    Logic:
      • Digital is "Addressable" in the source (no DMA targeting). We create
        ONE synthetic row per (advertiser, state) with DMA='Addressable' and
        Office='Digital'. This keeps the digital total visible in tables
        without polluting any one DMA's broadcast/cable share.
      • Advertisers in the digital feed that don't match the curated PBI
        spine still get an Addressable row — their data is preserved with
        whatever metadata we can pull from Cross tab (Election State only).
      • Cash on Hand attaches to every row of a matched advertiser so any
        filter combination still surfaces the funding context.

    Returns a new list of advertiser rows.
    """
    rows_by_adv = defaultdict(list)
    for r in adv_rows:
        rows_by_adv[norm_name(r['advertiser'])].append(r)

    # ---- Digital → Addressable rows -------------------------------------
    new_rows = []
    digital_matched = 0
    digital_total_merged = 0.0
    digital_unmatched_rows = 0
    digital_unmatched_total = 0.0
    for k, d in digital_by_adv.items():
        amt = d['amount']
        if amt <= 0: continue
        rs = rows_by_adv.get(k)
        if rs:
            # Pull metadata from the advertiser's largest curated row.
            rs.sort(key=lambda r: r['total'], reverse=True)
            tmpl = rs[0]
            new_rows.append({
                'advertiser':     tmpl['advertiser'],
                'advertiserType': tmpl.get('advertiserType', ''),
                'agency':         tmpl.get('agency', 'Direct (No Agency)'),
                'state':          tmpl.get('state', d.get('state', 'Unknown')),
                'dma':            'Addressable',
                'office':         'Digital',
                'election':       '',
                'raceLevel':      tmpl.get('raceLevel', 'State Legislature'),
                'party':          tmpl.get('party', 'Issue'),
                'broadcast': 0.0, 'cable': 0.0, 'ctv': 0.0,
                'digital':        round(amt, 2),
                'radio': 0.0,
                'inWindow':       tmpl.get('inWindow', False),
                'windowStatus':   tmpl.get('windowStatus', 'Future'),
                'daysToElection': tmpl.get('daysToElection', 174),
                'cashOnHand':     None, 'cycleSpend': None, 'fecId': None,
            })
            digital_matched += 1
            digital_total_merged += amt
        else:
            # No curated match — still surface this advertiser as digital-only.
            new_rows.append({
                'advertiser':     d['advertiser'],
                'advertiserType': 'Unknown',
                'agency':         'Direct (No Agency)',
                'state':          d.get('state', 'Unknown'),
                'dma':            'Addressable',
                'office':         'Digital',
                'election':       '',
                'raceLevel':      'State Legislature',
                'party':          'Issue',
                'broadcast': 0.0, 'cable': 0.0, 'ctv': 0.0,
                'digital':        round(amt, 2),
                'radio': 0.0,
                'inWindow':       False,
                'windowStatus':   'Future',
                'daysToElection': 174,
                'cashOnHand':     None, 'cycleSpend': None, 'fecId': None,
            })
            digital_unmatched_rows += 1
            digital_unmatched_total += amt

    adv_rows.extend(new_rows)

    # Rebuild lookup including the newly added Addressable rows so COH
    # attaches to them too.
    rows_by_adv = defaultdict(list)
    for r in adv_rows:
        rows_by_adv[norm_name(r['advertiser'])].append(r)

    # ---- Cash on Hand → attach to every row of advertiser ---------------
    coh_matched = 0
    for k, info in coh_by_adv.items():
        rs = rows_by_adv.get(k)
        if not rs: continue
        for r in rs:
            r['cashOnHand'] = info['cashOnHand']
            r['cycleSpend'] = info['cycleSpend']
            r['fecId']      = info['fecId']
        coh_matched += 1

    print(f"  digital matched: {digital_matched}/{len(digital_by_adv)} (${digital_total_merged:,.0f}) — created {digital_matched} Addressable rows", file=sys.stderr)
    print(f"  digital unmatched-but-preserved: {digital_unmatched_rows} (${digital_unmatched_total:,.0f}) — created as digital-only rows", file=sys.stderr)
    print(f"  cash-on-hand advertisers attached: {coh_matched}/{len(coh_by_adv)}", file=sys.stderr)


# ---------- main ------------------------------------------------------------

def write_merged_xlsx(rows, meta, digital_by_adv, coh_by_adv, out_xlsx_path):
    """Emit a single xlsx that the dashboard's Upload Snapshot button can ingest.

    Sheets:
      • WS_FactSpendCurrent — one row per advertiser/market/media-type (so
        the client-side aggregator in data.js produces the same totals,
        Digital included).
      • WS_FactPolWindows — pass-through window status for State/DMA.
      • WS_DimSnapshot — snapshot date.
      • WS_QAUnmatchedAdvertisers — count of unmatched names.
      • WS_CashOnHand — advertiser → cash on hand / cycle spend / FEC id.
    """
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)

    # ---- WS_FactSpendCurrent: one row per (advertiser, market, media) ----
    sc = wb.create_sheet("WS_FactSpendCurrent")
    headers = ["Advertiser","AdvertiserType","Agency","State","DMA","Office",
               "Election","RaceLevel","Party","MediaType","Amount","GrossSpending",
               "InPoliticalWindowMarket"]
    sc.append(headers)
    for r in rows:
        for media_key, media_name in (("broadcast","Broadcast"),("cable","Cable"),
                                       ("ctv","CTV"),("digital","Digital"),
                                       ("radio","Radio")):
            amt = r.get(media_key) or 0
            if amt <= 0:
                continue
            sc.append([
                r.get("advertiser",""), r.get("advertiserType",""),
                r.get("agency",""),     r.get("state",""),
                r.get("dma",""),        r.get("office",""),
                "",                     r.get("raceLevel",""),
                r.get("party",""),      media_name,
                amt, amt, 1 if r.get("inWindow") else 0,
            ])

    # ---- WS_FactPolWindows: reconstruct from advertiser rows -------------
    pw = wb.create_sheet("WS_FactPolWindows")
    pw.append(["State","DMA","WindowStatus","DaysToElection"])
    seen = set()
    for r in rows:
        k = (r.get("state",""), r.get("dma",""))
        if k in seen: continue
        seen.add(k)
        pw.append([k[0], k[1], r.get("windowStatus","Future"), r.get("daysToElection")])

    # ---- WS_DimSnapshot --------------------------------------------------
    ds = wb.create_sheet("WS_DimSnapshot")
    ds.append(["SnapshotDate","Cycle","SnapshotKey","Notes","Status","Source"])
    ds.append([meta.get("snapshotDate",""), 2026, "S001", "Merged Political+Digital+COH", "Active", "build_dashboard_data.py"])

    # ---- WS_QAUnmatchedAdvertisers --------------------------------------
    qa = wb.create_sheet("WS_QAUnmatchedAdvertisers")
    qa.append(["UnmatchedAdvertiser"])
    for _ in range(meta.get("unmatchedAdvertiserCount", 0)):
        qa.append([""])

    # ---- WS_CashOnHand (new) --------------------------------------------
    coh = wb.create_sheet("WS_CashOnHand")
    coh.append(["Advertiser","FecId","CashOnHand","CycleSpend"])
    seen_adv = set()
    for r in rows:
        if not r.get("cashOnHand"): continue
        norm = norm_name(r.get("advertiser",""))
        if norm in seen_adv: continue
        seen_adv.add(norm)
        coh.append([r["advertiser"], r.get("fecId") or "", r["cashOnHand"], r.get("cycleSpend")])

    wb.save(out_xlsx_path)
    print(f"  → wrote merged xlsx: {out_xlsx_path}", file=sys.stderr)


def main():
    args = sys.argv[1:]
    curated = args[0] if len(args) > 0 else "/Users/gerritmaxwell/Documents/Codex/2026-05-13/files-mentioned-by-the-user-election/Political Spend Dashboard/outputs/Political_Spend_Curated_Model_2026-05-13_PowerBI_NamedTables.xlsx"
    cross   = args[1] if len(args) > 1 else "/Users/gerritmaxwell/Documents/Codex/2026-05-13/files-mentioned-by-the-user-election/Political Spend Dashboard/outputs/Cross_tab_data.xlsx"
    coh     = args[2] if len(args) > 2 else "/Users/gerritmaxwell/Documents/Codex/2026-05-13/files-mentioned-by-the-user-election/Political Spend Dashboard/outputs/Cash_on_hand_data.xlsx"
    out     = args[3] if len(args) > 3 else "/Users/gerritmaxwell/Documents/Codex/2026-05-13/files-mentioned-by-the-user-election/Claude Political Dashboard Design/data.json"

    rows, meta = build_advertiser_rows(curated)

    if Path(cross).exists():
        digital = aggregate_digital(cross)
    else:
        print(f"  (cross tab xlsx not found at {cross} — Digital will stay $0)", file=sys.stderr)
        digital = {}

    if Path(coh).exists():
        coh_map = aggregate_cash_on_hand(coh)
    else:
        print(f"  (cash on hand xlsx not found at {coh} — COH will be null)", file=sys.stderr)
        coh_map = {}

    merge_extras(rows, digital, coh_map)

    # Recompute downstream derived columns now that digital may have changed.
    for r in rows:
        tv = r['broadcast'] + r['cable'] + r['ctv']
        r['tvSpend']    = round(tv, 2)
        r['bcCtvSpend'] = round(r['broadcast'] + r['ctv'], 2)
        r['cableShare'] = round((r['cable']/tv) if tv > 0 else 0, 5)
        r['total']      = round(r['broadcast'] + r['cable'] + r['ctv'] + r['digital'] + r['radio'], 2)

    # Sort by total spend, keep all rows.
    rows.sort(key=lambda r: r['total'], reverse=True)
    for i, r in enumerate(rows, 1):
        r['advertiserKey'] = i

    out_obj = {
        'snapshotDate':              meta['snapshotDate'],
        'politicalWindowsLoaded':    meta['politicalWindowsLoaded'],
        'unmatchedAdvertiserCount':  meta['unmatchedAdvertiserCount'],
        'totalAdvertiserKeys':       len(rows),
        'rowsIncluded':              len(rows),
        'advertisers':               rows,
    }
    with open(out, 'w') as f:
        json.dump(out_obj, f, separators=(',', ':'))
    print(f"Wrote {out}: {len(rows)} advertiser rows", file=sys.stderr)

    # Also emit a single merged xlsx that the dashboard's "Upload snapshot"
    # button can ingest directly — Digital is rolled into FactSpendCurrent
    # and Cash on Hand lives in its own sheet.
    out_xlsx = Path(out).with_name("Political_Spend_Merged.xlsx")
    try:
        write_merged_xlsx(rows, meta, digital, coh_map, str(out_xlsx))
    except Exception as e:
        print(f"  (skipped xlsx write: {e})", file=sys.stderr)


if __name__ == '__main__':
    main()
