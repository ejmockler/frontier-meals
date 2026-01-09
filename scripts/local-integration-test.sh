#!/bin/bash
#
# Local Integration Testing Setup
#
# This script sets up your local environment to run full integration tests
# against real Stripe webhooks and Telegram bot interactions.
#
# Prerequisites:
#   - Stripe CLI: brew install stripe/stripe-cli/stripe
#   - pnpm installed
#   - .env file configured with staging credentials
#
# Usage:
#   ./scripts/local-integration-test.sh [command]
#
# Commands:
#   setup     - Install dependencies and configure Stripe CLI
#   start     - Start dev server + Stripe webhook forwarding
#   stripe    - Start Stripe webhook forwarding only
#   telegram  - Run Telegram bot test suite
#   test      - Run integration tests against local server
#   cleanup   - Clean up test data from staging database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

WEBHOOK_PORT=${WEBHOOK_PORT:-5173}
STRIPE_WEBHOOK_PATH="/api/stripe/webhook"
TELEGRAM_WEBHOOK_PATH="/api/telegram/webhook"

# Stripe CLI path (check common locations)
STRIPE_CLI="${STRIPE_CLI:-$(command -v stripe || echo "$HOME/bin/stripe")}"

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

check_prerequisites() {
    print_header "Checking Prerequisites"

    local missing=()

    if ! command -v pnpm &> /dev/null; then
        missing+=("pnpm")
    fi

    if ! command -v stripe &> /dev/null; then
        missing+=("stripe CLI (brew install stripe/stripe-cli/stripe)")
    fi

    if [ ! -f .env ]; then
        missing+=(".env file")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}Missing prerequisites:${NC}"
        for item in "${missing[@]}"; do
            echo -e "  ${RED}✗${NC} $item"
        done
        echo ""
        echo "Please install missing dependencies and try again."
        exit 1
    fi

    echo -e "${GREEN}✓${NC} pnpm installed"
    echo -e "${GREEN}✓${NC} stripe CLI installed"
    echo -e "${GREEN}✓${NC} .env file exists"

    # Check Stripe CLI login status
    if ! $STRIPE_CLI config --list &> /dev/null; then
        echo -e "\n${YELLOW}⚠ Stripe CLI not logged in. Running 'stripe login'...${NC}"
        $STRIPE_CLI login
    else
        echo -e "${GREEN}✓${NC} stripe CLI authenticated"
    fi
}

setup_command() {
    print_header "Setting Up Local Integration Testing"

    check_prerequisites

    echo -e "\n${GREEN}Installing dependencies...${NC}"
    pnpm install

    echo -e "\n${GREEN}Verifying Stripe webhook secret...${NC}"
    if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
        echo -e "${YELLOW}⚠ STRIPE_WEBHOOK_SECRET not set in .env${NC}"
        echo "The Stripe CLI will provide a webhook signing secret when you run '$STRIPE_CLI listen'"
        echo "Add it to your .env file as STRIPE_WEBHOOK_SECRET_LOCAL for local testing"
    fi

    echo -e "\n${GREEN}Setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./scripts/local-integration-test.sh start"
    echo "  2. In another terminal, trigger test webhooks"
    echo ""
}

start_stripe_forwarding() {
    print_header "Starting Stripe Webhook Forwarding"

    local webhook_url="http://localhost:${WEBHOOK_PORT}${STRIPE_WEBHOOK_PATH}"

    echo "Forwarding Stripe webhooks to: ${webhook_url}"
    echo ""
    echo -e "${YELLOW}Copy the webhook signing secret shown below to your .env as:${NC}"
    echo -e "${YELLOW}STRIPE_WEBHOOK_SECRET=whsec_...${NC}"
    echo ""

    $STRIPE_CLI listen --forward-to "${webhook_url}" \
        --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed
}

