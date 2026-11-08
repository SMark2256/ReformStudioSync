#!/usr/bin/env bash
# ReformStudioSync quality gate. Az első hibánál megáll.
# Használat: bash .claude/skills/reform-ticket/scripts/gate.sh   (a repó gyökeréből)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ ! -d node_modules ]; then
  echo "▶ npm ci (nincs node_modules)"
  npm ci --no-audit --no-fund
fi

# A CI is ezt a scriptet futtatja (.github/workflows/ci.yml). GitHub Actionsben a
# lépések összecsukható log-csoportok, a hibás lépés neve pedig annotációként jelenik meg.
step() {
  local name="$1"; shift
  echo
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::group::$name"; else echo "▶ $name"; fi
  local rc=0
  "$@" || rc=$?
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::endgroup::"
    if [ "$rc" -ne 0 ]; then echo "::error title=Gate hiba::$name"; fi
  fi
  if [ "$rc" -ne 0 ]; then
    echo
    echo "✘ GATE HIBA: $name"
    exit 1
  fi
  echo "✔ $name"
}

step "shared build"          npm run build:shared
step "prisma generate"       npm run db:generate
step "typecheck (api)"       npm --workspace=@reform/api run typecheck
step "typecheck (web)"       npm --workspace=@reform/web run typecheck
if [ -f e2e/tsconfig.json ]; then
  step "typecheck (e2e)"     npx tsc -p e2e
fi
step "api tesztek (vitest)"  npm --workspace=@reform/api run test
step "ESLint"                npm run lint
step "FSD lint (Steiger)"    npm run lint:fsd
step "web build"             npm --workspace=@reform/web run build

# A web build tsc -b-je frissíti ezt a követett fájlt; ne kerüljön a commitba.
git checkout -- apps/web/tsconfig.tsbuildinfo 2>/dev/null || true

echo
echo "✔ GATE ZÖLD"
