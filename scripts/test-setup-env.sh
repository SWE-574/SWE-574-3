#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Tests for scripts/setup-env.sh overwrite guard
#
# Usage: bash scripts/test-setup-env.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SETUP_SCRIPT="$SCRIPT_DIR/setup-env.sh"
TMPDIR_TEST="$(mktemp -d)"
ORIG_DIR="$PWD"

passed=0
failed=0

pass() { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; passed=$((passed + 1)); }
fail() { printf '\033[1;31m  ✗ %s\033[0m\n' "$1"; failed=$((failed + 1)); }

cleanup() { rm -rf "$TMPDIR_TEST"; cd "$ORIG_DIR"; }
trap cleanup EXIT

# ── Test 1: Creates .env when none exists ─────────────────────────────────────
cd "$TMPDIR_TEST"
rm -f .env
# Feed infinite blank lines for every prompt (no .env exists, so no overwrite prompt)
yes '' 2>/dev/null | bash "$SETUP_SCRIPT" >/dev/null 2>&1 || true
if [[ -f .env ]]; then
  pass "Creates .env when none exists"
else
  fail "Creates .env when none exists"
fi

# ── Test 2: Prompts when .env already exists, declining preserves file ────────
cd "$TMPDIR_TEST"
echo "EXISTING=true" > .env
# First prompt is the overwrite guard — send "N", then the script exits
echo "N" | bash "$SETUP_SCRIPT" >/dev/null 2>&1 || true
if grep -q "EXISTING=true" .env; then
  pass "Declining overwrite preserves existing .env"
else
  fail "Declining overwrite preserves existing .env"
fi

# ── Test 3: Declining exits with code 0 (not error) ──────────────────────────
cd "$TMPDIR_TEST"
echo "EXISTING=true" > .env
echo "N" | bash "$SETUP_SCRIPT" >/dev/null 2>&1
exit_code=$?
if [[ $exit_code -eq 0 ]]; then
  pass "Declining overwrite exits with code 0"
else
  fail "Declining overwrite exits with code $exit_code (expected 0)"
fi

# ── Test 4: Accepting overwrite replaces file ─────────────────────────────────
cd "$TMPDIR_TEST"
echo "OLD_VALUE=delete_me" > .env
# Send "y" for overwrite, then infinite blank lines for all other prompts
(echo "y"; yes '' 2>/dev/null) | bash "$SETUP_SCRIPT" >/dev/null 2>&1 || true
if [[ -f .env ]] && ! grep -q "OLD_VALUE=delete_me" .env; then
  pass "Accepting overwrite replaces .env content"
else
  fail "Accepting overwrite replaces .env content"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
printf '\033[1m  %d passed, %d failed\033[0m\n' "$passed" "$failed"
[[ $failed -eq 0 ]] && exit 0 || exit 1
