#!/bin/sh
# Run a command with the Stripe TEST secrets the local backend runs with, so a
# spec can drive real Stripe test payments and deliver the real events to the
# running backend (utils/stripeTestMode.ts). The secrets stay in this process
# tree: nothing is echoed or written to disk, and the rest of Infisical's
# variables are NOT passed on (they would override the suite's own env).
#
#   BACKEND_DIR=/path/to/restaunax-backend \
#     scripts/with-stripe-test-env.sh npx playwright test tests/pos/22-...
#
# Refuses anything but a test key. See RUNNING_TESTS.md.
set -eu
: "${BACKEND_DIR:?BACKEND_DIR must point at restaunax-backend (it holds .infisical.json)}"
AUTOMATION_DIR="$(pwd)"
export AUTOMATION_DIR
cd "$BACKEND_DIR"
exec infisical run --silent -- sh -c '
  case "${STRIPE_SECRET_KEY:-}" in
    sk_test_*|rk_test_*) ;;
    *) echo "Refusing to run: STRIPE_SECRET_KEY is not a TEST key." >&2; exit 2 ;;
  esac
  cd "$AUTOMATION_DIR"
  E2E_STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  E2E_STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
    exec env -u STRIPE_SECRET_KEY -u STRIPE_WEBHOOK_SECRET -u DATABASE_URL \
      -u BACKEND_URL -u FRONTEND_URL -u NODE_ENV \
      "$@"
' sh "$@"
