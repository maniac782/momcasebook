# Working on Mansions of Madness Ledger

Standing preferences from Dan, the owner. They apply to every change in this repo.

1. **Bump the visible version on every change.** The version lives only in `js/version.js` (`APP_VERSION = 'vN'`); every page footer, the account menu and the offline cache name read it from there. Any change to a published file needs `N` raised by one. CI (`test/house-rules.test.js`) fails a push that changes the site without a bump.
2. **Only public-domain art.** No pictures, icons, textures or illustrations unless they are public domain (or original work dedicated CC0, like the icons drawn by `scripts/make-icons.py`). Note the source of anything added in the README's *Art* section. Fonts are not art and can come from Google Fonts.
3. **No yellow in the UI.** No yellow, gold, amber, mustard or brass, in either theme, in CSS, HTML, JS, the manifest or the icons. Use the colour tokens in `css/app.css`. CI checks this too.
4. **Don't paste secrets into chat.** Service-account keys and any other credentials go straight into GitHub repository secrets or Google Cloud; never ask for them in a conversation, never print them, never commit them. (The Firebase web settings at `/__/firebase/init.json` are public by design and aren't secrets.)

Also:
- Keep this a separate site and Firebase project from the Arkham Horror RPG Ledger (`maniac782/arkhamrpg`); share patterns, not data or projects.
- Run `node test/importer.test.js` and `node test/house-rules.test.js` before pushing. `test/ui.test.js` is a headless end-to-end check (needs Playwright).
- Keep the README in step with features.
