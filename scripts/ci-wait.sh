#!/usr/bin/env bash
# CI-várakozás egy PR-ra (AGENTS.md „CI” szabály). Háttérfeladatként futtasd:
#   bash scripts/ci-wait.sh [PR-szám | ág]   (alapból az aktuális ág PR-ja)
#
# A PR checkjei mellett a head commit GitHub Actions futásait is nézi: ha egy futás
# sorban áll, és még nincs jobja, a `gh pr checks` csak a külső checkeket (pl. Cloudflare)
# látja, és tévesen zöldnek tűnne.
#
# Kilépési kód és utolsó sor:
#   0  CI PASS     minden check és futás sikeres
#   1  CI FAIL     legalább egy check vagy futás elbukott (utána: gh run view <id> --log-failed)
#   2  CI TIMEOUT  CI_WAIT_TIMEOUT mp alatt nem végzett; a beragadt checkeket kiírja
#   3  CI ERROR    a gh egymás után többször hibázott, vagy nincs PR
# Környezeti változók: CI_WAIT_TIMEOUT (alap 1800), CI_WAIT_INTERVAL (alap 20),
# CI_WAIT_MAX_ERRORS (alap 5).
set -uo pipefail

TARGET="${1:-}"
TIMEOUT="${CI_WAIT_TIMEOUT:-1800}"
INTERVAL="${CI_WAIT_INTERVAL:-20}"
MAX_ERRORS="${CI_WAIT_MAX_ERRORS:-5}"

PR_JSON=$(gh pr view ${TARGET:+"$TARGET"} --json number,headRefOid,url 2>&1) || {
  echo "$PR_JSON"
  echo "CI ERROR: nem található PR (${TARGET:-aktuális ág})"
  exit 3
}
PR=$(echo "$PR_JSON" | sed -n 's/.*"number":\([0-9]*\).*/\1/p')
SHA=$(echo "$PR_JSON" | sed -n 's/.*"headRefOid":"\([0-9a-f]*\)".*/\1/p')
echo "CI várakozás: PR #$PR, commit ${SHA:0:7}, időkorlát ${TIMEOUT} mp"

START=$(date +%s)
ERRORS=0
LAST=""
while :; do
  CHECKS=$(gh pr checks "$PR" --json name,bucket,state --jq '.[] | "\(.bucket)\t\(.name)\t\(.state)"' 2>&1)
  CHECKS_RC=$?
  RUNS=$(gh run list --commit "$SHA" --json databaseId,name,status,conclusion \
    --jq '.[] | "\(.status)\t\(.conclusion)\t\(.name)\t\(.databaseId)"' 2>&1)
  RUNS_RC=$?

  # A `gh pr checks` 8-as kóddal jelzi a függő checket; ez nem hiba.
  if { [ $CHECKS_RC -ne 0 ] && [ $CHECKS_RC -ne 8 ]; } || [ $RUNS_RC -ne 0 ]; then
    ERRORS=$((ERRORS + 1))
    echo "gh hiba ($ERRORS/$MAX_ERRORS): $CHECKS $RUNS" | head -3
    if [ "$ERRORS" -ge "$MAX_ERRORS" ]; then
      echo "CI ERROR: a gh $MAX_ERRORS alkalommal egymás után hibázott"
      exit 3
    fi
  else
    ERRORS=0
    STATUS=$(printf '%s\n%s\n' "$CHECKS" "$RUNS" | sort)
    if [ "$STATUS" != "$LAST" ]; then
      echo "--- $(date +%H:%M:%S)"
      [ -n "$CHECKS" ] && echo "$CHECKS"
      [ -n "$RUNS" ] && echo "$RUNS" | sed 's/^/run\t/'
      LAST="$STATUS"
    fi

    FAILED_CHECKS=$(echo "$CHECKS" | awk -F'\t' '$1=="fail" || $1=="cancel"')
    FAILED_RUNS=$(echo "$RUNS" | awk -F'\t' '$1=="completed" && $2!="success" && $2!="skipped" && $2!="neutral"')
    if [ -n "$FAILED_CHECKS$FAILED_RUNS" ]; then
      [ -n "$FAILED_CHECKS" ] && echo "$FAILED_CHECKS"
      [ -n "$FAILED_RUNS" ] && echo "$FAILED_RUNS" | sed 's/^/run\t/'
      echo "CI FAIL: PR #$PR (részletek: gh run view <id> --log-failed)"
      exit 1
    fi

    PENDING_CHECKS=$(echo "$CHECKS" | awk -F'\t' 'NF && $1!="pass" && $1!="skipping"')
    PENDING_RUNS=$(echo "$RUNS" | awk -F'\t' 'NF && $1!="completed"')
    if [ -n "$RUNS" ] && [ -z "$PENDING_CHECKS$PENDING_RUNS" ]; then
      echo "CI PASS: PR #$PR, commit ${SHA:0:7}"
      exit 0
    fi
  fi

  if [ $(( $(date +%s) - START )) -ge "$TIMEOUT" ]; then
    echo "Beragadt:"
    [ -n "${PENDING_CHECKS:-}" ] && echo "$PENDING_CHECKS"
    [ -n "${PENDING_RUNS:-}" ] && echo "$PENDING_RUNS" | sed 's/^/run\t/'
    [ -z "${RUNS:-}" ] && echo "run\t(nincs GitHub Actions futás a commitra)"
    echo "CI TIMEOUT: PR #$PR, ${TIMEOUT} mp után sem végzett"
    exit 2
  fi
  sleep "$INTERVAL"
done
