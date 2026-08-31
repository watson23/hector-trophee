import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Correctness only, on purpose: this gate exists to catch real bugs (stale closures,
 * missing hook deps, unused state) before the auto-updating PWA ships them to every
 * phone — not to argue about style. Formatting stays whatever the file already does.
 */
export default tseslint.config(
  { ignores: ["dist/", "dev-dist/", "node_modules/"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The codebase deliberately types Firestore payloads at the boundary with `as`.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
