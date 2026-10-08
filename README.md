# Mansions of Madness Casebook

A play log for Mansions of Madness (Second Edition), official app scenarios and Valkyrie ones alike: who played, which investigators they took, pass or fail, attempts, the rules you used, and notes. Sign in with Google or an email, and it works on phones and computers, installs like an app and keeps working offline.

It's a free, unofficial fan project, not affiliated with or endorsed by Fantasy Flight Games.

## What it does

- **Plays.** Log a play in a few taps: scenario, date, result (Passed, Failed or Abandoned), which attempt it was, each player and their investigator, rules, notes. Search and filter by result, person, investigator or scenario. Tap a play to edit or delete it.
- **Scenarios.** All 23 official app scenarios grouped by the product that unlocks them, plus the 168 Valkyrie fan scenarios from the Valkyrie app's own catalogue (with author, difficulty and length), plus any you add yourself. Each shows Beaten / Not beaten yet / Not played; search by name or author. Tick the products you own in Settings, where the Valkyrie list can be switched off too (ones you've played still show).
- **Official investigators only.** Each seat picks from the 40 Second Edition investigators (grouped by box) or Unknown; custom characters can't be saved, and the database rules enforce it. Imports map names like "Tommy" or "Ashcan Pete" to the official ones and leave anything else as Unknown (noted on the play). If older plays hold a non-official name, the Plays tab offers **Fix them**, with each name pre-matched to its official investigator.
- **Scenarios list.** Every scenario you can play in one list: filter by source (official, Valkyrie, your own), your progress, difficulty, length and rating; sort by box, name, highest rated, most played, shortest, longest, easiest, hardest, easiest to pass or most recently played. Each shows its difficulty, typical length (Valkyrie players' real average where known), the Valkyrie players' average score out of 10, pass rate and play count, your own record, and any published reviews (`js/reviews.js`: hand-collected, linked and summarised in our own words). Difficulty, length and rating aren't published for the official scenarios, so those filters only cover Valkyrie ones.
- **Where you played.** An optional location on each play, remembered from last time, searchable and counted in Stats.
- **Players.** The people you play with, without them needing accounts: just their names and an optional note, with plays, pass rate, last game and their usual investigator. Put them in **groups** (one person can be in several); when logging a play, pick a group to fill in the seats, then adjust for that scenario. Names already typed into plays can be saved with one tap, and renaming someone can update their past plays too.
- **Stats.** Win rates per person, per investigator, per scenario, by party size, by rules variant and by scenario type.
- **Import.** From a Google Sheet link (shared as "Anyone with the link") or a CSV file. Understands the original tracking sheet's columns (*Scenario, Played, Characters, Pass/Fail, Notes, Rules*) and this site's own export. Short investigator names are expanded ("Tommy" → Tommy Muldoon); "Passed on 3rd try" becomes a pass on attempt 3; rows marked N under Played are skipped; anything already imported is never added twice.
- **Profile pictures.** In the account menu (your picture and name, top right), **Your account** lets you choose a picture, position and zoom it in a circle, and change your name; it shows on your account button (and in the admin page's account list). Google sign-ins use their Google photo until they pick one.
- **Export.** CSV (opens in any spreadsheet, and imports back) and a JSON backup. Delete all plays, or the whole account, from Settings.
- **Installable and offline.** Install app is in the account menu. Plays logged offline sync when you're back online.

## Setup (one time)

Everything here is done in your browser; no secrets go into the code or into chat.

1. **GitHub:** create an empty repository `maniac782/momcasebook` (no README) and push this code to it.
2. **Firebase:** at <https://console.firebase.google.com>, *Add project*. Use the ID `momcasebook` if it's free (the site is then **momcasebook.web.app**); if it's taken, choose another and put it in `.firebaserc`. Analytics: off. The free Spark plan is enough; nothing here needs Blaze.
   - *Build → Authentication → Get started*: enable **Google** and **Email/Password**.
   - *Build → Firestore Database → Create database*: production mode, a US location.
   - *Build → Hosting → Get started*: just click through (the workflow does the deploying).
   - *Project settings → Your apps → Web (`</>`)*: register an app named "Mansions of Madness Casebook". You don't need to copy its settings; Hosting serves them to the site at `/__/firebase/init.json`.
3. **Deploy key:** in Google Cloud for that project (<https://console.cloud.google.com/iam-admin/serviceaccounts>), create a service account `github-deploy` with the roles **Firebase Hosting Admin**, **Firebase Rules Admin**, **API Keys Viewer** and **Service Usage Consumer**. Under *Keys → Add key → JSON*, download the key. In GitHub, *Settings → Secrets and variables → Actions → New repository secret*: name it `FIREBASE_SERVICE_ACCOUNT` and paste the whole file there (only there). Then delete the downloaded file.
4. **Deploy:** push to `main`, or *Actions → Deploy to Firebase → Run workflow*. It runs the tests, then publishes the site and `firestore.rules`.
5. **Make yourself admin:** sign in on the site once. In Firebase *Authentication → Users*, copy your **User UID**. In *Firestore*, start collection `admins`, document ID = that UID, no fields. The account menu then shows **Admin**.
6. **Import your sheet:** *Settings → Import from a spreadsheet*, paste the sheet link, *Load sheet*, check the preview, *Import*. The old sheet didn't record who played, so open each play to add people.

## Admin page

`admin.html`, for accounts with an `admins/{uid}` document (the rules enforce it):
- **Accounts:** name, email, plays logged, joined, last seen. (Admins can't see anyone's plays.)
- **Shared scenarios:** add Valkyrie (or missing official) scenarios that everyone can pick when logging.
- **Feedback** sent from the account menu, and **Errors** recorded automatically while people are signed in.

## How it's built

Plain HTML, CSS and JavaScript, no build step. Firebase compat SDK 10 (Authentication, Firestore with offline persistence), Firebase Hosting, a service worker for the offline app shell.

| File | What it is |
|---|---|
| `index.html`, `js/app.js` | The main app: sign-in, Plays, Scenarios, Players, Stats, Settings |
| `admin.html`, `js/admin.js` | The admin page |
| `js/catalog.js` | Official scenarios by product, the 40 official investigators, name matching |
| `js/reviews.js` | Published reviews of scenarios, collected by hand: source link, date and a one-line summary written for this site |
| `js/valkyrie.js` | The built-in Valkyrie scenario list. Generated by `scripts/fetch-valkyrie.py`; re-run it to pick up new scenarios, then bump the version |
| `js/importer.js` | Google Sheets / CSV import and CSV export (pure functions, tested in Node) |
| `js/config.js` | Firebase start-up (settings from `/__/firebase/init.json`), error reporting, service worker registration |
| `js/shared.js` | Account menu, Install app, Send feedback, dialogs, toasts |
| `js/version.js` | **The version number**, bumped on every change |
| `sw.js` | Offline copy of the site; cache named after the version |
| `css/app.css` | All styles, light and dark themes |
| `firestore.rules` | Who can read and write what |
| `.github/workflows/deploy.yml` | Tests, then deploys Hosting and the rules on every push to `main` |
| `.github/workflows/valkyrie-refresh.yml` | Every Monday: refreshes `js/valkyrie.js` from the Valkyrie catalogue, bumps the version, commits and deploys |
| `test/` | `importer.test.js`, `house-rules.test.js` (version bump, no yellow), `ui.test.js` (headless end-to-end with a fake Firebase) |

### Data

- `users/{uid}`: name, email, created, lastSeen, playCount, owned products, hideValkyrie, photo (a 256×256 JPEG as a data URL, under 60,000 characters; kept in Firestore because Cloud Storage now needs the paid Blaze plan).
- `users/{uid}/plays/{id}`: scenarioId, scenarioName, scenarioType (official / valkyrie / custom), date, result, attempts, party `[{player, investigator}]`, solo, rules, notes, created, updated (and importKey, seq for imported rows).
- `users/{uid}/scenarios/{id}`: each person's own Valkyrie and homemade scenarios.
- Investigators in `party` must be one of the official names in `investigators()` in `firestore.rules`, the same list as `js/catalog.js` (CI checks they match; sources noted there).
- `users/{uid}/people/{id}`: regular players (name, notes). `users/{uid}/groups/{id}`: groups of them (name, members: people ids). Plays store player names as text, so deleting a player leaves past plays as they were.
- `scenarios/{id}`: shared scenarios from the admin page. `admins/{uid}`, `feedback`, `errors` as above.

### Valkyrie scenarios
**Refreshed automatically every Monday** by `.github/workflows/valkyrie-refresh.yml`: it runs the script below, and if anything changed (new scenarios or updated community numbers) it bumps the version, runs the tests, commits and starts the deploy. It can also be run by hand from the Actions tab (*Refresh Valkyrie scenarios → Run workflow*). Scenarios that leave the catalogue are kept, marked retired, so old plays keep their details.

The list comes from [NPBruce/valkyrie-store](https://github.com/NPBruce/valkyrie-store) (`MoM/manifestDownload.ini`), the catalogue the Valkyrie app downloads. Kept: names (version tags removed), authors, difficulty, play length, and the catalogue's community numbers: plays, pass rate, average length and average rating (players score 1 to 10 after a game; individual comments aren't published). Hidden entries are skipped. To refresh: `python3 scripts/fetch-valkyrie.py`, bump `js/version.js`, push. A scenario newer than the built-in list can also be added for everyone on the admin page.

### Costs

On the free Spark plan: Firestore's free daily reads and writes are far beyond what a play log uses, and Hosting and Authentication are free at this size.

## Art

The icons are an original drawing made in code by `scripts/make-icons.py` and dedicated to the public domain (CC0). Only public-domain art is used on this site. Fonts: IM Fell English (a revival of the 17th-century Fell types), Source Sans 3 and IBM Plex Mono, from Google Fonts.
