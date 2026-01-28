#!/bin/bash
host="http://localhost:8000"

echo "Testing Go Backend API at $host"

# 1. Login
echo -e "\n1. Logging in..."
response=$(curl -s -X POST $host/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@example.com", "password":"admin"}')

echo "Response: $response"

# Extract token (simple string extraction if jq not available, though python is available)
token=$(echo $response | python3 -c "import sys, json; print(json.load(sys.stdin).get('access_token', ''))")

if [ -z "$token" ]; then
    echo "Login failed!"
    exit 1
fi

echo "Token received."

# 2. List Containers
echo -e "\n2. Listing Containers..."
curl -s -H "Authorization: Bearer $token" $host/api/v1/containers/
echo ""

# 3. System Info
echo -e "\n3. System Info..."
curl -s -H "Authorization: Bearer $token" $host/api/v1/docker/system/info
echo ""
