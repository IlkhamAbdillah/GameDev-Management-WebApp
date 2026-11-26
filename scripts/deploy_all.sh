#!/usr/bin/env bash
# One-shot GameVault deployment for the AWS Learner Lab.
#
#   scripts/deploy_all.sh            # tables -> bucket/Lambdas/URLs -> frontend/.env.local -> health -> accounts
#   scripts/deploy_all.sh --smoke    # ... and run the live smoke test (output saved to docs/evidence/)
#   scripts/deploy_all.sh --no-users # skip creating accounts
#
# Why two profiles: the default `voclabs` role can deploy Lambdas (PassRole) but cannot CreateTable or
# write DynamoDB items; `awsstudent` can write DynamoDB but cannot create Lambdas. So tables and
# accounts use awsstudent, everything else the default profile.
#
# Accounts (idempotent: existing emails are left untouched, passwords are never printed or stored):
#   1 project manager  GV_ADMIN_EMAIL   (default admin@gamevault.dev), GV_ADMIN_NAME (default "Admin")
#   3 members          GV_MEMBER_EMAILS (default member1..3@gamevault.dev, space-separated),
#                      GV_MEMBER_NAMES  (default "Member 1|Member 2|Member 3", |-separated)
# Passwords come from GV_ADMIN_PASSWORD / GV_MEMBER_PASSWORD or are prompted for (no echo).
# All members share one password; each person can change it in the app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="$ROOT/.venv/bin/python"

SMOKE=0
USERS=1
for arg in "$@"; do
  case "$arg" in
    --smoke) SMOKE=1 ;;
    --no-users) USERS=0 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- prerequisites -------------------------------------------------------------------------------
[[ -x "$PY" ]] || fail ".venv missing: python3 -m venv .venv && .venv/bin/pip install boto3 pytest moto matplotlib cairosvg"
[[ -f .aws/credentials ]] || fail ".aws/credentials missing: paste the Learner Lab CLI credentials there"
grep -q '^\[default\]' .aws/credentials || fail "no [default] profile in .aws/credentials"
grep -q '^\[awsstudent\]' .aws/credentials || fail "no [awsstudent] profile in .aws/credentials"

export AWS_SHARED_CREDENTIALS_FILE="$ROOT/.aws/credentials"
export AWS_CONFIG_FILE="$ROOT/.aws/config"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
unset AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

as_default()    { AWS_PROFILE=default "$@"; }
as_awsstudent() { AWS_PROFILE=awsstudent "$@"; }

