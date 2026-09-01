/** @type {import('tailwindcss').Config} */
export default {
  // api/_lib holds shared modules (courses.ts defines the tee-dot classes),
  // so it must be scanned too or those classes are purged from the build.
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./api/_lib/**/*.ts"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
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
        slate: {
          50: "#f7f7fa",
          100: "#efeef3",
          200: "#dfdde4",
          300: "#c2c0c9",
          400: "#9b99a4",
          500: "#65636d",
          600: "#47464f",
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
