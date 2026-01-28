#!/bin/bash

BASE_URL="http://localhost:8000/api/v1"
echo "Testing API at $BASE_URL"

# 1. Login
echo "1. Logging in..."
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@example.com", "password": "admin"}')

echo "Response: $TOKEN_RESP"
TOKEN=$(echo $TOKEN_RESP | grep -o '"access_token":"[^"]*' | grep -o '[^"]*$')

if [ -z "$TOKEN" ]; then
  echo "Login failed!"
  exit 1
fi

echo "Token received."

# 2. System Info
echo "2. Getting System Info..."
curl -s -X GET "$BASE_URL/docker/system/info" \
  -H "Authorization: Bearer $TOKEN" | grep -o '"DockerVersion":"[^"]*"'

# 3. List Containers
echo "3. Listing Containers..."
curl -s -X GET "$BASE_URL/containers" \
  -H "Authorization: Bearer $TOKEN" | head -c 100
echo "..."

echo "API Verification Complete"