# --- ask for passwords up front so the rest runs unattended ---------------------------------------
read_password() {  # $1 = prompt, $2 = name of the variable to fill
  local p1 p2
  while true; do
    read -rsp "$1 (min 8 chars): " p1; echo
    read -rsp "Repeat: " p2; echo
    if [[ "$p1" != "$p2" ]]; then echo "Passwords differ, try again."
    elif (( ${#p1} < 8 || ${#p1} > 128 )); then echo "Must be 8-128 characters."
    else printf -v "$2" '%s' "$p1"; return; fi
  done
}

ADMIN_EMAIL="${GV_ADMIN_EMAIL:-admin@gamevault.dev}"
ADMIN_NAME="${GV_ADMIN_NAME:-Admin}"
read -ra MEMBER_EMAILS <<< "${GV_MEMBER_EMAILS:-member1@gamevault.dev member2@gamevault.dev member3@gamevault.dev}"
IFS='|' read -ra MEMBER_NAMES <<< "${GV_MEMBER_NAMES:-Member 1|Member 2|Member 3}"
(( ${#MEMBER_EMAILS[@]} == ${#MEMBER_NAMES[@]} )) || fail "GV_MEMBER_EMAILS and GV_MEMBER_NAMES have different lengths"

if (( USERS )); then
  ADMIN_PASSWORD="${GV_ADMIN_PASSWORD:-}"
  MEMBER_PASSWORD="${GV_MEMBER_PASSWORD:-}"
  [[ -n "$ADMIN_PASSWORD" ]]  || read_password "Password for project manager $ADMIN_EMAIL" ADMIN_PASSWORD
  [[ -n "$MEMBER_PASSWORD" ]] || read_password "Shared password for the ${#MEMBER_EMAILS[@]} members" MEMBER_PASSWORD
fi

# --- 1. both profiles must work and point at the same AWS account ---------------------------------
step "Checking credentials"
account_of() { "$PY" -c 'import boto3; print(boto3.client("sts").get_caller_identity()["Account"])' 2>/dev/null; }
ACC_DEFAULT="$(as_default account_of)" \
  || fail "default (voclabs) credentials rejected: Start Lab and paste fresh credentials into .aws/credentials"
ACC_STUDENT="$(as_awsstudent account_of)" \
  || fail "awsstudent credentials rejected: check its key in .aws/credentials"
echo "default    -> account $ACC_DEFAULT"
echo "awsstudent -> account $ACC_STUDENT"
[[ "$ACC_DEFAULT" == "$ACC_STUDENT" ]] \
  || fail "the two profiles are in different AWS accounts (lab recreated?): update the awsstudent key"

# --- 2. tables (awsstudent) ------------------------------------------------------------------------
step "DynamoDB tables (awsstudent)"
as_awsstudent "$PY" scripts/deploy.py --tables-only

# --- 3. bucket, Lambdas, Function URLs (default) ---------------------------------------------------
step "S3 bucket, Lambdas and Function URLs (default)"
as_default "$PY" scripts/deploy.py

# --- 4. frontend env -------------------------------------------------------------------------------
step "Writing frontend/.env.local from .aws/outputs.json"
if [[ -f frontend/.env.local ]]; then cp frontend/.env.local frontend/.env.local.bak; echo "previous file kept as frontend/.env.local.bak"; fi
"$PY" - <<'EOF'
import json
o = json.load(open(".aws/outputs.json"))
lines = [f"VITE_ASSET_API_URL={o['assetApiUrl']}", f"VITE_TASK_API_URL={o['taskApiUrl']}", f"VITE_AUTH_API_URL={o['authApiUrl']}"]
open("frontend/.env.local", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
EOF

# --- 5. health -------------------------------------------------------------------------------------
step "Health checks"
"$PY" - <<'EOF'
import json, sys, time, urllib.request, urllib.error
o = json.load(open(".aws/outputs.json"))
bad = []
for key in ("assetApiUrl", "taskApiUrl", "authApiUrl"):
    for attempt in range(5):  # a freshly created Function URL can take a few seconds to answer
        try:
            with urllib.request.urlopen(o[key] + "/health", timeout=20) as r:
                print(f"{key:12} HTTP {r.status} {json.loads(r.read())['data']['status']}")
            break
        except (urllib.error.URLError, OSError) as err:
            if attempt == 4:
                print(f"{key:12} FAILED: {err}"); bad.append(key)
            else:
                time.sleep(3)
sys.exit(1 if bad else 0)
EOF

# --- 6. accounts (awsstudent) ----------------------------------------------------------------------
if (( USERS )); then
  step "Accounts (awsstudent)"
  GV_ADMIN_PASSWORD="$ADMIN_PASSWORD" as_awsstudent "$PY" scripts/seed_admin.py \
    --email "$ADMIN_EMAIL" --name "$ADMIN_NAME" --role project_manager
  for i in "${!MEMBER_EMAILS[@]}"; do
    GV_ADMIN_PASSWORD="$MEMBER_PASSWORD" as_awsstudent "$PY" scripts/seed_admin.py \
      --email "${MEMBER_EMAILS[$i]}" --name "${MEMBER_NAMES[$i]}" --role member
  done
  unset ADMIN_PASSWORD MEMBER_PASSWORD
fi

# --- 7. optional smoke test ------------------------------------------------------------------------
if (( SMOKE )); then
  step "Live smoke test"
  as_default "$PY" scripts/smoke_test.py | tee docs/evidence/smoke-test-output.txt
fi

step "Done"
echo "Restart the frontend dev server so it picks up the new URLs:  cd frontend && npm run dev"
