# Hector Trophée — design system

The app is a **broadcast graphics package**, not a dashboard: think the on-screen
world of a golf telecast — chyrons, lower-thirds, a scoreboard face — rendered as
a phone app. Every visual decision below was made against that concept. Change
them deliberately, in tokens, never ad hoc per screen.

## Ground

- The entire `slate` scale is **remapped** in `tailwind.config.js` to a true
  neutral with a hair of violet (950 = `#0a0a0c`). Greys lifted twice after tester
  feedback (last 5.9.2026): 400 ≈8.5:1, 500 ≈6.5:1, 600 ≈4.4:1 on the ground — small
  grey captions must read as chosen, not faint. Never reintroduce Tailwind's
  default blue-cast slate/gray — it is the single most recognizable template tell.
- Dark only, by choice: the app lives on phones outdoors and on TVs at night.
  There is no light theme and none is planned.

## Color roles (each color has ONE job)

| Color | Job | Never |
|---|---|---|
| `gold` (custom scale, 400 = `#e3b341`) | Leaders, trophies, ceremony | Interactive accents, decoration |
| `violet` scale — **remapped to Hector purple, deep royal** (600 = `#5340ad`) | Interactive accent: active states, selection, "you", CTAs | Score semantics. hector.golf's wordmark is stock violet; ours is a clear step darker and bluer so it is the brand's colour without the template tell. The scale in `tailwind.config.js` is the single source of truth — change the palette only there |
| `emerald` | Live/now (the breathing dot), positive deltas, free slots | Backgrounds at full saturation |
| `rose` | **Under par** (golf convention: red = under) | Errors as a habit — errors are amber |
| `sky` / `blue` | **Over par**, two steps as on golf TV: sky-300 for a bogey, blue-400 (ring blue-500) for double or worse — deep enough to read as worse, light enough for black | Links |
| `amber` | Warnings (suspect tee, provisional), the yellow tee dot | — |

Score tinting follows golf-TV convention, not web convention: red is *good*
(under par), blue is *mild bad* (over). Do not "fix" this.

## Legibility floor (tester-driven, 3.9.2026)

- Secondary text (slate-500) stays ≥5:1 on the card ground, faint text (slate-600)
  ≥3:1 — the scale values in tailwind.config.js encode this; never dip below by
  adding darker greys per-component.
- Smallest UI text is 11px; body-adjacent micro-copy 12px; `text-xs` = 13px.
  The app is read in sunlight on a moving cart — whitespace pays for type, not
  the other way around.

## Type roles

| Face | Class | Job |
|---|---|---|
| Geist | `font-sans` (default) | Body copy, names, UI — the user's personal body face, shared with his other apps (notebob), pairing with Fraunces there too |
| Barlow Semi Condensed 700 | `.score` | Big score figures — the app's headline face |
| Inconsolata | `.num` | Tabular data: aligned digits, tee times, HCPs, micro-labels |
| Fraunces | `font-serif` | **Ceremony only**: champions, draft night, round-finish. Never in daily UI |

- Uppercase + tracked micro-labels (`.label`) are the chyron voice — keep them,
  they are broadcast vernacular, not template filler.
- Digits that align vertically always get `.num` (tabular numerals).

## Scoreboard conventions

- Leaderboards are **de-boxed**: full-bleed rows with hairline dividers
  (`divide-slate-800`-ish), never cards-in-cards.
- Leader marker: gold inset bar (`shadow-[inset_3px_0_0]`) + gold name and
  score. Violet bar = spectator's followed player; a softer violet wash with a violet
  name = the signed-in player's own row and pair (no bar, no star). These bars carry meaning —
  never add colored left borders as decoration.
- Display = **how the score is spoken**: stroke formats lead with to-par
  ("−12 (60)"); Stableford leads with points ("40 (−4)").
- Weight labels are percentages ("H 50%"), never fraction glyphs.
- Score marks: shape encodes result (ring = birdie, square = bogey, doubled =
  eagle/double), numeral stays bright; on the one-nine scorecard the `lg` mark is a
  32px cell with a 20px scoreboard-face numeral. No legend: the notation is the
  one every golfer knows, and a minute with the card explains the rest.

## In-round Play: two modes, never one screen

- **On the course** (default): hole big + `Par · SI · m` line, the flight's standings
  in the round's main tournament format, one `Enter scores · hole N` door. No score
  buttons exist here — a pocketed phone cannot score.
- **Entry sheet** (on demand): only scoring, and a full flight fits one screen with
  no scrolling: no page header (the hole is the header), de-boxed rows with the
  player's HCP and stroke on the name line, 56px buttons with 26px scoreboard digits
  (64/28 for a two-ball), no par ring (selection is the only highlight), one ‹ › hole
  nav, Done and `Next hole →` side by side — the latter enabled once the flight is
  scored and returning to the course.
