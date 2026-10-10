/* Mansions of Madness Casebook — turning a spreadsheet into plays.
   Reads a Google Sheets link (through Google's public "gviz" feed, which works for sheets shared as
   "Anyone with the link") or a CSV file, finds the columns by their headings, and builds plays.
   Understands the original tracking sheet (Scenario, Played, Characters, Pass/Fail, Notes, Rules) and this
   site's own CSV export (Date, Scenario, Type, Result, Attempts, Party, Rules, Notes). Pure functions apart from
   fetchSheet, so test/importer.test.js can run it in Node. */
(function(root){
'use strict';
var MOM=root.MOM;

// ---------- reading ----------
function parseCSV(text){
  var rows=[],row=[],cell='',q=false,i=0,c;text=String(text||'').replace(/^﻿/,'');
  for(;i<text.length;i++){
    c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=c;continue;}
    if(c==='"')q=true;else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows.filter(function(r){return r.some(function(x){return String(x).trim()!=='';});});
}
// A gviz table ({cols:[{label}],rows:[{c:[{v,f}]}]}) as rows of text, headings first.
function gvizRows(table){
  var cell=function(c){return c==null?'':c.f!=null?String(c.f):c.v==null?'':String(c.v);};
  var head=(table.cols||[]).map(function(c){return String(c.label||'').trim();});
  var body=(table.rows||[]).map(function(r){return (r.c||[]).map(cell);});
  if(!head.some(Boolean))return body;
  return [head].concat(body);
}
function sheetId(link){var m=String(link||'').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);return m?m[1]:/^[a-zA-Z0-9_-]{30,}$/.test(String(link||'').trim())?String(link).trim():'';}
function sheetGid(link){var m=String(link||'').match(/[#&?]gid=(\d+)/);return m?m[1]:'';}
// Loads a shared Google Sheet in the browser. Google's feed answers with a script (JSONP), which works
// across sites where a normal request would be blocked.
function fetchSheet(link){
  return new Promise(function(resolve,reject){
    var id=sheetId(link);if(!id){reject(new Error('That doesn’t look like a Google Sheets link.'));return;}
    var cb='__momSheet'+Date.now(),s=document.createElement('script'),done=false;
    var finish=function(err,val){if(done)return;done=true;try{delete window[cb];}catch(e){window[cb]=undefined;}s.remove();clearTimeout(t);err?reject(err):resolve(val);};
    window[cb]=function(res){
      if(!res||res.status==='error'){finish(new Error('Google wouldn’t share that sheet. In Google Sheets choose Share › General access › Anyone with the link, then try again.'));return;}
      finish(null,gvizRows(res.table||{}));
    };
    var gid=sheetGid(link);
    s.src='https://docs.google.com/spreadsheets/d/'+id+'/gviz/tq?headers=1&tqx=out:json;responseHandler:'+cb+(gid?'&gid='+gid:'');
    s.onerror=function(){finish(new Error('Couldn’t reach that sheet. Check it’s shared as “Anyone with the link”.'));};
    var t=setTimeout(function(){finish(new Error('The sheet took too long to load. Try again, or download it as CSV and choose the file.'));},20000);
    document.head.appendChild(s);
  });
}

// ---------- understanding ----------
var COLS={
  scenario:/^(scenario|mission|adventure|scenario name|name)$/,
  played:/^played\??$/,
  date:/date|when|played on/,
  type:/^(type|source|kind)$/,
  result:/pass|fail|result|outcome|won|win/,
  attempts:/attempt|tries/,
  party:/^party$/,
  players:/player|played with|people|group/,
  investigators:/character|investigator/,
  rules:/rule|variant/,
  location:/^(location|where|venue|place|played at)$/,
  notes:/note|comment/
};
function findCols(head){
  var at={},low=head.map(function(h){return String(h||'').trim().toLowerCase();});
  // played/date first so "Played on" goes to date and "Played" doesn't swallow "Played with"
  ['played','scenario','date','location','type','attempts','party','investigators','players','result','rules','notes'].forEach(function(k){
    for(var i=0;i<low.length;i++){if(at[k]==null&&low[i]&&!Object.keys(at).some(function(o){return at[o]===i;})&&COLS[k].test(low[i])){at[k]=i;break;}}
  });
  return at;
}
function parseResult(s){
  s=String(s||'').toLowerCase();
  if(/abandon|quit|gave up|incomplete|unfinished|didn.?t finish/.test(s))return 'abandoned';
  if(/\bfail|\blost\b|\blose\b|\bloss\b|defeat|\bdied\b/.test(s))return 'fail';
  if(/\bpass|\bwon\b|\bwin\b|victor|success|\bbeat\b/.test(s))return 'pass';
  return '';
}
var ORD={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10};
function parseAttempts(s){
  s=String(s||'').toLowerCase();
  var m=s.match(/(\d+)\s*(?:st|nd|rd|th)?\s*(?:try|tries|attempt|go)/);if(m)return Math.min(99,+m[1]);
  m=s.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:try|attempt|go)/);if(m)return ORD[m[1]];
  m=s.match(/^\s*(\d{1,2})\s*$/);if(m)return +m[1];
  return 0;
}
function normRules(s){
  s=String(s||'').trim().replace(/\s+/g,' ');if(!s)return '';
  if(/^normal( rules?)?$/i.test(s)||/^standard( rules?)?$/i.test(s))return 'Normal rules';
  s=s.replace(/\brules\b/i,'rules');
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function normDate(s){
  s=String(s||'').trim();if(!s)return '';
  var m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
  m=s.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})/);if(m)return m[1]+'-'+('0'+(+m[2]+1)).slice(-2)+'-'+('0'+m[3]).slice(-2);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){var y=+m[3];if(y<100)y+=2000;return y+'-'+('0'+m[1]).slice(-2)+'-'+('0'+m[2]).slice(-2);}
  var d=new Date(s);return isNaN(d)?'':d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
