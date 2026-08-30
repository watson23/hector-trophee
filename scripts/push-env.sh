#!/usr/bin/env bash
# Push every VITE_* value from .env.local into Vercel, for all three environments.
# Usage:  npx vercel login && bash scripts/push-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "no .env.local here"; exit 1; }

while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue;; esac
  [ -n "${value:-}" ] || continue
  for env in production preview development; do
    printf '%s' "$value" | npx vercel env add "$key" "$env" --force >/dev/null 2>&1 \
      && echo "  set $key ($env)" \
      || echo "  FAILED $key ($env)"
  done
done < .env.local

echo
echo "Redeploying so the new values are baked into the bundle…"
npx vercel --prod
