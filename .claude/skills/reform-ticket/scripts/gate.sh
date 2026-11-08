#!/usr/bin/env bash
# ReformStudioSync quality gate. Az első hibánál megáll.
# Használat: bash .claude/skills/reform-ticket/scripts/gate.sh   (a repó gyökeréből)
# A CI (.github/workflows/ci.yml, `gate` job) ugyanezeket a lépéseket futtatja külön
# step-ekként: a kettőt együtt kell karbantartani.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ ! -d node_modules ]; then
  echo "▶ npm ci (nincs node_modules)"
  npm ci --no-audit --no-fund
fi

step() {
  local name="$1"; shift
  echo
  echo "▶ $name"
  if ! "$@"; then
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
step "api tesztek (vitest)"  npm --workspace=@reform/api run test
step "ESLint"                npm run lint
step "FSD lint (Steiger)"    npm run lint:fsd
step "web build"             npm --workspace=@reform/web run build

# A web build tsc -b-je frissíti ezt a követett fájlt; ne kerüljön a commitba.
git checkout -- apps/web/tsconfig.tsbuildinfo 2>/dev/null || true

echo
echo "✔ GATE ZÖLD"
