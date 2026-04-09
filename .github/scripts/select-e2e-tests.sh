#!/usr/bin/env bash
# select-e2e-tests.sh — Determine which E2E test directories to run based on
# changed files in a PR.  On push events (merge to dev) or manual dispatch,
# always outputs the full test directory so every test runs.
#
# Outputs (via $GITHUB_OUTPUT):
#   smoke_tests  — space-separated list of smoke test paths (always set)
#   feature_tests — space-separated list of feature test paths (may be empty)
#   run_all       — "true" when the full suite should run
#
# Usage in a workflow step:
#   - name: Select E2E tests
#     id: select
#     env:
#       EVENT_NAME: ${{ github.event_name }}
#       BASE_REF:   ${{ github.event.pull_request.base.sha }}
#       HEAD_REF:   ${{ github.event.pull_request.head.sha }}
#       RUN_ALL_INPUT: ${{ github.event.inputs.run_all }}
#     run: bash .github/scripts/select-e2e-tests.sh

set -euo pipefail

TEST_DIR="tests/e2e"

# ── Smoke tests (always run) ────────────────────────────────────────────────
SMOKE_TESTS=(
  "${TEST_DIR}/auth.spec.ts"
  "${TEST_DIR}/dashboard.spec.ts"
  "${TEST_DIR}/service-detail.spec.ts"
  "${TEST_DIR}/feature-1/01-fr-01a.spec.ts"
  "${TEST_DIR}/feature-1/02-fr-01b.spec.ts"
  "${TEST_DIR}/feature-1/03-fr-01c.spec.ts"
  "${TEST_DIR}/feature-1/04-fr-01d.spec.ts"
  "${TEST_DIR}/feature-5/01-fr-05a.spec.ts"
)

# ── Shared paths — if ANY of these change, run the full suite ────────────────
SHARED_PATTERNS=(
  "frontend/src/App.tsx"
  "frontend/src/services/api.ts"
  "frontend/src/store/"
  "frontend/src/components/Navbar"
  "frontend/src/components/ProtectedRoute"
  "frontend/src/types/"
  "frontend/tests/e2e/helpers/"
  "frontend/playwright.config.ts"
  "frontend/package.json"
  "frontend/package-lock.json"
  "backend/api/models.py"
  "backend/api/serializers.py"
  "backend/api/middleware.py"
  "backend/api/urls.py"
  "backend/setup_demo.py"
  "backend/hive_project/settings.py"
  "backend/hive_project/asgi.py"
  "docker-compose.yml"
  "nginx/"
  ".env.example"
)

# ── Feature path → test directory mapping ────────────────────────────────────
# Each entry: "source_pattern|test_path test_path ..."
MAPPINGS=(
  "frontend/src/pages/LoginPage|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/pages/RegistrationPage|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/pages/ForgotPasswordPage|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/pages/ResetPasswordPage|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/pages/VerifyEmail|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/services/authAPI|${TEST_DIR}/feature-1/ ${TEST_DIR}/auth.spec.ts"
  "frontend/src/pages/OnboardingPage|${TEST_DIR}/feature-1/"

  "frontend/src/pages/UserProfile|${TEST_DIR}/feature-2/ ${TEST_DIR}/follow-system/"
  "frontend/src/pages/PublicProfile|${TEST_DIR}/feature-2/ ${TEST_DIR}/follow-system/"
  "frontend/src/services/userAPI|${TEST_DIR}/feature-2/ ${TEST_DIR}/follow-system/"

  "frontend/src/pages/DashboardPage|${TEST_DIR}/feature-3/ ${TEST_DIR}/dashboard.spec.ts"
  "backend/api/search_filters|${TEST_DIR}/feature-3/ ${TEST_DIR}/dashboard.spec.ts"
  "backend/api/ranking|${TEST_DIR}/feature-3/ ${TEST_DIR}/dashboard.spec.ts"

  "frontend/src/pages/PostOfferForm|${TEST_DIR}/feature-4/ ${TEST_DIR}/feature-5/"
  "frontend/src/pages/PostNeedForm|${TEST_DIR}/feature-4/ ${TEST_DIR}/feature-6/"
  "frontend/src/pages/PostEventForm|${TEST_DIR}/feature-4/ ${TEST_DIR}/feature-7/"
  "frontend/src/pages/EditServiceForm|${TEST_DIR}/feature-4/ ${TEST_DIR}/feature-5/ ${TEST_DIR}/feature-6/ ${TEST_DIR}/feature-7/"

  "frontend/src/services/serviceAPI|${TEST_DIR}/feature-5/ ${TEST_DIR}/feature-6/ ${TEST_DIR}/feature-7/ ${TEST_DIR}/feature-13/ ${TEST_DIR}/service-detail.spec.ts"

  "frontend/src/services/handshakeAPI|${TEST_DIR}/feature-8/ ${TEST_DIR}/feature-9/ ${TEST_DIR}/feature-10/ ${TEST_DIR}/handshake.spec.ts"
  "frontend/src/pages/ServiceDetailPage|${TEST_DIR}/feature-13/ ${TEST_DIR}/service-detail.spec.ts ${TEST_DIR}/feature-8/"
  "backend/api/services.py|${TEST_DIR}/feature-8/ ${TEST_DIR}/feature-9/ ${TEST_DIR}/feature-10/ ${TEST_DIR}/handshake.spec.ts"

  "frontend/src/pages/ChatPage|${TEST_DIR}/chat.spec.ts ${TEST_DIR}/group-chat.spec.ts"
  "frontend/src/services/conversationAPI|${TEST_DIR}/chat.spec.ts ${TEST_DIR}/group-chat.spec.ts"
  "backend/api/consumers|${TEST_DIR}/chat.spec.ts ${TEST_DIR}/group-chat.spec.ts"

  "frontend/src/pages/NotificationsPage|${TEST_DIR}/feature-14/"
  "frontend/src/services/notificationAPI|${TEST_DIR}/feature-14/"
  "frontend/src/hooks/useNotification|${TEST_DIR}/feature-14/"

  "frontend/src/pages/Forum|${TEST_DIR}/feature-15/"
  "frontend/src/services/forumAPI|${TEST_DIR}/feature-15/"

  "frontend/src/services/reputationAPI|${TEST_DIR}/feature-16/"
  "frontend/src/services/commentAPI|${TEST_DIR}/feature-16/"
  "backend/api/badge_utils|${TEST_DIR}/feature-16/ ${TEST_DIR}/feature-20/"

  "frontend/src/pages/AdminDashboard|${TEST_DIR}/feature-20/"
  "frontend/src/pages/AdminUserDetailPage|${TEST_DIR}/feature-20/"
  "frontend/src/services/adminAPI|${TEST_DIR}/feature-20/"

  "frontend/src/pages/TransactionHistoryPage|${TEST_DIR}/feature-9/ ${TEST_DIR}/feature-10/"

  "frontend/src/pages/AchievementView|${TEST_DIR}/feature-16/"

  "frontend/src/pages/ReportDetail|${TEST_DIR}/feature-20/"

  # Edit locks
  "edit-locks|${TEST_DIR}/edit-locks.spec.ts"
)

