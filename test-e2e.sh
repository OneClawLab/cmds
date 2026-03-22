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

source "$(dirname "$0")/scripts/e2e-lib.sh"

CMDS="cmds"

setup_e2e

# ── Pre-flight ────────────────────────────────────────────────
section "Pre-flight"

require_bin $CMDS "run npm run build"

INDEX="$HOME/.config/cmds/index.json"
if [[ -f "$INDEX" ]]; then
  pass "Runtime index exists: $INDEX"
else
  fail "Runtime index missing — run: cmds scan"; exit 1
fi

# ══════════════════════════════════════════════════════════════
# 1. find — basic search
# ══════════════════════════════════════════════════════════════
section "1. find — basic search"
run_cmd $CMDS find "list files"
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 2. find --json
# ══════════════════════════════════════════════════════════════
section "2. find --json"
run_cmd $CMDS find "compress files" --json
assert_exit0
assert_json_array

# ══════════════════════════════════════════════════════════════
# 3. find --limit
# ══════════════════════════════════════════════════════════════
section "3. find --limit"
run_cmd $CMDS find "network" --limit 2 --json
assert_exit0
assert_json_array_length_lte "$OUT" 2

# ══════════════════════════════════════════════════════════════
# 4. info — known command
# ══════════════════════════════════════════════════════════════
section "4. info — known command"
run_cmd $CMDS info ls
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 5. info --json
# ══════════════════════════════════════════════════════════════
section "5. info --json"
run_cmd $CMDS info ls --json
assert_exit0
assert_json_field "$OUT" "name"

# ══════════════════════════════════════════════════════════════
# 6. info — nonexistent command exits 1
# ══════════════════════════════════════════════════════════════
section "6. info — nonexistent command"
run_cmd $CMDS info __nonexistent_cmd_xyz__
assert_exit 1

# ══════════════════════════════════════════════════════════════
# 7. list
# ══════════════════════════════════════════════════════════════
section "7. list"
run_cmd $CMDS list
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 8. list --category
# ══════════════════════════════════════════════════════════════
section "8. list --category"
run_cmd $CMDS list --category filesystem
assert_exit0
assert_nonempty

# ══════════════════════════════════════════════════════════════
# 9. list --category --json
# ══════════════════════════════════════════════════════════════
section "9. list --category --json"
run_cmd $CMDS list --category network --json
assert_exit0
assert_json_array

# ══════════════════════════════════════════════════════════════
# 10. list — invalid category exits 1
# ══════════════════════════════════════════════════════════════
section "10. list — invalid category"
run_cmd $CMDS list --category __no_such_category__
assert_exit 1

summary_and_exit
