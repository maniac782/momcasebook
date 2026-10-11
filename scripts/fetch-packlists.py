"""Builds js/packlists.js: a packing list for every Valkyrie scenario (which tiles and monster figures to take out of
the box), the website version of Dan's packlist tool (github.com/maniac782/valkyrie-tools, packlist/).

For each scenario in the Valkyrie catalogue it downloads the scenario file (<url><key>.valkyrie, a zip of .ini files),
finds the tiles and monsters it adds, and labels each with:
- its number in the community Mansions of Madness Tiles Index v5.2 (scripts/tiles_index.py, read from that PDF by
  scripts/tiles-index-from-pdf.py), and the set whose symbol is printed on it;
- the box it comes in and its printed name, from Valkyrie's own game-content files (github.com/NPBruce/valkyrie,
  Apache 2.0): unity/Assets/StreamingAssets/content/MoM. First-edition content counts as the box that reprints it:
  Recurring Nightmares (first-edition base game, Conversion Kit) and Suppressed Memories (Forbidden Alchemy, Call of the
  Wild), as in Valkyrie.
Only names, numbers and box labels are kept; no artwork.

Run: python3 scripts/fetch-packlists.py --content <valkyrie>/unity/Assets/StreamingAssets/content/MoM
                                       [--manifest <manifestDownload.ini or URL>] [--cache <folder of .valkyrie files>]
A scenario whose catalogue version hasn't changed keeps its existing list, so the weekly refresh only downloads new or
updated ones. Writes changed=true to $GITHUB_OUTPUT (as packlists_changed) when the file changes."""
import argparse, configparser, io, json, os, re, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tiles_index import TILE_INDEX  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'js', 'packlists.js')
MANIFEST_URL = 'https://raw.githubusercontent.com/NPBruce/valkyrie-store/master/MoM/manifestDownload.ini'

# Valkyrie content pack id -> the box it's in (ids as in js/catalog.js PRODUCTS)
PACK_BOX = {'MoMBase': 'core', 'RN': 'rn', 'SM': 'sm', 'BtT': 'btt', 'SoA': 'soa', 'SoT': 'sot', 'HJ': 'hj', 'PotS': 'pots',
            'MoM1ET': 'rn', 'MoM1EM': 'rn', 'MoM1EI': 'rn', 'MoM1CK': 'rn',
            'FAT': 'sm', 'FAM': 'sm', 'FAI': 'sm', 'CotWT': 'sm', 'CotWM': 'sm', 'CotWI': 'sm'}
# Valkyrie content pack id -> the set whose symbol is printed on the tile or figure (first-edition content keeps its
# first-edition symbol in the boxes that reprint it)
PACK_SET = {'MoMBase': '2e', 'BtT': 'btt', 'SoA': 'soa', 'SoT': 'sot', 'HJ': 'hj', 'PotS': 'pots',
            'MoM1ET': '1e', 'MoM1EM': '1e', 'MoM1EI': '1e', 'MoM1CK': '1e', 'RN': '1e',
            'FAT': 'fa', 'FAM': 'fa', 'FAI': 'fa', 'CotWT': 'cotw', 'CotWM': 'cotw', 'CotWI': 'cotw', 'SM': 'cotw'}
SMALL = {'of', 'the', 'and', 'a', 'an', 'in', 'on', 'to', 'at'}


def ini_sections(text):
    """A forgiving .ini reader: {section: {key: value}} (later keys win), comments skipped."""
    out, cur = {}, None
    for line in text.splitlines():
        s = line.strip()
        if not s or s[0] in ';#':
            continue
        m = re.match(r'^\[([^\]]+)\]', s)
        if m:
            cur = out.setdefault(m.group(1).strip(), {})
            continue
        if cur is not None and '=' in s:
            k, v = s.split('=', 1)
            cur[k.strip().lower()] = v.strip()
    return out


def nice(key, prefix):
    """{ffg:TILE_ALLEY_CORNER_1_MAD20} -> Alley Corner 1; {ffg:MONSTER_PRIEST_OF_DAGON} -> Priest of Dagon."""
    k = re.sub(r'^\{ffg:|\}$', '', key or '')
    k = re.sub('^' + prefix + '_', '', k)
    k = re.sub(r'_(MAD\d+\w*|1E|FA|COTW)$', '', k)
    words = [w.lower() for w in k.split('_') if w]
    out = ' '.join(w if (i and w in SMALL) else w.capitalize() for i, w in enumerate(words))
    out = re.sub(r'^Unique Monster ', '', out)
    return out.replace('Mi Go', 'Mi-Go')


def camel(name, prefix):
    """TileSideGuestBedroom -> Guest Bedroom (when the content files have no name)."""
    b = re.sub('^' + prefix, '', name)
    b = re.sub(r'^TLE', '', b)  # a fan-made tile pack's prefix
    b = re.sub(r'(MAD\d+|1E|FA)$', '', b)
    b = re.sub(r'([a-z])([A-Z0-9])', r'\1 \2', b)
    return ' '.join(w.lower() if i and w.lower() in SMALL else w for i, w in enumerate(b.split()))


