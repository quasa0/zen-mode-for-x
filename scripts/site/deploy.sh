#!/bin/bash
# Publishes site/ to https://zen.quasa0.com. Run only with the owner's authorization.
# Prerequisite: `yarn package:extension`, so the downloads match the current source.
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/site/release.py
python3 scripts/site/check.py
RESULT=$(vercel deploy site --prod --yes --non-interactive --format json)
DEPLOYMENT=$(printf '%s' "$RESULT" | python3 -c 'import json,sys; result=json.load(sys.stdin)["deployment"]; assert result["readyState"] == "READY"; print(result["url"])')
# Generated deployment URLs can require a Vercel login. Verify the production alias, then smoke the public domain.
vercel inspect "$DEPLOYMENT" --format json | python3 -c 'import json,sys; result=json.load(sys.stdin); assert result["readyState"] == "READY"; assert "zen.quasa0.com" in result["aliases"], result["aliases"]'
python3 scripts/site/smoke.py https://zen.quasa0.com
printf 'Verified: %s\n' "$DEPLOYMENT"
