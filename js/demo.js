/* Mansions of Madness Casebook — the sample casebook on the welcome page (index.html?demo=1&embed=1).
   Invented players and games so visitors can look around; js/localfb.js keeps it in memory, so nothing they change is
   saved. Dates are counted back from today, and the next game is always a few days away. Only loaded with ?demo=1. */
(function(){
  if(!/[?&]demo=1/.test(location.search))return;
  var day=function(n){var d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);};
  var now=Date.now(),P='users/sample',docs={},n=0;
  var THU="Mara's place";
  docs[P]={name:'Alex',email:'',created:now-90*864e5,lastSeen:now,playCount:0,
    owned:['core','dlc','rn','sm','btt','soa','sot','hj','pots'],
    starred:{
      'v-exotic-material':{at:now-5*864e5,plan:{date:day(3),time:'19:00',location:THU,groupId:'thursday',note:'Bring snacks'}},
      'o-hidden-depths':{at:now-9*864e5},
      'o-the-twilight-diadem':{at:now-20*864e5}
    }};
  [['alex','Alex',''],['mara','Mara','Hosts most Thursdays'],['theo','Theo','Always wants the Seeker'],['jules','Jules',''],['sam','Sam','Alex’s brother']]
    .forEach(function(x){docs[P+'/people/'+x[0]]={name:x[1],notes:x[2],created:now-80*864e5};});
  docs[P+'/groups/thursday']={name:'Thursday night',members:['alex','mara','theo','jules'],created:now-80*864e5};
  docs[P+'/groups/family']={name:'Family',members:['alex','sam'],created:now-80*864e5};
  var NORMAL='Normal rules';
  function play(id,name,type,ago,result,attempts,party,notes,loc,rules){
    var seen={};party.forEach(function(s){seen[s[0].toLowerCase()]=1;});
    docs[P+'/plays/sample'+(++n)]={scenarioId:id,scenarioName:name,scenarioType:type,date:day(-ago),result:result,attempts:attempts,
      party:party.map(function(s){return {player:s[0],investigator:s[1]};}),solo:Object.keys(seen).length===1,
      rules:rules||NORMAL,location:loc||'',notes:notes||'',created:now-ago*864e5,updated:now-ago*864e5};
  }
  var thu=function(a,b,c,d){return [['Alex',a],['Mara',b],['Theo',c],['Jules',d]];};
  play('o-escape-from-innsmouth','Escape from Innsmouth','official',4,'pass',2,thu('Agatha Crane','Rita Young','Joe Diamond','Father Mateo'),'Got out on the very last round. Theo’s Joe Diamond carried us.',THU);
  play('o-escape-from-innsmouth','Escape from Innsmouth','official',11,'fail',1,thu('Agatha Crane','Rita Young','Joe Diamond','Father Mateo'),'Ran out of time on the docks.',THU);
  play('v-exotic-material','Exotic Material','valkyrie',18,'fail',1,[['Alex','Wendy Adams'],['Sam','"Ashcan" Pete']],'Found the generator far too late. Rematch scheduled.','Home');
  play('o-shattered-bonds','Shattered Bonds','official',25,'pass',1,thu('Carson Sinclair','Minh Thi Phan','Preston Fairmont','Daniela Reyes'),'The twist caught all of us out.',THU);
  play('v-disturbance-at-the-docks','Disturbance at the Docks','valkyrie',32,'pass',1,[['Alex','Silas Marsh'],['Alex','Trish Scarborough']],'Solo, playing two investigators.','Home');
  play('o-dearly-departed','Dearly Departed','official',39,'abandoned',1,thu('Jenny Barnes','Rita Young','Harvey Walters','Sister Mary'),'Called it at midnight. Will try again.',THU);
  play('v-smugglers-point','Smugglers Point','valkyrie',46,'pass',1,[['Alex','Lily Chen'],['Sam','Tommy Muldoon']],'Quick and fun.','Home','Modified rules (2 moves, 1 action)');
  play('o-what-lies-within','What Lies Within','official',53,'fail',1,thu('Agatha Crane','Mandy Thompson','Joe Diamond','Wilson Richards'),'The cellar was a bad idea.',THU);
  play('o-cycle-of-eternity','Cycle of Eternity','official',60,'pass',1,thu('Wendy Adams','Rita Young','Harvey Walters','Father Mateo'),'Our first game together.',THU);
  play('v-five-crimes-at-crimson-alley','Five Crimes at Crimson Alley','valkyrie',67,'pass',1,[['Alex','Kate Winthrop'],['Sam','Ursula Downs']],'Solved four of the five.','Home');
  play('o-dark-reflections','Dark Reflections','official',74,'pass',2,thu('Diana Stanley','Monterey Jack','Marie Lambeau','Akachi Onyele'),'Mirrors everywhere. Loved it.',THU);
  docs[P].playCount=n;
  window.MOM_DEMO=docs;
})();
