#!/usr/bin/env bash
# GameVault: one command from a fresh clone to a running app (Linux / macOS / WSL).
#
#   ./run.sh               set up everything, deploy to the Learner Lab, create accounts, start the frontend
#   ./run.sh --smoke       ... and run the live smoke test before starting the frontend
#   ./run.sh --no-users    deploy without creating the admin + 3 member accounts
#   ./run.sh --no-deploy   only (re)start the frontend against the last deployment
#   ./run.sh --no-dev      do everything except starting the dev server
#
# The only manual step: put the Learner Lab credentials into .aws/credentials. On the first run this
# script creates that file as a template and stops; fill it in and run ./run.sh again.
# Needs: python3 (with venv), Node.js >= 20.19 and npm. Everything else is installed locally
# (.venv for Python, frontend/node_modules for Node); nothing is installed system-wide.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DEPLOY=1; DEV=1; PASS=()
for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=0 ;;
    --no-dev) DEV=0 ;;
    --smoke|--no-users) PASS+=("$arg") ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see ./run.sh --help)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;35m### %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. system tools -------------------------------------------------------------------------------
step "Checking python3, node and npm"
command -v python3 >/dev/null || fail "python3 not found (Ubuntu/Debian: sudo apt install python3 python3-venv)"
python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))' || fail "python3 >= 3.10 needed, found $(python3 -V)"
python3 -c 'import venv, ensurepip' 2>/dev/null \
  || fail "python3 venv module missing (Ubuntu/Debian: sudo apt install python3-venv)"
command -v node >/dev/null && command -v npm >/dev/null \
  || fail "Node.js/npm not found: install Node.js 22 LTS (e.g. https://nodejs.org or nvm)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)' \
  || fail "Node.js >= 20.19 (or >= 22.12) needed by Vite, found $(node -v)"
echo "$(python3 -V), node $(node -v), npm $(npm -v)"

# --- 2. credentials ---------------------------------------------------------------------------------
if (( DEPLOY )); then
  step "Checking .aws/credentials"
  mkdir -p .aws && chmod 700 .aws
  if [[ ! -f .aws/credentials ]]; then
    cat > .aws/credentials <<'EOF'
# Learner Lab -> "AWS Details" -> "AWS CLI: Show": paste that [default] block here (it changes every
# lab session). Then add the long-term key of the IAM user awsstudent of the SAME lab account under
# [awsstudent] (needed because the default voclabs role cannot create tables or write DynamoDB items).
[default]
aws_access_key_id=PASTE_HERE
aws_secret_access_key=PASTE_HERE
aws_session_token=PASTE_HERE

[awsstudent]
aws_access_key_id=PASTE_HERE
aws_secret_access_key=PASTE_HERE
EOF
    chmod 600 .aws/credentials
    [[ -f .aws/config ]] || printf '[default]\nregion = us-east-1\n' > .aws/config
    fail "created .aws/credentials as a template: fill it in, then run ./run.sh again"
  fi
  chmod 600 .aws/credentials
  [[ -f .aws/config ]] || printf '[default]\nregion = us-east-1\n' > .aws/config
  ! grep -q 'PASTE_HERE' .aws/credentials || fail ".aws/credentials still contains PASTE_HERE placeholders"
fi

# --- 3. Python venv ---------------------------------------------------------------------------------
step "Python environment (.venv)"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
REQ_HASH="$(sha256sum requirements.txt | cut -d' ' -f1)"
if [[ "$(cat .venv/.requirements-hash 2>/dev/null)" != "$REQ_HASH" ]]; then
  .venv/bin/python -m pip install --quiet --upgrade pip
  .venv/bin/python -m pip install --quiet -r requirements.txt
  echo "$REQ_HASH" > .venv/.requirements-hash
  echo "installed requirements.txt"
else
  echo "up to date"
fi

# --- 4. frontend dependencies ---------------------------------------------------------------------
step "Frontend dependencies (frontend/node_modules)"
LOCK_HASH="$(sha256sum frontend/package-lock.json | cut -d' ' -f1)"
if [[ ! -d frontend/node_modules || "$(cat frontend/node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]]; then
  (cd frontend && npm ci --no-audit --no-fund)
  echo "$LOCK_HASH" > frontend/node_modules/.lock-hash
else
  echo "up to date"
fi

# --- 5. deploy + accounts ----------------------------------------------------------------------------
if (( DEPLOY )); then
  step "Deploying to AWS"
  scripts/deploy_all.sh "${PASS[@]+"${PASS[@]}"}"
fi

# --- 6. frontend ------------------------------------------------------------------------------------
[[ -f frontend/.env.local ]] || fail "frontend/.env.local missing: run ./run.sh without --no-deploy first"
if (( DEV )); then
  step "Starting the frontend (Ctrl+C to stop)"
  echo "Sign in with the project-manager account created above (default admin@gamevault.dev)."
  cd frontend && exec npm run dev
fi
step "Ready. Start the frontend with: cd frontend && npm run dev"
