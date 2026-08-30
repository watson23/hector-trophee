# Hector Trophée 2026

Live scoring for the Konopiště trip, 24–27 September 2026. Twenty players, ten pairs, six
rounds, five game formats, five flights entering scores at the same time on their own phones.

Built as an installable PWA: Vite + React + TypeScript + Tailwind, Firestore for sync,
deployable to Vercel or Firebase Hosting.

```bash
npm install
npm run dev      # http://localhost:3016
npm test         # scoring engine
npm run deploy   # build + firebase deploy
```

## Demo mode

With no Firebase config the app runs against a localStorage backend that broadcasts between
browser tabs. Everything works — scoring, leaderboards, admin — but scores stay on the device.
A banner says so. This is what you get straight after `npm install`.

Default PINs: event `HEC26`, admin `1874` — see **Access codes** below.

## Setting up Firebase

Firestore is the database. Hosting can be either Vercel or Firebase — see below.

1. **Create the project** at <https://console.firebase.google.com> — any name, e.g. `hector-trophee`.
   Google Analytics not needed.
2. **Firestore Database** → *Create database* → **production mode** → location **`eur3`**
   (Europe, closest to Czechia).
3. **Authentication** → *Get started* → Sign-in method → enable **Anonymous**.
4. **Project settings → Your apps** → add a **Web** app (`</>`), skip Firebase Hosting in that
   wizard → copy the six `firebaseConfig` values.
5. Locally: `cp .env.example .env.local` and paste them in. Restart `npm run dev`.
6. **Deploy the security rules** (once, and again whenever `firestore.rules` changes).
   Firestore in production mode denies everything until you do, so the app will show
   *"Can't reach the scoring database"* until this runs.

   ```bash
   npx firebase login
   npm run rules
   ```

   `firebase-tools` is a devDependency and `.firebaserc` already names the project, so
   there's no global install and no `firebase use --add`. Avoid `npm install -g` here —
   on a stock macOS setup it fails with `EACCES` on `/usr/local/lib/node_modules`.

The first client to connect seeds `events/HECTOR2026` with the 20 players and the six rounds.

## Deploying

### Vercel (recommended)

`vercel.json` is committed, so it's just:

1. <https://vercel.com/new> → import `watson23/hector-trophee`. Framework preset **Vite** is
   detected; build command and output directory come from `vercel.json`.
2. **Settings → Environment Variables** — add all six `VITE_FIREBASE_*` values from
   `.env.example`, for *Production*, *Preview* and *Development*. Vite inlines these at build
   time, so **changing one needs a redeploy**, not just a restart.
3. Deploy, then go back to Firebase → **Authentication → Settings → Authorized domains** and add
   your `*.vercel.app` domain (and any custom domain). Anonymous sign-in fails silently from an
   unauthorised domain.

If the env vars are missing, the deployed app shows a red **"Not connected"** banner rather than
quietly giving every player their own private database.

### Firebase Hosting

`firebase.json` is also committed, so `npm run deploy` builds and ships to `<project>.web.app`.
Both can coexist; they're just two fronts for the same Firestore.

### If npm fights you

This machine has a root-owned npm cache, which makes `npm install` fail with `EACCES` on
`~/.npm`. Workaround per command:

```bash
npm install --cache /tmp/.npmcache
```

Permanent fix (needs your password): `sudo chown -R $(id -u):$(id -g) ~/.npm`

## Access codes

Event code `HEC26` and admin PIN `1874` by default. Override with `VITE_EVENT_PIN` and
`VITE_ADMIN_PIN` — locally in `.env.local`, on Vercel as environment variables. The app
reconciles the stored hashes on load, so changing a PIN and redeploying takes effect on an
already-seeded event.

> **This repo is public, so those defaults are public too.** Set both to something else in the
> Vercel environment variables before sharing the link with the group, or anyone who finds the
> URL can walk in and edit scores.

Even then they are **gates, not secrets**. Whatever you set is compiled into the client bundle,
and `firestore.rules` only requires that a client be signed in anonymously. That keeps the open
internet out of the database; it does not stop one of the twenty from poking around in devtools.

## Contributing

```bash
npm install && npm run dev    # http://localhost:3016, demo mode, no Firebase needed
npm test                      # the scoring engine
```

Demo mode means you can develop the entire app — scoring, leaderboards, admin, even live sync
between two browser tabs — without any cloud credentials. Open two tabs and enter a score in one
to see it appear in the other.

The scoring rules live in `src/lib/` as pure functions with no React or Firebase imports, and
that's where changes should go: `handicap.ts`, `formats.ts`, `hector.ts`, `engine.ts`,
`leaderboard.ts`. Anything touching how a score is computed wants a case in
`src/lib/engine.test.ts` — the fixtures there are hand-worked from the Radecký scorecard, so
they'll tell you quickly if an allowance or a stroke index is off by one.

## Running the week

Everything the organiser does lives behind the admin PIN, under **More → Organiser access**.

| When | What |
|------|------|
| Before Thursday | **Rounds** tab — confirm each round's course, tee and formats against the official programme, and clear the "provisional" flag |
| Thursday morning | **Flights** tab — assign players to flights for round 1 |
| Thursday, first tee | **Rounds** tab — set round 1 to *open* |
| Thursday evening | **Pairs** tab — enter the draft one pick at a time as it happens |
| After the draft | **Flights** tab — *Auto-fill two pairs per flight* for rounds 2–6 |
| Each round | Set the round *open* when the first group tees off, *final* when everyone's in |

Only one round should be open at a time; that's the one on everyone's Play tab.

## Scoring

`src/lib/` holds the whole engine as pure functions, unit-tested in `src/lib/engine.test.ts`.

- `handicap.ts` — WHS course handicap `HI × slope/113 + (CR − par)`, allowances, stroke allocation
  (including handicaps over 18 and plus handicaps)
- `formats.ts` — Stableford, stroke play gross/net, better ball, scramble
- `hector.ts` — the pair competition
- `victor.ts` is folded into `engine.ts` — Σ Stableford points over the four Stableford rounds

### The Hector formula is provisional

The published wording is "33% of the better individual's score", "50% of the team's score" and so
on, but it never says what currency those scores are in — and taking it literally does not
reproduce hector.golf's own numbers. The 2025 winners finished on **114.0** with last place on
**134.6**, whereas a literal weighted sum of net strokes comes to roughly 190–210 for any
plausible set of scores.

The weights sum to 3.33 round-equivalents, and 114.0 / 3.33 ≈ 34.2 — which is exactly
`net strokes − 36` for a net 70, and `72 − points` for a 38-point Stableford round. So the default
strategy, `parNormalised`, expresses every round in those terms. It reproduces hector.golf's scale
and ordering, but it is **inference, not the official rule**.

Two alternatives are written and ready in `src/lib/hector.ts`. Switching is one line:

```ts
export const HECTOR_STRATEGY: HectorStrategyName = "parNormalised";
```

When the real formula is confirmed, change that constant (or write a fourth strategy) and add a
test that reproduces the 2025 final leaderboard. Nothing else in the app needs to change.

## Course data

Par, stroke index and per-tee CR/slope for both Konopiště courses are in `src/data/courses.ts`,
taken from hector.golf.

⚠️ The **blue** tee on both courses is published with a rating *higher* than white — Radecký
76.1 vs 73.7, d'Este 75.8 vs 73.5. That is almost certainly the ladies' rating in the men's
column. If a round is played off blue, check the club scorecard and override CR/slope for that
round in **Admin → Rounds**. The app flags it.

The 2026 tees aren't announced, so every round defaults to yellow rather than guessing.
