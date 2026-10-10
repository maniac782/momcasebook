/* Mansions of Madness Casebook — published opinions about scenarios, collected by hand.
   Each entry links its source and gives a one-line summary written for this site (never copied text).
   Keyed by scenario id (o-… official, v-… Valkyrie; see js/catalog.js and js/valkyrie.js).
   To add one: find a review or discussion, check what it actually says, summarise it in your own words,
   and add { source, url, date, summary }. Valkyrie's own player ratings come from js/valkyrie.js instead. */
globalThis.MOM_REVIEWS=(function(){
  var RANK17={source:'FFG forum: “Ranking the Scenarios”',url:'https://ffg-forum-archive.entropicdreams.com/topic/252016-ranking-the-scenarios',date:'2017–18'};
  var r=function(base,summary){var o={};for(var k in base)o[k]=base[k];o.summary=summary;return [o];};
  return {
    'o-escape-from-innsmouth':r(RANK17,'Most often ranked the best: tense and absorbing, and its difficulty makes it worth replaying.'),
    'o-shattered-bonds':r(RANK17,'Generally well liked for its mansion setting and its twists; often near the top of people’s lists.'),
    'o-what-lies-within':r(RANK17,'Mostly praised as classic Mansions of Madness; one player found the ending slow, another found it very hard with two.'),
    'o-gates-of-silverwood-manor':r(RANK17,'Liked for its haunted-house feel and branching endings, where losing can still move the story on.'),
    'o-dearly-departed':r(RANK17,'Enjoyed by those who played it, though one player found its puzzle and its explanation confusing.'),
    'o-cult-of-sentinel-hill':r(RANK17,'Mixed: a memorable ending for one player, while another felt the outdoor setting didn’t draw them in.'),
    'o-vengeful-impulses':r(RANK17,'Mixed: a fun, Clue-style investigation for some; others found it text-heavy with little combat.'),
    'o-rising-tide':r(RANK17,'Usually ranked low: felt long, more investigation than action, with little variety in the map.'),
    'o-cycle-of-eternity':r(RANK17,'Seen as a solid, engaging introductory scenario, though some had simply played it too often.'),
    'o-dark-reflections':r(RANK17,'A fun scenario with creepy mirror mechanics; usually placed mid-table.'),
    'v-arkham-crime-wave':[{source:'FFG forum: “How would you rank the scenarios?”',url:'https://ffg-forum-archive.entropicdreams.com/topic/304322-how-would-you-rank-the-scenarios',date:'2020',
      summary:'A murder mystery that splits opinion: some found the culprit easy to work out, while some experienced players found it nearly impossible to win.'}],
    'v-stress-and-strain':[{source:'FFG forum: “How would you rank the scenarios?”',url:'https://ffg-forum-archive.entropicdreams.com/topic/304322-how-would-you-rank-the-scenarios',date:'2020',
      summary:'Recommended as a solid, straightforward scenario in the spirit of Resident Evil.'}],
    'o-the-twilight-diadem':[{source:'Steam discussion (one player)',url:'https://steamcommunity.com/app/478980/discussions/0/2259060348513219099',date:'2020',
      summary:'One player’s critique: talking to characters rarely moved things forward, choices felt random and the puzzle was unclear.'}]
  };
})();
