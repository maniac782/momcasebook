/* Mansions of Madness Casebook — premises for the official scenarios, written for this site in our own words
   (setup only, no spoilers) from the source linked on each. Fantasy Flight's own scenario text is copyrighted, so it is
   not copied here; if they give permission, their wording replaces these verbatim (see README).
   Keyed by scenario id from js/catalog.js. A scenario with no reliable source has no entry. */
globalThis.MOM_OFFICIAL_INFO=(function(){
  var FFG=function(path){return {source:'Fantasy Flight Games',url:'https://drafts.fantasyflightgames.com/en/news/'+path+'/'};};
  var src=function(source,url){return {source:source,url:url};};
  var e=function(text,s){return {text:text,source:s.source,url:s.url};};
  var SOA=src('Nerdist preview','https://nerdist.com/article/mansions-of-madness-heads-to-the-city-in-streets-of-arkham/');
  var HJ=src('Zatu preview','https://zatu.com/horrific-journeys-preview/');
  var SOT=FFG('2018/4/19/enter-the-sanctum'),BTT=FFG('2016/12/28/gates-of-silverwood-manor'),POTS=FFG('2019/9/30/lost-temple-of-yig');
  return {
    'o-cycle-of-eternity':e('Strange things are happening at the Vanderbilt mansion. Every game starts in the same foyer and leads to the same truth, but the rooms beyond the doors, and what waits in them, change each time you play.',FFG('2016/7/25/mansions-of-madness-second-edition')),
    'o-shattered-bonds':e('Grace Bechman, an old associate just back from the southern islands, asks for your help: something is hunting her family. Restore the old bonds that once protected the world and keep the Bechmans safe.',src('A player’s write-up (Goodreads blog)','https://www.goodreads.com/author_blog_posts/17592698-mansions-of-madness-part-7')),
    'o-what-lies-within':e('Arkham police call you at midnight about a wealthy recluse murdered in Southside, a case their own officers won’t touch. His house is unsettling: a cat wanders with a key round its neck and there are noises from the cellar. Find out how he died, who is responsible and what else the house hides.',FFG('2016/12/21/what-lies-within')),
    'o-dark-reflections':e('A former society columnist left Arkham to write a novel in the country house she inherited, and has vanished. Her publisher hires you to search the isolated manor and bring her back before your own grip on reality slips.',FFG('2017/8/4/dark-reflections')),
    'o-altered-fates':e('Sent to an English country estate in the 1920s to guard a family heirloom, you find it already stolen, and your group is split across time: some in the house as it is, others in an abandoned, boarded-up future version of it. Both halves are played at once, each affecting the other, as you learn what the thieves want and find a way back.',FFG('2018/8/30/altered-fates')),
    'o-turn-of-a-page':e('A sleeping sickness is trapping Arkham’s people in nightmares. Gather powerful artifacts from an occult curio shop and hold the town against a growing doom. Ties in with The Drowned City campaign of Arkham Horror: The Card Game.',src('Fantasy Flight Games','https://www.fantasyflightgames.com/turn-of-a-page/')),
    'o-mirror-of-a-man':e('A scholar wants your help to settle whether a rumoured shapeshifter is real. When you arrive, something is already wrong, and you have to work out what happened, when and why.',src('Fantasy Flight Games','https://www.fantasyflightgames.com/en/news/2026/9/15/available-now-september-15/')),
    'o-dearly-departed':e('Graves at Hangman’s Hill cemetery outside Arkham have been emptied, and townsfolk swear they’ve seen their dead walking. Starting at the cemetery chapel, find out where the bodies went and who is behind it.',FFG('2016/8/26/dearly-departed')),
    'o-cult-of-sentinel-hill':e('You’ve been looking into strange events around Dunwich, and something noticed. You wake locked in a dungeon beneath Sentinel Hill beside a familiar local; escape and uncover what the cult is planning.',FFG('2016/9/8/cult-of-sentinel-hill')),
    'o-gates-of-silverwood-manor':e('A police officer looking into disappearances linked to Silverwood Manor asks you to meet him there. The front door is open and he’s nowhere to be found; search the house for him and for what happened to the missing.',BTT),
    'o-vengeful-impulses':e('At a dinner party in a collector’s lavish home, your host asks you to find out which of his guests intends to commit murder. A conversation-driven mystery: you question the guests about their motives more than you fight.',BTT),
    'o-astral-alchemy':e('Your search takes you across the Miskatonic University campus, where the books you came for are gone and something unnatural is loose. Unusually, you have a hand in how quickly the pressure builds.',SOA),
    'o-gangs-of-arkham':e('A strange murder threatens to tip two of Arkham’s gangs into open war. Work your way through the standoff and find out what’s really behind the killing.',SOA),
    'o-ill-fated-exhibit':e('Something is wrong with a museum exhibit. Examine the artifacts, question the unsettling staff and piece the mystery together from scattered clues; careful notes pay off.',SOA),
    'o-the-twilight-diadem':e('During Arkham’s Twilight Fair, this year’s honoured debutante believes the Silver Twilight Lodge is plotting something and asks you to protect her. Stop the parade before it reaches the Lodge.',SOT),
    'o-behind-closed-doors':e('A quiet day in the park ends when you realise someone is following you, and you wake in a cold, damp cell with no idea how you got there. Find a way out.',SOT),
    'o-murder-on-the-stargazer-majestic':e('A passenger is murdered aboard an airship as a storm batters it far above the clouds. Question the others, gather evidence and find the killer before it’s too late.',HJ),
    'o-10-50-to-arkham':e('Your colleague vanishes aboard a train crossing the New England countryside, and others soon follow. Search the train for her while avoiding the enemies aboard.',HJ),
    'o-hidden-depths':e('Strange events aboard the ocean liner RMS Morgana turn into a race for the lifeboats. Not everyone aboard may be on your side.',HJ),
    'o-the-jungle-awakens':e('A garden party turns deadly when a sudden rumble transforms the grounds into tropical jungle.',POTS),
    'o-into-the-dark':e('Sent to help an expedition team, you find it threatened by something hidden in the dark.',POTS),
    'o-lost-temple-of-yig':e('A secret league of serpent-folk has gathered in an ancient jungle temple to call on their god, Yig. Find the ritual site in the maze-like temple and stop the rite before it’s complete.',POTS)
  };
})();
