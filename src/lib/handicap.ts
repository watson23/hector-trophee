/**
 * Re-export shim: the implementation lives in api/_lib so the serverless functions can
 * share the one engine (Vercel's function runtime only compiles modules inside api/).
 * Everything in the app keeps importing from here.
 */
export * from "../../api/_lib/handicap";
