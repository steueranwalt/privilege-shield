#!/usr/bin/env bash
# Local Privilege Shield batch → redacted/ only. Key never leaves secrets/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$ROOT/cli"
INBOX="${INBOX:-$ROOT/inbox}"
OUT="${OUT:-$ROOT/redacted}"
KEY="${KEY:-$ROOT/secrets/ps-key.json}"

mkdir -p "$INBOX" "$OUT" "$(dirname "$KEY")"
cd "$CLI"
if [[ ! -d node_modules/jszip ]]; then npm install; fi

EXTRA=()
if [[ "${PLACEHOLDERS:-}" == "1" ]]; then EXTRA+=(--placeholders); fi
if [[ "${AUTO:-1}" == "1" ]]; then EXTRA+=(--auto); fi
if [[ -n "${MAP_FILE:-}" ]]; then EXTRA+=(--map-file "$MAP_FILE"); fi

echo "→ anonymize $INBOX → $OUT  (key: $KEY)"
node bin/privilege-shield.js anonymize "$INBOX" --out "$OUT" --key "$KEY" "${EXTRA[@]}"
echo "Done. Commit/sync only $OUT. Keep $KEY offline."