def load_content(root):
    """Every tile side and monster in Valkyrie's game content: name, box, set, number and (tiles) the side on the back.
    A side can be defined by more than one pack (Campsite is in Call of the Wild and Path of the Serpent), so each side
    maps to a list of definitions."""
    tiles, monsters = {}, {}
    for dirpath, _, files in os.walk(root):
        if 'content_pack.ini' not in files:
            continue
        pack = ini_sections(open(os.path.join(dirpath, 'content_pack.ini'), encoding='utf-8-sig').read()).get('ContentPack', {}).get('id', '')
        box = PACK_BOX.get(pack)
        if not box:
            continue
        if 'tiles.ini' in files:
            for sec, d in ini_sections(open(os.path.join(dirpath, 'tiles.ini'), encoding='utf-8-sig').read()).items():
                if sec.startswith('TileSide'):
                    tiles.setdefault(sec, []).append({'n': nice(d.get('name'), 'TILE') or camel(sec, 'TileSide'), 'x': box,
                                                      'e': PACK_SET.get(pack, ''), 'back': d.get('reverse', ''), 'pack': pack,
                                                      'i': TILE_INDEX.get(pack + ':' + sec, '')})
        if 'monsters.ini' in files:
            for sec, d in ini_sections(open(os.path.join(dirpath, 'monsters.ini'), encoding='utf-8-sig').read()).items():
                if sec.startswith('Monster'):
                    monsters[sec] = {'n': nice(d.get('name'), 'MONSTER') or camel(sec, 'Monster'), 'x': box, 'e': PACK_SET.get(pack, '')}
    # a side the index doesn't list is still on a numbered tile: use the number of the side on its back
    for side, defs in tiles.items():
        for d in defs:
            if not d['i']:
                back = [b for b in tiles.get(d['back'], []) if b['pack'] == d['pack'] and b['i']]
                if back:
                    d['i'] = back[0]['i']
    return tiles, monsters


def side_def(side, tiles, boxes):
    """The definition of a side for this scenario: when two packs define it, the one from a box the scenario uses."""
    defs = tiles.get(side) or []
    if len(defs) > 1:
        pick = [d for d in defs if d['x'] in boxes]
        if len(pick) == 1:
            return pick[0], []
        return defs[0], defs[1:]
    return (defs[0] if defs else {}), []


def idx_key(i):
    m = re.match(r'^(\d+)([SML])$', i or '')
    return (0, 'SML'.index(m.group(2)), int(m.group(1))) if m else (1, 0, 0)


def localized(files):
    """English text for custom monster names: {key: text} from Localization.English.txt (key,text lines)."""
    for name in ('Localization.English.txt', 'Localization.txt'):
        if name in files:
            out = {}
            for line in files[name].splitlines():
                if ',' in line:
                    k, v = line.split(',', 1)
                    out[k.strip()] = v.strip().strip('"')
            return out
    return {}