start_dev_with_stripe() {
    print_header "Starting Local Development Environment"

    check_prerequisites

    echo "Starting dev server and Stripe webhook forwarding..."
    echo ""

    # Create a temporary script to run both processes
    local webhook_url="http://localhost:${WEBHOOK_PORT}${STRIPE_WEBHOOK_PATH}"

    # Use trap to clean up child processes
    trap 'kill $(jobs -p) 2>/dev/null' EXIT

    # Start dev server in background
    echo -e "${GREEN}Starting dev server on port ${WEBHOOK_PORT}...${NC}"
    pnpm dev &
    DEV_PID=$!

    # Wait for dev server to be ready
    echo "Waiting for dev server to start..."
    sleep 3

    # Check if dev server is running
    if ! curl -s "http://localhost:${WEBHOOK_PORT}" > /dev/null 2>&1; then
        echo -e "${YELLOW}Waiting for dev server...${NC}"
        sleep 5
    fi

    echo -e "\n${GREEN}Starting Stripe webhook forwarding...${NC}"
    echo -e "${YELLOW}Copy the webhook signing secret to .env as STRIPE_WEBHOOK_SECRET${NC}\n"

    $STRIPE_CLI listen --forward-to "${webhook_url}" \
        --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed &
    STRIPE_PID=$!

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Local Integration Environment Ready${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Dev Server:     http://localhost:${WEBHOOK_PORT}"
    echo "  Stripe Webhook: ${webhook_url}"
    echo ""
    echo "  Test endpoints:"
    echo "    • Checkout:  POST http://localhost:${WEBHOOK_PORT}/api/stripe/create-checkout"
    echo "    • Telegram:  POST http://localhost:${WEBHOOK_PORT}/api/telegram/webhook"
    echo ""
    echo "  Trigger test events:"
    echo "    $STRIPE_CLI trigger checkout.session.completed"
    echo "    $STRIPE_CLI trigger invoice.paid"
    echo "    $STRIPE_CLI trigger invoice.payment_failed"
    echo ""
    echo "  Press Ctrl+C to stop all services"
    echo ""

    # Wait for any process to exit
    wait
}

run_telegram_tests() {
    print_header "Running Telegram Bot Tests"

    local webhook_url="${1:-http://localhost:${WEBHOOK_PORT}${TELEGRAM_WEBHOOK_PATH}}"

    echo "Testing against: ${webhook_url}"
    echo ""

    WEBHOOK_URL="${webhook_url}" pnpm run test:telegram
}

run_integration_tests() {
    print_header "Running Integration Tests"

    echo "Running all integration tests against staging database..."
    echo ""

    pnpm exec vitest run --reporter=verbose
}

cleanup_test_data() {
    print_header "Cleaning Up Test Data"

    echo "Removing test data from staging database..."
    echo ""

    node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
    // Find test customers by email patterns
    const { data: customers } = await supabase
        .from('customers')
        .select('id, email')
        .or('email.like.%test_%@example.com,email.like.%_test_%,stripe_customer_id.like.cus_test_%');

    if (!customers || customers.length === 0) {
        console.log('No test data found');
        return;
    }

    console.log('Found', customers.length, 'test customers to clean up');

    for (const customer of customers) {
        console.log('  Cleaning:', customer.email);
        await supabase.from('qr_tokens').delete().eq('customer_id', customer.id);
        await supabase.from('entitlements').delete().eq('customer_id', customer.id);
        await supabase.from('skips').delete().eq('customer_id', customer.id);
        await supabase.from('skip_sessions').delete().eq('customer_id', customer.id);
        await supabase.from('telegram_link_status').delete().eq('customer_id', customer.id);
        await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', customer.id);
        await supabase.from('subscriptions').delete().eq('customer_id', customer.id);
        await supabase.from('customers').delete().eq('id', customer.id);
    }

    // Clean up processed webhooks older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
        .from('processed_webhooks')
        .delete()
        .lt('processed_at', oneHourAgo);

    console.log('Cleanup complete!');
}

cleanup().catch(console.error);
"
}

trigger_stripe_events() {
    print_header "Triggering Stripe Test Events"

    echo "Available test events:"
    echo "  1. checkout.session.completed"
    echo "  2. invoice.paid"
    echo "  3. invoice.payment_failed"
    echo "  4. customer.subscription.deleted"
    echo ""

    read -p "Enter event number (1-4) or 'all': " choice

    case $choice in
        1)
            $STRIPE_CLI trigger checkout.session.completed
            ;;
        2)
            $STRIPE_CLI trigger invoice.paid
            ;;
        3)
            $STRIPE_CLI trigger invoice.payment_failed
            ;;
        4)
            $STRIPE_CLI trigger customer.subscription.deleted
            ;;
        all)
            $STRIPE_CLI trigger checkout.session.completed
            sleep 2
            $STRIPE_CLI trigger invoice.paid
            sleep 2
            $STRIPE_CLI trigger invoice.payment_failed
            sleep 2
            $STRIPE_CLI trigger customer.subscription.deleted
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

show_help() {
    echo "Local Integration Testing Script"
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup      Install dependencies and configure environment"
    echo "  start      Start dev server + Stripe webhook forwarding"
    echo "  stripe     Start Stripe webhook forwarding only"
    echo "  telegram   Run Telegram bot test suite"
    echo "  test       Run all integration tests"
    echo "  trigger    Trigger Stripe test events"
    echo "  cleanup    Clean up test data from database"
    echo "  help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 setup              # First-time setup"
    echo "  $0 start              # Start local env for testing"
    echo "  $0 telegram           # Test Telegram bot locally"
    echo "  $0 trigger            # Send test Stripe events"
    echo ""
}

# Main command handler
case "${1:-help}" in
    setup)
        setup_command
        ;;
    start)
        start_dev_with_stripe
        ;;
    stripe)
        start_stripe_forwarding
        ;;
    telegram)
        run_telegram_tests "$2"
        ;;
    test)
        run_integration_tests
        ;;
    trigger)
        trigger_stripe_events
        ;;
    cleanup)
        cleanup_test_data
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
