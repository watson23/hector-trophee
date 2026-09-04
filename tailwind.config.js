/** @type {import('tailwindcss').Config} */
export default {
  future: {
    // hover: variants only on devices that actually hover — on touch, hover
    // styles stick to the last-tapped element (the un-tapped score button kept
    // its hover grey until the next touch).
    hoverOnlyWhenSupported: true,
  },
  // api/_lib holds shared modules (courses.ts defines the tee-dot classes),
  // so it must be scanned too or those classes are purged from the build.
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./api/_lib/**/*.ts"],
  theme: {
    extend: {
      /* One legibility step up (3.9.2026, tester feedback + on-the-go use):
         xs is 13px here, and the arbitrary 10/11px literals in components were
         raised a step in the same pass. Whitespace pays for it, gladly. */
      fontSize: {
        xs: ["13px", { lineHeight: "1.4" }],
      },
      fontFamily: {
        // Geist, not Inter: the body face the user chose for notebob — his apps
        // share a personal type identity (Geist body + Fraunces serif).
        sans: ["Geist", "system-ui", "sans-serif"],
        mono: ["Inconsolata", "ui-monospace", "monospace"],
        // The scoreboard face — scores are the app's content, so they get a face
        // with intent instead of the coding font.
        display: ["Barlow Semi Condensed", "Inter", "system-ui", "sans-serif"],
        // Ceremony only: champions, draft night, the wrap.
        serif: ["Fraunces", "Georgia", "serif"],
      },
      colors: {
        /*
         * "Broadcast" ground: the entire slate scale re-mapped to a true neutral with
         * a hair of violet in it, so every existing slate-* class in the app lands on
         * the new world without touching a component. Tailwind's slate is blue-cast —
         * the single most recognizable template tell — and this replaces it wholesale.
         */
        /*
         * The accent: Hector purple, deep royal. hector.golf's wordmark is stock
         * violet; this ramp sits a clear step darker and bluer than that (600 =
         * #5340ad) so it reads as the brand's colour without the template look.
         * Chosen in Sep 2026 over Augusta green (which lived here 1.9–4.9) after
         * side-by-side shots of Play, Scorecard, Round and Trophée — see DESIGN.md.
         */
        violet: {
          200: "#cfc6f0",
          300: "#ada0e6",
          400: "#8b79d8",
          500: "#6d58c6",
          600: "#5340ad",
          700: "#41328a",
          800: "#322769",
          900: "#241c4b",
          950: "#15102e",
        },
        slate: {
          50: "#f7f7fa",
          100: "#efeef3",
          200: "#dfdde4",
          300: "#c2c0c9",
          400: "#9b99a4",
          /* 500/600 lifted 2.9.2026 after tester feedback ("tumman harmaa mustalla
             tekee tiukkaa"): the old values measured 3.2:1 and 2.0:1 on the card
             ground — failing AA — and outdoor glare eats faint grey first.
             500 now ≈5.0:1 (secondary text), 600 ≈3.2:1 (deliberate de-emphasis). */
          500: "#858391",
          600: "#666471",
          700: "#2c2b31",
          800: "#1d1c20",
          900: "#131215",
          950: "#0a0a0c",
        },
        // Broadcast gold: the leader's colour, and later the trophies'.
        gold: {
          DEFAULT: "#e3b341",
          300: "#efcf7f",
          400: "#e3b341",
          500: "#c9992f",
          950: "#2a2008",
        },
      },
    },
  },
  plugins: [],
}
