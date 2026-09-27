#!/usr/bin/env bash
# Verifies that App Service built-in authentication (ADR 0002) guards a host (spec 0002 D7/D8):
#   1. a non-browser request gets 401 with a Bearer challenge from the platform
#      (not the app: the app's own 401 has no WWW-Authenticate header);
#   2. a browser request is redirected (302) to the tenant's Microsoft Entra sign-in page.
# Usage: check-signin-required.sh <host> <tenant-id>
set -euo pipefail
host="$1"
tenant="$2"

headers=$(curl -s -D - -o /dev/null --max-time 15 "https://$host/" | tr -d '\r')
status=$(head -n1 <<<"$headers" | awk '{print $2}')
if [ "$status" != "401" ] || ! grep -qi '^www-authenticate: Bearer' <<<"$headers"; then
  echo "::error::$host: non-browser request was not challenged by built-in auth (status $status)"
  exit 1
fi

read -r code location < <(curl -s -o /dev/null --max-time 15 \
  -H 'Accept: text/html,application/xhtml+xml' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) longrun-deploy-check' \
  -w '%{http_code} %{redirect_url}\n' "https://$host/")
expected="https://login.microsoftonline.com/$tenant/oauth2/v2.0/authorize"
if [ "$code" != "302" ] || [[ "$location" != "$expected"* ]]; then
  echo "::error::$host: browser request was not redirected to Microsoft Entra sign-in (status $code)"
  exit 1
fi
echo "$host requires sign-in (401 challenge for clients, 302 to Entra for browsers)"
