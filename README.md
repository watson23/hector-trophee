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
2. **Environment variables.** Easiest is `npx vercel login && bash scripts/push-env.sh`,
   which copies `.env.local` into all three environments and redeploys. By hand: Settings →
   Environment Variables, the six `VITE_FIREBASE_*` values, for *Production*, *Preview* and
   *Development*.

   > **Do not mark any `VITE_*` variable as "Sensitive".** Sensitive values are decryptable
   > only at runtime, and a Vite build has no runtime — it inlines values at build time. A
   > Sensitive `VITE_*` variable reaches the bundle as an **empty string**, with no error, and
   > the app quietly falls back to its defaults. Everything prefixed `VITE_` is public once
   > built anyway, so Sensitive protects nothing and only breaks the build.

   Vite inlines these at build time, so **changing one needs a redeploy**, not just a restart.
3. Firebase → **Authentication → Settings → Authorized domains**: adding your `*.vercel.app`
   domain is only needed if you ever add a redirect-based sign-in (Google, email link).
   Anonymous sign-in works from any origin, so this app does not need it today.

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

Everything the organiser does lives behind the admin PIN. Unlock it once at the bottom of
**More → Organiser access**; after that an **Admin** button sits in the top-right corner of
every screen.

| When | What |
|------|------|
| Before Thursday | **Rounds** tab — confirm each round's course, tee and formats against the official programme, and clear the "provisional" flag |
| Thursday morning | **Flights** tab — assign players to flights for round 1 |
| Thursday, first tee | **Rounds** tab — set round 1 to *open* |
| Thursday evening | **Pairs** tab — enter the draft one pick at a time as it happens. Once round 1 is scored the app knows the order and tells you who is up, from either bucket |
| After the draft | **Flights** tab — *Auto-fill two pairs per flight* for rounds 2–6 |
| Each round | Set the round *open* when the first group tees off, *final* when everyone's in |
| Any time | **Scores** tab — correct any hole on any card in any round, including finished ones |

Only one round should be open at a time; that's the one on everyone's Play tab.

### The draft

Round 1 decides the order, and **the winner can come from either bucket** — in 2025 it was a
16.5 handicap from bucket 2 who picked first. Once round 1 has scores, the Pairs tab ranks
the field by Stableford points and names whoever is up next, showing only the opposite
bucket as their options. "Someone else" overrides that when reality diverges, and before
round 1 has been played it says so, since there is no order to work from yet.

### Fixing a wrong score

**Admin → Scores** reaches every card in every round, not just your own flight and not just
the open round. Pick the round, pick the player or pair, tap the hole, tap the score. Writes
merge per hole, so correcting hole 7 can't disturb the other seventeen — and it syncs to
everyone immediately, so you can fix a card while the group is still on the course.

### Test data

**Admin → Scores** has an amber **Test data** box.

*Play whole tournament* does the lot in about five seconds: plays round 1, runs the draft
from its Stableford order (best player picks first, from the other bucket), pairs everyone,
assigns two pairs per flight, and plays the remaining five rounds. *…with last round live*
leaves round 6 part-played, so you can see a leaderboard mid-round. *Reset everything*
clears the scores, the pairs and the flights.

Below that, the same box fills or clears just the round you have selected. That one refuses
to run on a round which already has scores — clear it first. The guard is deliberate; it is
the only thing between a stray tap and a real round.

Bulk tools write one document per card, not one per hole. A tournament is 100 writes rather
than 1800, which is the difference between five seconds and several minutes, and between
200 simulations a day on the Firestore free tier and about ten. Ordinary scoring still
writes per hole, because that is what makes two phones on one card merge safely.

Delete `src/lib/testdata.ts` and the Test data section of `src/screens/ScoreAdmin.tsx` before
the trip if you'd rather not have it there at all.

## Scoring

`src/lib/` holds the whole engine as pure functions, unit-tested in `src/lib/engine.test.ts`.

- `handicap.ts` — WHS course handicap `HI × slope/113 + (CR − par)`, allowances, stroke allocation
  (including handicaps over 18 and plus handicaps)
- `formats.ts` — Stableford, stroke play gross/net, better ball, scramble
- `hector.ts` — the pair competition
- `victor.ts` is folded into `engine.ts` — Σ Stableford points over the four Stableford rounds

