#!/usr/bin/env bash
# Build, stage and publish the KYC landing page to IPFS. See HOWTO_DEPLOY.md.
# Usage:
#   ./scripts/deploy.sh                 build, publish, log CID
#   ./scripts/deploy.sh --check <CID>   build, hash only, compare against <CID>
# Requires: node, kubo (`ipfs`) with its daemon running.
# Optional env: KYC_CONFIG_FILE (default config.public.js),
#               MIRROR_API + MIRROR_AUTH (user:pwd) to pin on a remote node.
set -euo pipefail
cd "$(dirname "$0")/.."

CHECK_CID=""
if [ "${1:-}" = "--check" ]; then
  CHECK_CID="${2:?usage: deploy.sh --check <CID>}"
fi

CONFIG="${KYC_CONFIG_FILE:-config.public.js}"
[ -f "$CONFIG" ] || { echo "Missing $CONFIG: copy src/config.example.js and fill the non-secret values."; exit 1; }

# The published config is world-readable; never let a key through.
if grep -nE "(apiKey|accessToken):[[:space:]]*['\"][^'\"]+" "$CONFIG"; then
  echo "REFUSING to publish: $CONFIG contains a secret. Use tokenEndpoint or minted links instead."
  exit 1
fi

node build.mjs
rm -rf .stage && mkdir .stage
cp dist/index.html dist/app.js dist/zkme-style.css .stage/
cp "$CONFIG" .stage/config.js

if [ -n "$CHECK_CID" ]; then
  # -n: hash only, nothing published or pinned
  LOCAL_CID=$(ipfs add -rQn --cid-version 1 .stage)
  if [ "$LOCAL_CID" = "$CHECK_CID" ]; then
    echo "MATCH: local build reproduces $CHECK_CID"
  else
    echo "MISMATCH: local build gives $LOCAL_CID, expected $CHECK_CID"
    exit 1
  fi
  exit 0
fi

# CIDv1: required for subdomain gateways such as <cid>.ipfs.dweb.link
CID=$(ipfs add -rQ --cid-version 1 --pin=true .stage)
echo "- $(date -u +%F) \`$CID\`" >> DEPLOYMENTS.md

if [ -n "${MIRROR_API:-}" ]; then
  curl -u "$MIRROR_AUTH" -s -X POST "$MIRROR_API/api/v0/pin/add?recursive=true&arg=$CID" >/dev/null \
    && echo "mirror-pinned on $MIRROR_API"
fi

cat <<EOF

Published: $CID   (logged in DEPLOYMENTS.md)

Preview now:
  ipfs://$CID/
  https://ipfs.io/ipfs/$CID/
  https://$CID.ipfs.dweb.link/

Then point ENS at it (via the curators' SAFE, see HOWTO_DEPLOY.md):
  kyc.kusama-vision-pop.eth -> contenthash ipfs://$CID

Stable applicant URLs after the ENS update:
  https://kyc.kusama-vision-pop.eth.limo/
  https://kyc.kusama-vision-pop.eth.link/

Curators verify the release without publishing:
  ./scripts/deploy.sh --check $CID
EOF
