#!/usr/bin/env bash
#
# cmds CLI End-to-End Test Script — core functionality
#
# Prerequisites:
#   - cmds installed: npm run build && npm link
#   - Runtime index exists: cmds scan (run at least once)
#
# Usage: bash test-e2e.sh
#
set -uo pipefail

CMDS="cmds"
TD=$(mktemp -d)
PASS=0; FAIL=0

cleanup() { rm -rf "$TD"; }
trap cleanup EXIT

G() { printf "\033[32m  ✓ %s\033[0m\n" "$*"; PASS=$((PASS+1)); }
R() { printf "\033[31m  ✗ %s\033[0m\n" "$*"; FAIL=$((FAIL+1)); }
S() { echo ""; printf "\033[33m━━ %s ━━\033[0m\n" "$*"; }

# Convert a bash path to a form node.js can read (handles Windows/MSYS2)
np() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

# ── Pre-flight ────────────────────────────────────────────────
S "Pre-flight"
if $CMDS --version >/dev/null 2>&1; then G "cmds binary OK"; else R "cmds broken — run npm run build"; exit 1; fi

INDEX="$HOME/.config/cmds/index.json"
if [[ -f "$INDEX" ]]; then
  G "Runtime index exists: $INDEX"
else
  R "Runtime index missing — run: cmds scan"
  exit 1
fi

# ══════════════════════════════════════════════════════════════
# 1. cmds find — basic search
# ══════════════════════════════════════════════════════════════
S "1. find — basic search"
OUT="$TD/1.txt"
$CMDS find "list files" >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC (expected 0)"
[[ -s "$OUT" ]] && G "stdout non-empty" || R "stdout empty"

# ══════════════════════════════════════════════════════════════
# 2. cmds find --json
# ══════════════════════════════════════════════════════════════
S "2. find --json"
OUT="$TD/2.txt"
$CMDS find "compress files" --json >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
if node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!Array.isArray(d)) throw 0" "$(np "$OUT")" 2>/dev/null; then
  G "valid JSON array"
else
  R "invalid JSON or not array"
fi

# ══════════════════════════════════════════════════════════════
# 3. cmds find --limit
# ══════════════════════════════════════════════════════════════
S "3. find --limit"
OUT="$TD/3.txt"
$CMDS find "network" --limit 2 --json >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
COUNT=$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).length))" "$(np "$OUT")" 2>/dev/null)
[[ "$COUNT" -le 2 ]] && G "respects --limit 2 (got $COUNT)" || R "--limit not respected (got $COUNT)"

# ══════════════════════════════════════════════════════════════
# 4. cmds info — known command
# ══════════════════════════════════════════════════════════════
S "4. info — known command"
OUT="$TD/4.txt"
$CMDS info ls >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
[[ -s "$OUT" ]] && G "stdout non-empty" || R "stdout empty"

# ══════════════════════════════════════════════════════════════
# 5. cmds info --json
# ══════════════════════════════════════════════════════════════
S "5. info --json"
OUT="$TD/5.txt"
$CMDS info ls --json >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
if node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!d.name) throw 0" "$(np "$OUT")" 2>/dev/null; then
  G "valid JSON with name field"
else
  R "invalid JSON or missing name"
fi

# ══════════════════════════════════════════════════════════════
# 6. cmds info — nonexistent command exits 1
# ══════════════════════════════════════════════════════════════
S "6. info — nonexistent command"
$CMDS info __nonexistent_cmd_xyz__ >/dev/null 2>&1
EC=$?
[[ $EC -eq 1 ]] && G "exit=1 for unknown command" || R "exit=$EC (expected 1)"

# ══════════════════════════════════════════════════════════════
# 7. cmds list
# ══════════════════════════════════════════════════════════════
S "7. list"
OUT="$TD/7.txt"
$CMDS list >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
[[ -s "$OUT" ]] && G "stdout non-empty" || R "stdout empty"

# ══════════════════════════════════════════════════════════════
# 8. cmds list --category
# ══════════════════════════════════════════════════════════════
S "8. list --category"
OUT="$TD/8.txt"
$CMDS list --category filesystem >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
[[ -s "$OUT" ]] && G "stdout non-empty" || R "stdout empty"

# ══════════════════════════════════════════════════════════════
# 9. cmds list --category --json
# ══════════════════════════════════════════════════════════════
S "9. list --category --json"
OUT="$TD/9.txt"
$CMDS list --category network --json >"$OUT" 2>/dev/null
EC=$?
[[ $EC -eq 0 ]] && G "exit=0" || R "exit=$EC"
if node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(!Array.isArray(d)) throw 0" "$(np "$OUT")" 2>/dev/null; then
  G "valid JSON array"
else
  R "invalid JSON or not array"
fi

# ══════════════════════════════════════════════════════════════
# 10. cmds list — invalid category exits 1
# ══════════════════════════════════════════════════════════════
S "10. list — invalid category"
$CMDS list --category __no_such_category__ >/dev/null 2>&1
EC=$?
[[ $EC -eq 1 ]] && G "exit=1 for invalid category" || R "exit=$EC (expected 1)"

# ══════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════
S "Results"
echo ""
TOTAL=$((PASS + FAIL))
printf "  Passed: \033[32m%d\033[0m\n" "$PASS"
printf "  Failed: %s\n" "$( [[ $FAIL -gt 0 ]] && printf "\033[31m%d\033[0m" "$FAIL" || echo 0 )"
echo "  Total:  $TOTAL"
echo ""
[[ $FAIL -eq 0 ]] && printf "\033[32mAll tests passed!\033[0m\n" && exit 0
printf "\033[31mSome tests failed.\033[0m\n" && exit 1
