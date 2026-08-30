#!/usr/bin/env bash
#
# Push every value from .env.local into Vercel, for all three environments.
#
#   npx vercel login && bash scripts/push-env.sh
#
# --no-sensitive is the important flag. Vercel's "Sensitive" variables are decryptable
# only at runtime, and a Vite build has no runtime — it inlines values at build time. A
# VITE_* variable stored as Sensitive therefore reaches the bundle as an empty string,
# silently, and the app falls back to its defaults. Everything prefixed VITE_ is public
# by definition once built, so there is nothing to protect by marking it Sensitive.
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "No .env.local in $(pwd)"; exit 1; }

failed=0
while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue;; esac
  [ -n "${value:-}" ] || { echo "  skip  $key (empty)"; continue; }

  if out=$(npx vercel env add "$key" production,preview,development \
             --value "$value" --no-sensitive --force 2>&1); then
    echo "  set   $key"
  else
    echo "  FAIL  $key"
    echo "$out" | sed 's/^/          /' | tail -5
    failed=1
  fi
done < .env.local

if [ "$failed" -ne 0 ]; then
  echo
  echo "Some variables failed. Fix those before deploying — a missing VITE_* value"
  echo "becomes an empty string in the bundle rather than an error."
  exit 1
fi

echo
echo "Deploying so the values are baked into the bundle…"
npx vercel deploy --prod