- **Scorecard** (Claude Design handoff, 6.9.2026 — option 3a, with 2a / 2b for the other
  round types): one nine at a time — the switch says `1–9` / `10–18`, the header's
  last column says Out / In — never 18 columns. Tabs are the round's
  formats (main one first); the headline follows the tab — net to par, points, or gross
  to par. Caption rule everywhere: `61 (+9) gross` on a net tab, `61 (+9) · net +4` on
  Stableford, `65 strokes` on a gross tab — so net and gross are never confused. One
  shared header: HOLE (tappable) · SI · PAR over a name column + nine cells + the nine's
  total. Every card is a name line (whole-round totals) over a `gross` row of marks and a
  `net` / `pts` row, the labels in the name column. On a Better Ball day the cards sit in
  a block per pair under a small mono pair label with the pair's figure, the counted ball
  bright and bold in the net row, and the pair's counted net as a `PAIR` row; marks 28px.
  Single cards 30px; a scramble is one card per pair at 32px.
- **Hole map zoom** (`usePinchZoom`): the page never zooms (`maximum-scale=1`), so the
  map has its own gesture in a frame the full content width at the fitted height (a long
  straight hole is a thin strip fitted, and needs the room) — pinch about the fingers'
  midpoint up to 4×, one-finger pan
  once zoomed, double tap in or back out, trackpad pinch on a desk. Fitted, the page
  still scrolls over it (`touch-action: pan-y`); zoomed, the map takes the touch and the
  distance labels step aside for a `Reset zoom` link.
- The rule behind it: walking and entering are different moments with different
  needs; anything on the entry sheet that isn't scoring is clutter, anything on the
  course view that can be tapped by accident is a hazard.

- **Trophée breakdowns** (expanded row): one header line per round — `R1` in the score
  face, the day quiet, then the placing badge and the round's figure a size up — with
  the formats that made it on a thin rail beneath at 13px, their arithmetic at 11px.
  Placings are the one `PlaceBadge` the app uses everywhere — the leaderboards'
  position column and these round headers — black on light purple, gold for a win,
  fixed width so a column of them lines up. One look for one meaning: a player
  scanning their week picks out every placing at a glance.

## Motion

- Row re-ranking glides via FLIP, **gated to actual order changes** (WebKit
  renders animated `tr` transforms poorly; never animate on data-only updates).
- Changed scores pulse the accent once (`LeaderTable` hardcodes the rgba of violet-500 — keep it in step with the scale); the live dot breathes with `currentColor`.
- Everything respects `prefers-reduced-motion`.
- One orchestrated moment beats scattered effects: ceremony flourishes exist at
  round finish and map completion only.

## Guardrails (AI-slop tells this app deliberately avoids)

- No emoji as icons — draw a small SVG or use none.
- No glassmorphism, no decorative gradients. The gradients that exist are earned:
  round-finish ceremony, champions plaque, TV follow strip, and the course-hero
  scrim (below). Do not add more.
- **Course establishing shots** (`CourseHero`): a real photo may open a card the
  way a broadcast opens with the venue — full-bleed at the card top, scrimmed
  into the card's own background (`from-slate-900`), toned down
  (`brightness-[0.88] saturate-[0.9]`), captioned in the chyron voice
  (uppercase tracked `num`). Photos are bundled + precached (public/courses/,
  ~900px webp), never hotlinked. This is the template for any future
  "eye-pleaser": imagery serves as an establishing shot, integrated through
  scrim + caption — never pasted into a layout as-is.
- No centered-hero-with-badge layouts; the onboarding title screen is the one
  centered composition.
- Copy tone: quiet, purposeful, no exclamation marks, no authority framing
  ("Scoring opens with the round", not "the organiser must open the round").
  Escape hatches are worded for their use case, never as dares.
- Palette changes happen **only** by remapping scales in `tailwind.config.js`
  (the slate remap is the precedent) — never by touching component classes.
- Tailwind config changes require a dev-server restart; HMR won't pick them up.

## Assets

- Icon: ink-line falcon on flat gold `#e3b341` (`public/icons/`, `mark.svg`).
- OG image: broadcast composition (eagle, tracked wordmark, chyron), fonts
  match the app. Regenerate rather than hand-edit.
- Google Fonts + hector.golf images are runtime-cached by the service worker.

## Strokes received on a hole

One glyph, learnt once: a small ball with the number in it, placed right after the
player's name — violet for one or more strokes, grey for none, rose for a stroke given
(plus handicap). In the course view every name in a row carries its own ball while the
hole is unplayed, so a pair's two balls are never mistaken for one another; the HOLE
column waits with a dash. The entry sheet uses the same ball on its name line. The
scorecard, where space is tight, keeps its violet dots above the digits.
