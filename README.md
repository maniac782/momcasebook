# Mansions of Madness Casebook

A play log for Mansions of Madness (Second Edition), official app scenarios and Valkyrie ones alike: who played, which investigators they took, pass or fail, attempts, the rules you used, and notes. Sign in with Google or an email, and it works on phones and computers, installs like an app and keeps working offline.

It's a free, unofficial fan project, not affiliated with or endorsed by Fantasy Flight Games.

## What it does

- **Plays.** Log a play in a few taps: scenario, date, result (Passed, Failed or Abandoned), which attempt it was, each player and their investigator, rules, notes. Search and filter by result, person, investigator or scenario. Tap a play to edit or delete it.
- **Scenarios.** All 23 official app scenarios grouped by the product that unlocks them, plus the 168 Valkyrie fan scenarios from the Valkyrie app's own catalogue (with author, difficulty and length), plus any you add yourself. Each shows Beaten / Not beaten yet / Not played; search by name or author. Tick the products you own in Settings, where the Valkyrie list can be switched off too (ones you've played still show).
- **Stats.** Win rates per person, per investigator, per scenario, by party size, by rules variant and by scenario type.
- **Import.** From a Google Sheet link (shared as "Anyone with the link") or a CSV file. Understands the original tracking sheet's columns (*Scenario, Played, Characters, Pass/Fail, Notes, Rules*) and this site's own export. Short investigator names are expanded ("Tommy" → Tommy Muldoon); "Passed on 3rd try" becomes a pass on attempt 3; rows marked N under Played are skipped; anything already imported is never added twice.
- **Profile pictures.** Choose a picture in Settings, position and zoom it in a circle; it shows on your account button (and in the admin page's account list). Google sign-ins use their Google photo until they pick one.
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
| `index.html`, `js/app.js` | The main app: sign-in, Plays, Scenarios, Stats, Settings |
| `admin.html`, `js/admin.js` | The admin page |
| `js/catalog.js` | Official scenarios by product, investigator suggestions, name matching |
| `js/valkyrie.js` | The built-in Valkyrie scenario list. Generated by `scripts/fetch-valkyrie.py`; re-run it to pick up new scenarios, then bump the version |
| `js/importer.js` | Google Sheets / CSV import and CSV export (pure functions, tested in Node) |
| `js/config.js` | Firebase start-up (settings from `/__/firebase/init.json`), error reporting, service worker registration |
| `js/shared.js` | Account menu, Install app, Send feedback, dialogs, toasts |
| `js/version.js` | **The version number**, bumped on every change |
| `sw.js` | Offline copy of the site; cache named after the version |
| `css/app.css` | All styles, light and dark themes |
| `firestore.rules` | Who can read and write what |
| `.github/workflows/deploy.yml` | Tests, then deploys Hosting and the rules on every push to `main` |
| `test/` | `importer.test.js`, `house-rules.test.js` (version bump, no yellow), `ui.test.js` (headless end-to-end with a fake Firebase) |

### Data

- `users/{uid}`: name, email, created, lastSeen, playCount, owned products, hideValkyrie, photo (a 256×256 JPEG as a data URL, under 60,000 characters; kept in Firestore because Cloud Storage now needs the paid Blaze plan).
- `users/{uid}/plays/{id}`: scenarioId, scenarioName, scenarioType (official / valkyrie / custom), date, result, attempts, party `[{player, investigator}]`, solo, rules, notes, created, updated (and importKey, seq for imported rows).
- `users/{uid}/scenarios/{id}`: each person's own Valkyrie and homemade scenarios.
- `scenarios/{id}`: shared scenarios from the admin page. `admins/{uid}`, `feedback`, `errors` as above.

### Valkyrie scenarios
The list comes from [NPBruce/valkyrie-store](https://github.com/NPBruce/valkyrie-store) (`MoM/manifestDownload.ini`), the catalogue the Valkyrie app downloads. Only names, authors, difficulty and play length are kept; hidden entries are skipped. To refresh: `python3 scripts/fetch-valkyrie.py`, bump `js/version.js`, push. A scenario newer than the built-in list can also be added for everyone on the admin page.

### Costs

On the free Spark plan: Firestore's free daily reads and writes are far beyond what a play log uses, and Hosting and Authentication are free at this size.

## Art

The icons are an original drawing made in code by `scripts/make-icons.py` and dedicated to the public domain (CC0). Only public-domain art is used on this site. Fonts: IM Fell English (a revival of the 17th-century Fell types), Source Sans 3 and IBM Plex Mono, from Google Fonts.
