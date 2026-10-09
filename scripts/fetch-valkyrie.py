"""Builds js/valkyrie.js, the built-in list of Valkyrie scenarios for Mansions of Madness, from the catalogue the
Valkyrie app itself downloads (github.com/NPBruce/valkyrie-store, MoM/manifestDownload.ini).
Run:  python3 scripts/fetch-valkyrie.py [path/to/manifestDownload.ini]
Without a path it downloads the file from GitHub. Bump js/version.js afterwards (see CLAUDE.md).
Keeps names, authors, difficulty, length, the catalogue's community numbers (play count, pass rate,
average length, rating), languages and the authors' descriptions (the catalogue is Apache 2.0; see third_party/). Rewrites the file only when something changed; scenarios that leave the
catalogue are kept, marked retired. Run weekly by .github/workflows/valkyrie-refresh.yml."""
import configparser, json, re, sys, os, datetime, urllib.request
URL='https://raw.githubusercontent.com/NPBruce/valkyrie-store/master/MoM/manifestDownload.ini'
src=sys.argv[1] if len(sys.argv)>1 else None
text=open(src,encoding='utf-8-sig').read() if src else urllib.request.urlopen(URL,timeout=60).read().decode('utf-8-sig')
cp=configparser.RawConfigParser(strict=False,interpolation=None); cp.optionxform=str
cp.read_string(text)

def clean(s): return re.sub(r'<[^>]+>','',s or '').replace('\\n','\n').strip()
def clean_desc(t):
    # text as the app shows it: no markup, real line breaks, no runs of blank lines, capped at a sensible length
    t=re.sub(r'<[^>]+>','',t.replace('\\n','\n')).replace('\r','')
    t=re.sub(r'[ \t]+',' ',t); t=re.sub(r'\n\s*\n\s*\n+','\n\n',t).strip()
    return t if len(t)<=1500 else t[:1500].rsplit(' ',1)[0]+'\u2026'
def slug(s):
    import unicodedata
    s=unicodedata.normalize('NFKD',s.lower()); s=''.join(c for c in s if not unicodedata.combining(c))
    s=s.replace('&',' and '); s=re.sub(r'[^a-z0-9]+','-',s).strip('-'); return s[:60] or 'scenario'
def author(sec):
    lang=sec.get('defaultlanguage','English')
    a=clean(sec.get('authors.English') or sec.get('authors.'+lang) or '')
    lines=[l.strip() for l in a.split('\n') if l.strip() and not re.search(r'scenario for|investigators?\b|players?\b',l,re.I)]
    pre=r'(?:authors?|autor[ae]?|auteur|created by|written by|design(?:ed)? by|by|roteiro|ideato e realizzato da|escrito por|creado por|stworzone przez)'
    # "Author\nName\n\nTranslations…" -> the line after the Author heading; otherwise the first line
    for i,l in enumerate(lines):
        if re.match('^'+pre+r'\s*:?\s*$',l,re.I) and i+1<len(lines): return lines[i+1][:60]
        m=re.match('^'+pre+r'\s*:?\s+(.+)$',l,re.I)
        if m: return m.group(1)[:60]
    return lines[0][:60] if lines and len(lines[0])<=40 else ''
