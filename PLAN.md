# Homebase Mobile — the plan

The complete Homebase as an **offline web app for the iPhone 13 Pro**: installed once from Safari
("Add to Home Screen"), then it runs **offline, anywhere, with the laptop off**. Data lives **only on the iPhone**.
Separate from the desktop app (no sync for now). Automation-first, like the desktop app.

## Decisions
- **Hosting:** GitHub Pages, own new repo `homebase-mobile` on a **private GitHub account**.
  Only the app's code goes there — never data. Commits with private name + e-mail (never the work e-mail,
  nothing from `~/Projekte`). Nico creates the account / repo and pushes the first time himself.
- **Start data:** one-time import — the laptop exports `homebase-export.json`, the iPhone imports it.
- **Tech:** plain HTML + CSS + JavaScript, no framework, no build step, no outside libraries at run time
  (works offline, nothing to update). Data in IndexedDB on the iPhone. A service worker caches the app.
- **Look:** the same calm Claude look (dark/light, sage accent), made for one-hand use: tab bar at the bottom,
  big tap targets, safe areas around the notch.

## Pages (same as the desktop app)
| Tab | What's in it |
|---|---|
| Home | today, coming up, money this month + month-end forecast, shopping list, meals, automation |
| Plan | Tasks · Calendar · Chores |
| Money | entries (month/year/all), repeating entries, category chart, quick entry |
| Food | Shopping list · Meal plan · Recipes |
| More | Notes, Automation (levels, suggestions, log with Undo), Settings, Backup |

Quick add on every page ("12,50 Mittag", "todo Mama anrufen fr", "kaufe Milch, Eier").

## Automation (runs on the phone)
Same rules as the desktop app: repeating entries booked, categories guessed, monthly money report, month-end forecast,
old overdue tasks to Someday, gift task before birthdays, weekly review, restock what you buy often,
meal plan → shopping list, meal suggestions. Log with Undo, never deletes. Notifications (iOS 16.4+, once allowed)
for what's due today.

## Safety
- **Backup:** "Export" button → file into Files / iCloud; reminder after 7 days without a backup.
- Every entry has `updated` (for a later sync) — same JSON format as the desktop app.
- Asks iOS for persistent storage, so Safari doesn't clear the data.
- No logins, no tracking, no outside requests after install.

## Steps
- [x] 1. Desktop Homebase: "Export for iPhone" button (one file with all lists)
- [x] 2. Mobile shell: tab bar, look, offline (manifest + service worker), storage
- [x] 3. Data + quick add + import/export
- [x] 4. Home, Plan (tasks, calendar, chores)
- [x] 5. Money, Food (shopping, meal plan, recipes), Notes
- [x] 6. Automation + notifications
- [x] 7. Test in a phone-sized browser, light + dark
- [ ] 8. Nico: GitHub account + repo, first push, Settings → Pages on; open on the iPhone, Add to Home Screen, import
