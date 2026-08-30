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
6. **Deploy the security rules** (once, and again whenever `firestore.rules` changes):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # pick the project, alias it "default"
   firebase deploy --only firestore:rules
   ```

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

## Access codes

Event code `HEC26` and admin PIN `1874` by default. Override with `VITE_EVENT_PIN` and
`VITE_ADMIN_PIN` — locally in `.env.local`, on Vercel as environment variables. The app
reconciles the stored hashes on load, so changing a PIN and redeploying takes effect on an
already-seeded event.

These are **gates, not secrets**. Both PINs are compiled into the client bundle, and
`firestore.rules` only requires that a client be signed in anonymously. That keeps the open
internet out of the database; it does not stop one of the twenty from poking around in devtools.

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