out=[];seen=set()
for key in cp.sections():
    sec=dict(cp.items(key))
    if sec.get('hidden','False').lower()=='true' or sec.get('type','MoM')!='MoM': continue
    lang=sec.get('defaultlanguage','English')
    name=clean(sec.get('name.English') or sec.get('name.'+lang) or key)
    name=re.sub(r'\s*[\(\[]?\s*v(?:er(?:sion)?)?\.?\s*\d+(?:\.\d+)*[a-z]?\s*[\)\]]?\s*$','',name,flags=re.I).strip() or name
    # version tags anywhere: "Possessed 1.2", "(v1.8)", "(1.25)", "ver.3.0", "2.0"
    name=re.sub(r'\s*\(\s*v?(?:er\.?|ersion)?\s*\d+(?:\.\d+)+[a-z]?\s*\)','',name,flags=re.I)
    name=re.sub(r'\s+v?(?:er\.?|ersion)?\s*\d+\.\d+(?:\.\d+)*[a-z]?(?=\s|$)','',name,flags=re.I).strip() or name
    name=re.sub(r'\s+',' ',name)[:80]
    k=slug(name).replace('the-','',1) if slug(name).startswith('the-') else slug(name)
    if k in seen: continue
    seen.add(k)
    item={'id':'v-'+slug(name),'name':name,'type':'valkyrie','key':key}
    # original language, and every language it has a title in (translations)
    orig=sec.get('defaultlanguage','English').strip() or 'English'
    langs=sorted({k.split('.',1)[1] for k in sec if k.startswith('name.') and sec[k].strip()}|{orig})
    item['lang']=orig
    if langs!=[orig]: item['langs']=langs
    # the author's description: English when there is one, else the original language (Apache 2.0, credited on the site)
    dsc=sec.get('description.English','').strip()
    if dsc: item['desc']=clean_desc(dsc)
    else:
        dsc=sec.get('description.'+orig,'').strip()
        if dsc: item['desc']=clean_desc(dsc); item['descLang']=orig
    if not item.get('desc'): item.pop('desc',None)
    a=author(sec)
    if a: item['author']=a
    try:
        d=float(sec.get('difficulty','0'))
        if d>0: item['difficulty']=round(d,2)
    except ValueError: pass
    try:
        lo,hi=int(float(sec.get('lengthmin','0'))),int(float(sec.get('lengthmax','0')))
        if hi>0: item['minutes']=[lo,hi]
    except ValueError: pass
    # community numbers from the Valkyrie catalogue (what other players reported)
    try:
        pc=int(float(sec.get('play_count','0')))
        if pc>0: item['plays']=pc
        wr=sec.get('win_ratio')
        if wr not in (None,'') and pc>=1: item['win']=round(float(wr),2)
        ra=float(sec.get('rating','0') or 0)
        if ra>0 and pc>=1: item['rating']=round(ra,1)  # players' average score, 1 (awful) to 10 (amazing)
        du=float(sec.get('duration','0'))
        if du>0: item['avg']=int(round(du))
    except ValueError: pass
    out.append(item)
here=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
target=os.path.join(here,'js','valkyrie.js')
old=[]
if os.path.exists(target):
    t=open(target,encoding='utf-8').read()
    try: old=json.loads(t[t.index('['):t.rindex(']')+1])
    except ValueError: old=[]
# A scenario that drops out of the catalogue stays (marked retired) so plays of it still show its details.
ids={x['id'] for x in out}
for x in old:
    if x['id'] not in ids:
        x=dict(x); x['retired']=True; out.append(x)
out.sort(key=lambda s:slug(s['name']).replace('the-','',1))
if old==out:
    print('no changes ('+str(len(out))+' scenarios)'); sys.exit(0)
added=[x['name'] for x in out if x['id'] not in {o['id'] for o in old}]
stamp=datetime.date.today().isoformat()
js=('/* Valkyrie scenarios for Mansions of Madness, from the catalogue the Valkyrie app downloads\n'
    '   (github.com/NPBruce/valkyrie-store). Generated by scripts/fetch-valkyrie.py on '+stamp+': '+str(len(out))+' scenarios.\n'
    '   Do not edit by hand; re-run the script to refresh. Names, authors, difficulty (0-1), length (minutes), community plays, win (pass rate 0-1), avg (minutes), rating (1-10), lang (original language), langs (every language available), desc (description by the author; descLang when not English).\n'
    '   Descriptions are by the scenario authors, from the Valkyrie catalogue, used under the Apache License 2.0 (see third_party/). */\n'
    'globalThis.MOM_VALKYRIE=\n'+json.dumps(out,ensure_ascii=False,separators=(',',':')).replace('},{','},\n{')+';\n')
open(target,'w',encoding='utf-8').write(js)
print(len(out),'scenarios written to js/valkyrie.js'+(('; new: '+', '.join(added)) if old and added else ''))
gh=os.environ.get('GITHUB_OUTPUT')
if gh:
    with open(gh,'a') as f: f.write('changed=true\nadded='+str(len(added) if old else 0)+'\n')
