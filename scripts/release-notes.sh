#!/usr/bin/env bash
# Egy verzió kiadási jegyzéke a CHANGELOG.md-ből (docs/WORKFLOW.md „Kiadás”, TICKET-44).
#   bash scripts/release-notes.sh <verzió> [CHANGELOG fájl]   pl. 0.3, v0.3 vagy 0.3.0
#
# A `## v<major.minor> …` szakasz törzsét írja a standard kimenetre (a címsor nélkül), a
# következő `## v` címsorig. Csak olvas: nem taggel, nem pushol, nem hoz létre release-t.
#   bash scripts/release-notes.sh 0.3 > /tmp/v0.3.md
#   gh release create v0.3.0 --title "v0.3" --notes-file /tmp/v0.3.md
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Használat: bash scripts/release-notes.sh <verzió> [CHANGELOG fájl]" >&2
  exit 2
fi

VERSION="${1#v}"
VERSION=$(echo "$VERSION" | cut -d. -f1-2)
FILE="${2:-$(dirname "$0")/../CHANGELOG.md}"

if [ ! -f "$FILE" ]; then
  echo "Nem található: $FILE" >&2
  exit 2
fi

NOTES=$(awk -v heading="## v$VERSION" '
  { sub(/\r$/, "") }
  index($0, "## v") == 1 {
    if (found) exit
    rest = substr($0, length(heading) + 1)
    if (index($0, heading) == 1 && (rest == "" || rest ~ /^[ \t]/)) { found = 1; next }
  }
  found { print }
' "$FILE")

if [ -z "${NOTES//[[:space:]]/}" ]; then
  echo "A(z) v$VERSION szakasz nem található vagy üres: $FILE" >&2
  exit 1
fi

# Az elején és a végén lévő üres sorok nélkül.
printf '%s\n' "$NOTES" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