# ── Helper: write outputs ────────────────────────────────────────────────────
output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "$1=$2" >> "$GITHUB_OUTPUT"
  fi
  echo "$1=$2"
}

# ── Always emit smoke tests ─────────────────────────────────────────────────
output "smoke_tests" "${SMOKE_TESTS[*]}"

# ── Full suite on push, manual dispatch, or explicit flag ────────────────────
if [ "${EVENT_NAME:-}" = "push" ] || [ "${RUN_ALL_INPUT:-}" = "true" ]; then
  output "feature_tests" "${TEST_DIR}/"
  output "run_all" "true"
  exit 0
fi

# ── Determine changed files ─────────────────────────────────────────────────
if [ -n "${BASE_REF:-}" ] && [ -n "${HEAD_REF:-}" ]; then
  CHANGED=$(git diff --name-only "${BASE_REF}...${HEAD_REF}" 2>/dev/null || git diff --name-only "${BASE_REF}" "${HEAD_REF}")
else
  # Fallback: diff against origin/dev
  CHANGED=$(git diff --name-only origin/dev...HEAD 2>/dev/null || echo "")
fi

if [ -z "$CHANGED" ]; then
  echo "No changed files detected — running full suite as safety fallback."
  output "feature_tests" "${TEST_DIR}/"
  output "run_all" "true"
  exit 0
fi

echo "Changed files:"
echo "$CHANGED"
echo "---"

# ── Check shared paths first ────────────────────────────────────────────────
for pattern in "${SHARED_PATTERNS[@]}"; do
  if echo "$CHANGED" | grep -q "$pattern"; then
    echo "Shared path matched: $pattern → running full suite"
    output "feature_tests" "${TEST_DIR}/"
    output "run_all" "true"
    exit 0
  fi
done

# ── Map changed files to feature test directories ───────────────────────────
declare -A SELECTED_TESTS=()

for mapping in "${MAPPINGS[@]}"; do
  src_pattern="${mapping%%|*}"
  test_paths="${mapping#*|}"

  if echo "$CHANGED" | grep -q "$src_pattern"; then
    echo "Matched: $src_pattern"
    for tp in $test_paths; do
      SELECTED_TESTS["$tp"]=1
    done
  fi
done

# ── Also include any directly-changed spec files ────────────────────────────
while IFS= read -r file; do
  if [[ "$file" == frontend/tests/e2e/*.spec.ts ]]; then
    # Include the specific spec file
    rel="${file#frontend/}"
    SELECTED_TESTS["$rel"]=1
  elif [[ "$file" == frontend/tests/e2e/feature-*/  ]] || [[ "$file" == frontend/tests/e2e/feature-*/* ]]; then
    # Include the whole feature directory
    feature_dir=$(echo "$file" | sed -n 's|frontend/\(tests/e2e/feature-[^/]*/\).*|\1|p')
    if [ -n "$feature_dir" ]; then
      SELECTED_TESTS["$feature_dir"]=1
    fi
  fi
done <<< "$CHANGED"

# ── Build output ────────────────────────────────────────────────────────────
if [ ${#SELECTED_TESTS[@]} -eq 0 ]; then
  echo "No feature-specific tests matched — smoke tests only."
  output "feature_tests" ""
  output "run_all" "false"
else
  FEATURE_LIST="${!SELECTED_TESTS[*]}"
  echo "Selected feature tests: $FEATURE_LIST"
  output "feature_tests" "$FEATURE_LIST"
  output "run_all" "false"
fi