def packlist(data, tiles, monsters, boxes=()):
    """The packing list for one scenario file (bytes of the .valkyrie zip)."""
    z = zipfile.ZipFile(io.BytesIO(data))
    files = {}
    for n in z.namelist():
        base = n.rsplit('/', 1)[-1]
        if base.lower().endswith(('.ini', '.txt')):
            files[base] = z.read(n).decode('utf-8-sig', errors='ignore')
    secs = {}
    for n, t in files.items():
        if n.lower().endswith('.ini'):
            for s, d in ini_sections(t).items():
                secs.setdefault(s, {}).update(d)
    loc = localized(files)
    # tiles: every Tile… component added anywhere (as Dan's tool does), mapped to its side
    added, seen = [], set()
    for n, t in files.items():
        if not n.lower().endswith('.ini'):
            continue
        for m in re.finditer(r'^\s*add\s*=\s*(.+)$', t, re.MULTILINE | re.IGNORECASE):
            for comp in m.group(1).split():
                if comp.startswith('Tile') and comp not in seen:
                    seen.add(comp)
                    added.append(comp)
    out_tiles, sides_seen = [], set()
    for comp in added:
        side = secs.get(comp, {}).get('side', '')
        if not side or side in sides_seen:
            continue
        sides_seen.add(side)
        c, alts = side_def(side, tiles, boxes)
        t = {'n': c.get('n') or camel(side, 'TileSide'), 'x': c.get('x', ''), 'e': c.get('e', '')}
        if c.get('i'):
            t['i'] = c['i']
        if alts:   # can't tell which box's tile is meant: offer both numbers
            t['alt'] = [{'i': a['i'], 'e': a['e'], 'x': a['x']} for a in alts if a.get('i')]
        back = c.get('back')
        if back and tiles.get(back):
            t['b'] = tiles[back][0]['n']
        if '6player' in comp.lower():
            t['six'] = 1
        out_tiles.append(t)
    out_tiles.sort(key=lambda t: (t.get('six', 0), idx_key(t.get('i'))))
    # monsters: every monster= type (all of them when one line offers several), custom ones mapped to their base figure
    order, uses = [], {}
    for n, t in files.items():
        if not n.lower().endswith('.ini'):
            continue
        for m in re.finditer(r'^\s*monster\s*=\s*(.+)$', t, re.MULTILINE | re.IGNORECASE):
            for mon in m.group(1).split():
                real, custom = mon, None
                if mon not in monsters and secs.get(mon, {}).get('base'):
                    real, custom = secs[mon]['base'], mon
                if real not in monsters:
                    continue
                if real not in uses:
                    uses[real] = []
                    order.append(real)
                if custom:
                    cn = loc.get(custom + '.monstername') or loc.get(custom + '.name') or camel(custom, 'CustomMonster')
                    if cn and cn not in uses[real]:
                        uses[real].append(cn)
    out_mon = []
    for r in order:
        mo = {'n': monsters[r]['n'], 'x': monsters[r]['x'], 'e': monsters[r]['e']}
        if uses[r]:
            mo['as'] = uses[r][:6]
        out_mon.append(mo)
    return out_tiles, out_mon


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--content', required=True)
    ap.add_argument('--manifest', default=MANIFEST_URL)
    ap.add_argument('--cache', default='')
    a = ap.parse_args()
    tiles, monsters = load_content(a.content)
    print('content: %d tile sides, %d monsters' % (len(tiles), len(monsters)))
    if not tiles or not monsters:
        sys.exit('Valkyrie content not found at ' + a.content)
    text = (urllib.request.urlopen(a.manifest, timeout=60).read().decode('utf-8-sig') if a.manifest.startswith('http')
            else open(a.manifest, encoding='utf-8-sig').read())
    cp = configparser.ConfigParser(interpolation=None, strict=False)
    cp.optionxform = str
    cp.read_string(text)
    old = {}
    if os.path.exists(OUT):
        s = open(OUT, encoding='utf-8').read()
        m = re.search(r'globalThis\.MOM_PACKLISTS=(\{.*\});', s, re.S)
        if m:
            old = json.loads(m.group(1))
    out, fetched, kept, failed = {}, 0, 0, []
    for key in cp.sections():
        e = cp[key]
        if str(e.get('hidden', '')).lower() == 'true' or e.get('type', 'MoM') != 'MoM':
            continue
        ver = e.get('version', '')
        if key in old and old[key].get('v') == ver and ver:
            out[key] = old[key]
            kept += 1
            continue
        data = None
        p = os.path.join(a.cache, key + '.valkyrie') if a.cache else ''
        try:
            if p and os.path.exists(p):
                data = open(p, 'rb').read()
            else:
                data = urllib.request.urlopen(e.get('url', '') + key + '.valkyrie', timeout=120).read()
            t, mo = packlist(data, tiles, monsters, {PACK_BOX[pk] for pk in e.get('packs', '').split() if pk in PACK_BOX})
        except Exception as ex:  # keep the old list if there is one
            failed.append('%s (%s)' % (key, str(ex)[:80]))
            if key in old:
                out[key] = old[key]
            continue
        fetched += 1
        need = sorted({x['x'] for x in t + mo if x.get('x')} | {PACK_BOX[pk] for pk in e.get('packs', '').split() if pk in PACK_BOX},
                      key=lambda b: ['core', 'rn', 'sm', 'btt', 'soa', 'sot', 'hj', 'pots'].index(b))
        other = sorted(pk for pk in e.get('packs', '').split() if pk not in PACK_BOX)
        entry = {'v': ver, 'need': need, 'tiles': t, 'monsters': mo}
        if other:
            entry['other'] = other
        out[key] = entry
    head = ('/* Mansions of Madness Casebook: packing lists for the Valkyrie scenarios, keyed by catalogue key (js/valkyrie.js).\n'
            '   Generated by scripts/fetch-packlists.py from each scenario file, the community Tiles Index v5.2 (tile numbers)\n'
            '   and Valkyrie\'s game content (names and boxes); the website version of Dan\'s valkyrie-tools packlist. Do not edit.\n'
            '   need: boxes it uses; tiles: n name, i number (e.g. 9M), e set symbol printed on it, x box it comes in, b the other\n'
            '   side, six 6-player only, alt other possible tiles; monsters: n name, e set, x box, as custom monsters played with\n'
            '   that figure; other: extra content packs it needs. */\n')
    body = 'globalThis.MOM_PACKLISTS={\n' + ',\n'.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(out[k], ensure_ascii=False, separators=(',', ':')) for k in sorted(out)) + '\n};\n'
    new = head + body
    changed = not os.path.exists(OUT) or open(OUT, encoding='utf-8').read() != new
    if changed:
        open(OUT, 'w', encoding='utf-8').write(new)
    print('packlists: %d scenarios (%d read, %d unchanged), %d failed; %s' % (len(out), fetched, kept, len(failed), 'written' if changed else 'no change'))
    for f in failed:
        print('  failed: ' + f)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as g:
            g.write('packlists_changed=%s\n' % ('true' if changed else 'false'))


if __name__ == '__main__':
    main()
