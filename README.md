# Homebase Mobile

The phone version of Homebase: Home, Plan (tasks · calendar · chores), Money, Food (shopping list · meal plan · recipes),
Notes and Automation - as an offline web app for the iPhone. Installed once from Safari, then it runs without internet
and with the laptop off. **Your data lives only on the phone** (nothing is ever uploaded); this repo holds only the app's code.

## Put it online (once)

1. Push this folder to the GitHub repo `Nyco-T/Homebase` (branch `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / `(root)` → Save**.
   (GitHub Pages on a free account needs the repo to be **public**. That's fine: only code is in it, no data.)
3. After a minute the app is at **https://nyco-t.github.io/Homebase/**.

## On the iPhone (once)

1. Open https://nyco-t.github.io/Homebase/ in **Safari**.
2. **Share → Add to Home Screen → Add.** From now on open it from the Home Screen icon - it works offline.
3. Bring your lists over: on the laptop, Homebase → **Settings → Export for iPhone** → AirDrop / iCloud Drive the file
   to the phone → in the app **More → Settings & backup → Import**.
4. Optional: **More → Settings → Morning summary** for a daily notification and the number on the icon (iOS 16.4+).

## Updates

Change something, raise `VERSION` in `sw.js` (e.g. `1.0.1`), commit and push. The next time the app starts with internet
it downloads the new version in the background and shows **"A new version of Homebase is ready - Reload"**.
Your data stays untouched; if the data format ever changes, it's converted on the first start (after a backup copy).

## Backup

**More → Settings & backup → Export backup** saves a file to Files / iCloud. Homebase reminds you after 7 days without one.
The same file can be imported again, on this phone or a new one.

## Code

Plain HTML, CSS and JavaScript - no framework, no build step, nothing loaded from the internet at run time.

| File | What it is |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | the page, the home-screen app info, the offline copy |
| `js/db.js` | data in IndexedDB, import / export |
| `js/kinds.js` | the nine lists and their logic (repeating tasks, chores, repeating entries …) |
| `js/auto.js`, `js/rules.js`, `js/reminders.js` | automation (levels 0-5, rules, log with Undo) and everything with a date |
| `js/form.js`, `js/ui.js`, `js/quick.js` | the edit sheet, building blocks, quick add |
| `js/pages/*.js` | Home, Plan, Money, Food, More |

Test locally: `python3 -m http.server 8765` in this folder, open http://localhost:8765 in a phone-sized browser window.