function splitList(s){return String(s||'').split(/\s*(?:[,;\/&+]|\band\b)\s*/i).map(function(x){return x.trim();}).filter(Boolean);}
// One person, however many characters they played (unnamed seats each count as someone).
function soloParty(party){var k={},n=0;party.forEach(function(s){var p=String(s.player||'').trim().toLowerCase();if(!p)n++;else if(!k[p]){k[p]=1;n++;}});return n===1;}
function hash(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}

// rows: arrays of text with the headings first. known: scenarios already in the catalog ({id,name,type}).
// Returns {plays, unmatched ({sheet name: [best-guess scenario ids]} for rows needing a choice), skipped, notes, cols}.
// Plays with an unmatched name have scenarioId '' and sheetName set until the person picks.
function buildPlays(rows,known){
  var out={plays:[],unmatched:{},skipped:0,notes:[],cols:{}};
  if(!rows||rows.length<2){out.notes.push('The sheet has no rows under its headings.');return out;}
  var hi=0;
  // headings may sit below a title row: take the first row that names a Scenario column
  for(var r=0;r<Math.min(rows.length,5);r++){if(findCols(rows[r]).scenario!=null){hi=r;break;}}
  var at=findCols(rows[hi]);out.cols=at;
  if(at.scenario==null){out.notes.push('Couldn’t find a “Scenario” column. The first row needs headings such as Scenario, Played, Characters, Pass/Fail, Notes.');return out;}
  var byKey={};(known||[]).forEach(function(s){byKey[MOM.key(s.name)]=s;});
  var get=function(row,k){return at[k]==null?'':String(row[at[k]]==null?'':row[at[k]]).trim();};
  rows.slice(hi+1).forEach(function(row,n){
    var name=get(row,'scenario');if(!name){return;}
    var played=get(row,'played');
    if(at.played!=null&&!/^\s*(y|yes|x|true|✓|✔)/i.test(played)){out.skipped++;return;}
    // Only official and Valkyrie scenarios: the exact name, else a confident match (noted on the play), else the person
    // picks one in the import preview (out.unmatched holds the best guesses for each name).
    var sc=byKey[MOM.key(name)],matchedFrom='';
    if(!sc){var cands=MOM.matchScenarios(name,known||[]),sure=MOM.sureMatch(cands);
      if(sure){sc=sure;matchedFrom=name;}
      else{if(!out.unmatched[name])out.unmatched[name]=cands.slice(0,6).map(function(c){return c.s.id;});sc={id:'',name:name,type:''};}}
    var resText=get(row,'result'),party=[],extra=[],unknown=[];
    // "Y (Dan only)": a solo play by that person
    var solo=played.match(/\(\s*([^)]+?)\s+only\s*\)/i);
    if(at.party!=null&&get(row,'party')){
      get(row,'party').split(/\s*;\s*/).forEach(function(p){if(!p)return;var m=p.split(/\s*[:=]\s*/);var raw=m.length>1?m.slice(1).join(':'):m[0],inv=MOM.matchInvestigator(raw);if(raw.trim()&&!inv&&!/^\?+$/.test(raw.trim()))unknown.push(raw.trim());party.push({player:m.length>1?m[0]:'',investigator:inv});});
    }else{
      // only official investigators; a "?" or anything unrecognised stays as an unknown seat, so the party size is right
      var inv=splitList(get(row,'investigators')).map(function(x){var m=MOM.matchInvestigator(x);if(!m&&!/^\?+$/.test(x))unknown.push(x);return m;});
      var ppl=splitList(get(row,'players')).filter(function(x){return !/^\?+$/.test(x);});
      if(solo&&!ppl.length)ppl=[solo[1].trim()];
      var n2=Math.max(inv.length,ppl.length);
      for(var i=0;i<n2;i++)party.push({player:ppl[i]||'',investigator:inv[i]||''});
      if(/\?/.test(get(row,'investigators')))extra.push('Imported with an investigator left as “?”.');
    }
    if(matchedFrom)extra.push('Scenario in the sheet: \u201c'+matchedFrom+'\u201d.');
    if(unknown.length)extra.push('Not an official investigator, left as unknown: '+unknown.join(', ')+'.');
    var attempts=parseAttempts(get(row,'attempts'))||parseAttempts(resText)||1;
    var result=parseResult(resText);
    var p={scenarioId:sc.id,scenarioName:sc.name,scenarioType:sc.type,sheetName:sc.id?'':name,date:normDate(get(row,'date')),result:result,attempts:attempts,
      party:party,solo:!!solo||soloParty(party),rules:normRules(get(row,'rules')),location:get(row,'location').replace(/\s+/g,' ').slice(0,60),notes:get(row,'notes'),seq:n};
    if(resText&&!result)extra.push('Result in the sheet: '+resText);
    if(extra.length)p.notes=(p.notes?p.notes+'\n':'')+extra.join('\n');
    p.importKey=hash([MOM.key(name),p.date,result,attempts,party.map(function(x){return x.player+':'+x.investigator;}).join(';'),p.rules,get(row,'notes')].join('|'));
    out.plays.push(p);
  });
  if(!out.plays.length)out.notes.push('No played rows found (rows marked N in “Played” are skipped).');
  return out;
}

// This site's export, readable by buildPlays above.
function toCSV(plays){
  var q=function(v){v=String(v==null?'':v);return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  var lines=[['Date','Scenario','Type','Result','Attempts','Party','Location','Rules','Notes'].join(',')];
  plays.forEach(function(p){lines.push([p.date,p.scenarioName,p.scenarioType,p.result,p.attempts||1,
    (p.party||[]).map(function(x){return (x.player||'')+': '+(x.investigator||'');}).join('; '),p.location||'',p.rules,p.notes].map(q).join(','));});
  return lines.join('\r\n')+'\r\n';
}

root.MOMImport={parseCSV:parseCSV,gvizRows:gvizRows,fetchSheet:fetchSheet,sheetId:sheetId,buildPlays:buildPlays,toCSV:toCSV,
  parseResult:parseResult,parseAttempts:parseAttempts,normDate:normDate,normRules:normRules};
})(typeof window!=='undefined'?window:globalThis);
