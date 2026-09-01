# Hector Trophée — design system

The app is a **broadcast graphics package**, not a dashboard: think the on-screen
world of a golf telecast — chyrons, lower-thirds, a scoreboard face — rendered as
a phone app. Every visual decision below was made against that concept. Change
them deliberately, in tokens, never ad hoc per screen.

## Ground

- The entire `slate` scale is **remapped** in `tailwind.config.js` to a true
  neutral with a hair of violet (950 = `#0a0a0c`). Never reintroduce Tailwind's
  default blue-cast slate/gray — it is the single most recognizable template tell.
- Dark only, by choice: the app lives on phones outdoors and on TVs at night.
  There is no light theme and none is planned.

## Color roles (each color has ONE job)

| Color | Job | Never |
|---|---|---|
| `gold` (custom scale, 400 = `#e3b341`) | Leaders, trophies, ceremony | Interactive accents, decoration |
| `violet` scale — **remapped to Augusta green** (600 = `#1c6242`) | Interactive accent: active states, selection, "you", CTAs | Score semantics. The class names still say violet; the scale in `tailwind.config.js` is the single source of truth |
| `emerald` | Live/now (the breathing dot), positive deltas, free slots | Backgrounds at full saturation |
| `rose` | **Under par** (golf convention: red = under) | Errors as a habit — errors are amber |
| `sky` | **Over par** (golf convention: blue = over) | Links |
| `amber` | Warnings (suspect tee, provisional), the yellow tee dot | — |

Score tinting follows golf-TV convention, not web convention: red is *good*
(under par), blue is *mild bad* (over). Do not "fix" this.

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
  score. Violet bar = spectator's followed player. These bars carry meaning —
  never add colored left borders as decoration.
- Display = **how the score is spoken**: stroke formats lead with to-par
  ("−12 (60)"); Stableford leads with points ("40 (−4)").
- Weight labels are percentages ("H 50%"), never fraction glyphs.
- Score marks: shape encodes result (ring = birdie, square = bogey, doubled =
  eagle/double), numeral stays bright. Legend lives on the scorecard.

## Motion

- Row re-ranking glides via FLIP, **gated to actual order changes** (WebKit
  renders animated `tr` transforms poorly; never animate on data-only updates).
- Changed scores pulse accent-green once; the live dot breathes with `currentColor`.
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
