#!/bin/bash

# DebitNow AI System - Quick Start Testing Script
# Run this script to test all core features locally

set -e

echo "🚀 DebitNow AI System - Quick Start Testing"
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000"
API_CONSUMER="$BASE_URL/api/consumers"
API_LOGS="$BASE_URL/api/logs"
API_PENDING="$BASE_URL/api/instructions/pending"
API_OPERATORS="$BASE_URL/api/operators/register"

# Check if server is running
check_server() {
  echo -e "${BLUE}Checking if server is running on $BASE_URL...${NC}"
  if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo -e "${RED}❌ Server is not running!${NC}"
    echo "Start the server with: npm start"
    exit 1
  fi
  echo -e "${GREEN}✅ Server is running${NC}"
  echo ""
}

# Register operator
register_operator() {
  echo -e "${BLUE}Step 1: Registering Test Operator${NC}"
  
  RESPONSE=$(curl -s -X POST "$API_OPERATORS" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Operator",
      "phone_number": "27810000001"
    }')
  
  OPERATOR_ID=$(echo $RESPONSE | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  
  if [ -z "$OPERATOR_ID" ]; then
    echo -e "${RED}❌ Failed to register operator${NC}"
    echo "$RESPONSE"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Operator registered with ID: $OPERATOR_ID${NC}"
  echo ""
}

# Get all consumers
list_consumers() {
  echo -e "${BLUE}Step 2: Listing All Consumers${NC}"
  
  RESPONSE=$(curl -s "$API_CONSUMER")
  COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
  
  echo -e "${GREEN}✅ Total consumers: $COUNT${NC}"
  echo "$RESPONSE" | head -c 200
  echo "..."
  echo ""
}

# Get arrears consumers
list_arrears() {
  echo -e "${BLUE}Step 3: Checking Arrears Accounts${NC}"
  
  RESPONSE=$(curl -s "$BASE_URL/api/consumers/arrears")
  COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
  
  echo -e "${GREEN}✅ Total in arrears: $COUNT${NC}"
  
  if [ "$COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No accounts in arrears (arrears detection runs daily at 7 AM)${NC}"
  fi
  echo ""
}

# Get pending instructions
list_pending() {
  echo -e "${BLUE}Step 4: Checking Pending Instructions${NC}"
  
  RESPONSE=$(curl -s "$API_PENDING")
  COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
  
  echo -e "${GREEN}✅ Total pending instructions: $COUNT${NC}"
  echo ""
}

# Get debit logs
list_logs() {
  echo -e "${BLUE}Step 5: Checking Debit Logs${NC}"
  
  RESPONSE=$(curl -s "$API_LOGS")
  COUNT=$(echo $RESPONSE | grep -o '"id"' | wc -l)
  
  echo -e "${GREEN}✅ Total debit logs: $COUNT${NC}"
  echo ""
}

# Display dashboard info
show_dashboard() {
  echo -e "${BLUE}Step 6: Dashboard Available${NC}"
  echo -e "${GREEN}✅ Open dashboard in browser: $BASE_URL${NC}"
  echo ""
}

# Display next steps
show_next_steps() {
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}Next Steps - WhatsApp Testing${NC}"
  echo -e "${YELLOW}========================================${NC}"
  echo ""
  echo -e "To test WhatsApp commands, send messages from: ${BLUE}27810000001${NC}"
  echo ""
  echo -e "${BLUE}Command 1: Register Consumer${NC}"
  echo "  Message: ${GREEN}ONBOARD John|TestClient|1000${NC}"
  echo ""
  echo -e "${BLUE}Command 2: Create Debit Instruction${NC}"
  echo "  Message: ${GREEN}INSTRUCTION 1 500 Test payment${NC}"
  echo ""
  echo -e "${BLUE}Command 3: Execute Debit${NC}"
  echo "  Message: ${GREEN}EXECUTE 1${NC}"
  echo ""
  echo -e "${BLUE}Command 4: View Consumers${NC}"
  echo "  Message: ${GREEN}LIST${NC}"
  echo ""
  echo -e "${BLUE}Command 5: View Arrears${NC}"
  echo "  Message: ${GREEN}ARREARS${NC}"
  echo ""
  echo -e "${BLUE}Command 6: View Pending Instructions${NC}"
  echo "  Message: ${GREEN}PENDING${NC}"
  echo ""
  echo -e "${BLUE}Command 7: View Status${NC}"
  echo "  Message: ${GREEN}STATUS${NC}"
  echo ""
}

# Display API reference
show_api_reference() {
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}API Reference${NC}"
  echo -e "${YELLOW}========================================${NC}"
  echo ""
  echo -e "${BLUE}GET /api/consumers${NC}"
  echo "  curl $API_CONSUMER"
  echo ""
  echo -e "${BLUE}GET /api/consumers/arrears${NC}"
  echo "  curl $BASE_URL/api/consumers/arrears"
  echo ""
  echo -e "${BLUE}GET /api/instructions/pending${NC}"
  echo "  curl $API_PENDING"
  echo ""
  echo -e "${BLUE}GET /api/logs${NC}"
  echo "  curl $API_LOGS"
  echo ""
  echo -e "${BLUE}POST /api/operators/register${NC}"
  echo "  curl -X POST $API_OPERATORS \\"
  echo '    -H "Content-Type: application/json" \'
  echo '    -d '"'"'{"name":"John","phone_number":"27810000001"}'"'"
  echo ""
}

# Display contact info
show_contact_info() {
  echo -e "${YELLOW}========================================${NC}"
  echo -e "${YELLOW}Support & Contact${NC}"
  echo -e "${YELLOW}========================================${NC}"
  echo ""
  echo -e "${GREEN}📞 KWHILCH GROUP PTY LTD${NC}"
  echo "   Phone: 0680467440"
  echo "   Email: kwhilchgroup@gmail.com"
  echo ""
  echo -e "${GREEN}📚 Documentation${NC}"
  echo "   Quick Start: DEPLOYMENT.md"
  echo "   GitHub: https://github.com/shabakoketso/Debit-NOW-AI"
  echo ""
}

# Main execution
main() {
  check_server
  register_operator
  list_consumers
  list_arrears
  list_pending
  list_logs
  show_dashboard
  show_next_steps
  show_api_reference
  show_contact_info
  
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}✅ All tests completed successfully!${NC}"
  echo -e "${GREEN}========================================${NC}"
}

# Run main function
main
