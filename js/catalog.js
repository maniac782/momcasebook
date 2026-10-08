/* Mansions of Madness Ledger — the built-in list of official scenarios (Mansions of Madness Second Edition app),
   grouped by the product that unlocks them, plus investigator names offered as suggestions.
   Valkyrie and other fan scenarios are added on the admin page (shared with everyone) or by each player (just theirs).
   Investigators are suggestions only; any name can be typed. */
(function(root){
'use strict';
var PRODUCTS=[
  {id:'core',name:'Core game',scenarios:['Escape from Innsmouth','Shattered Bonds','Cycle of Eternity','Rising Tide']},
  {id:'dlc',name:'Digital (app purchase)',scenarios:['What Lies Within','Dark Reflections','Altered Fates','Turn of a Page']},
  {id:'rn',name:'Recurring Nightmares',scenarios:['Dearly Departed']},
  {id:'sm',name:'Suppressed Memories',scenarios:['Cult of Sentinel Hill']},
  {id:'btt',name:'Beyond the Threshold',scenarios:['Gates of Silverwood Manor','Vengeful Impulses']},
  {id:'soa',name:'Streets of Arkham',scenarios:['Astral Alchemy','Gangs of Arkham','Ill-Fated Exhibit']},
  {id:'sot',name:'Sanctum of Twilight',scenarios:['The Twilight Diadem','Behind Closed Doors']},
  {id:'hj',name:'Horrific Journeys',scenarios:['Murder on the Stargazer Majestic','10:50 to Arkham','Hidden Depths']},
  {id:'pots',name:'Path of the Serpent',scenarios:['The Jungle Awakens','Into the Dark','Lost Temple of Yig']}
];
var INVESTIGATORS=['Agatha Crane','Agnes Baker','Akachi Onyele','Amanda Sharpe','Ashcan Pete','Bob Jenkins','Carolyn Fern',
  'Carson Sinclair','Charlie Kane','Daisy Walker','Daniela Reyes','Darrell Simmons','Dexter Drake','Diana Stanley','Father Mateo',
  'Finn Edwards','Gloria Goldberg','Harvey Walters','Jenny Barnes','Jim Culver','Joe Diamond','Kate Winthrop','Leo Anderson',
  'Lily Chen','Mandy Thompson','Marie Lambeau','Michael McGlen','Minh Thi Phan','Monterey Jack','Norman Withers','Preston Fairmont',
  'Rita Young','Silas Marsh','Sister Mary','Tommy Muldoon','Trish Scarborough','Ursula Downs','Vincent Lee','William Yorick',
  'Wilson Richards'];

// Stable id from a scenario name: lowercase letters and digits joined by dashes ("10:50 to Arkham" -> "10-50-to-arkham").
function slug(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'scenario';}
// Loose key for matching names typed in different ways ("The Ill Fated Exhibit" = "Ill-Fated Exhibit").
function key(s){return slug(s).replace(/^the-/,'').replace(/-/g,'');}

var OFFICIAL=[];
PRODUCTS.forEach(function(p){p.scenarios.forEach(function(n){OFFICIAL.push({id:'o-'+slug(n),name:n,type:'official',product:p.id});});});

// Turn a short or misspelt investigator name into the full one when it's unambiguous ("Tommy" -> "Tommy Muldoon",
// "Pete" -> "Ashcan Pete"). Anything else is kept as typed.
function fullInvestigator(s){
  s=String(s||'').trim();if(!s||/^\?+$/.test(s))return '';
  var low=s.toLowerCase().replace(/[“”"]/g,'');
  var exact=INVESTIGATORS.filter(function(n){return n.toLowerCase()===low;});if(exact.length)return exact[0];
  var hits=INVESTIGATORS.filter(function(n){return n.toLowerCase().split(/\s+/).indexOf(low)>=0;});
  if(hits.length===1)return hits[0];
  var pre=INVESTIGATORS.filter(function(n){return n.toLowerCase().indexOf(low)===0;});
  return pre.length===1?pre[0]:s;
}

root.MOM={PRODUCTS:PRODUCTS,OFFICIAL:OFFICIAL,INVESTIGATORS:INVESTIGATORS,slug:slug,key:key,fullInvestigator:fullInvestigator,
  productName:function(id){var p=PRODUCTS.filter(function(x){return x.id===id;})[0];return p?p.name:'';}};
})(typeof window!=='undefined'?window:globalThis);