### How Hector points work

The total behaves like a stroke count: **lower is better**, and roughly one stroke is one
point. Stroke-play formats contribute their net score directly. Stableford is the one that
has to be converted, since its points run the other way:

```
strokes = 2 × par − (points + 36)
```

42 points on a par 72 is `144 − 78 = 66` — the six-under the player actually shot.

Each round then contributes a share, configured per round:

| Round | Format | Weight | Why |
|-------|--------|--------|-----|
| R1 | Stableford | **1/3** | Light, so the draft round can't open a gap that kills the week on day one. Exactly a third — the published rules round it to 33%, but only 1/3 reproduces the real 2025 totals |
| R2 | Better ball | 50% | |
| R3 | Stroke play | 25% | Applied to **both** players, so ≈50% of one round. Older Hectors counted this round double everything else |
| R4 | Scramble | 50% | |
| R5 | Better ball | 50% | |
| R6 | Scramble | 100% | Heaviest, so the trophy stays live into the final round and one stroke ≈ one point while you play it |

The weights come to 10/3 rounds, so a pair going round in level par every round totals
exactly **240.0**, which the app shows under the Hector table as a reference. 2025 finished
with 222.0 winning, 242.6 last, mean 233.26.

### Verified against the real 2025 results

`src/lib/hector2025.fixture.ts` holds the twelve pairs and six rounds from the spreadsheet
the organiser kept by hand, and `hector2025.test.ts` replays them through this engine. All
twelve totals reproduce to six decimal places, in the right order, with the published gaps
of +2.9 and +7.8.

That fixture is the only ground truth for these rules, and it settled two things nothing
else could: the draft round's weight is exactly 1/3, and the final scramble's birdies are
counted gross (Lasse and Jari's net −4 round records 1 birdie and 0 eagles, and one net
birdie cannot put a team four under).

> ⚠️ The leaderboard published at hector.golf is uniformly **108.0 below** these figures —
> it showed the 2025 winners on 114.0 rather than 222.0. The gaps between pairs are correct
> there, only the absolute scale is off. This app follows the rules above, so its totals
> will not match that page.

## The end of the week

When every round is set to *final*, the Tournament tab leads with a champions card: the
gold trophy, the Hector-winning pair and their total, and the Victor. Ties at the top are
named rather than arbitrarily broken. Until then the app shows running totals as usual.

The gold eagle (`public/eagle-gold.png`) is a filled illustration of the same trophy, with
its grey background masked out by colour so it sits on the dark UI — the enclosed gaps
between the legs need a colour mask rather than a flood fill from the edges, which cannot
reach them. It is raster, so it belongs in large decorative places like this and the social
preview card (`public/og.png`), never in small chrome where the vector mark is sharper.

## The emblem

The falcon is hector.golf's own mark, taken from their favicon SVG so it stays sharp at any
size. `src/components/HectorMark.tsx` draws it as a single evenodd path in `currentColor` —
no mask, which matters because a mask needs a unique id every time the mark is rendered more
than once on a page. An `outline` variant comes free from the same path — stroked rather than filled, about a
third less ink, which reads better as a large faint watermark where a solid falcon turns
into a blob.

One falcon serves both competitions. A mirrored pair was tried for the Hector table, since
Hector is the pair event, but two birds at 16px are mush — and the premise was wrong anyway:
this statue *is* the Hector trophy, the one the winning pair takes home, so a single falcon
already says "pair competition".

It appears on the onboarding screen, as the Trophy tab icon, beside whoever leads each
leaderboard, faintly behind the Tournament header, and in the app icons (`public/icons/`,
rasterised from the same path).

## Course data

Par, stroke index and per-tee CR/slope for both Konopiště courses are in `src/data/courses.ts`,
taken from hector.golf.

⚠️ The **blue** tee on both courses is published with a rating *higher* than white — Radecký
76.1 vs 73.7, d'Este 75.8 vs 73.5. That is almost certainly the ladies' rating in the men's
column. If a round is played off blue, check the club scorecard and override CR/slope for that
round in **Admin → Rounds**. The app flags it.

The 2026 tees aren't announced, so every round defaults to yellow rather than guessing.
