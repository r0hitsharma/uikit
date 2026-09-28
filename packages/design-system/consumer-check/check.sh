#!/usr/bin/env bash
# Builds the published Panda preset the way a consumer does and fails on any
# token it leaves unresolved. Run after `npm run build` (the config imports the
# preset from `dist/`), from anywhere in the repo:
#
#   packages/design-system/consumer-check/check.sh
#
# Panda reports an unresolved token reference as a `Missing token` warning and
# still exits 0, so the output is captured and grepped instead of trusting the
# exit status. The generated stylesheet is then run through `uikit-cli doctor`.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$here/../../.." && pwd)
cd "$here"

output=''
run_panda() {
  local log status=0
  log=$(npx panda "$@" --config panda.config.ts 2>&1) || status=$?
  printf '%s\n' "$log"
  output+="$log"$'\n'
  if [ "$status" -ne 0 ]; then
    echo "::error::panda $1 exited with status $status" >&2
    exit "$status"
  fi
}

run_panda codegen --clean
run_panda cssgen --outfile styled-system/styles.css

if missing=$(printf '%s' "$output" | grep 'Missing token'); then
  count=$(printf '%s\n' "$missing" | wc -l | tr -d ' ')
  echo "::error::panda reported $count Missing token warning(s) for the design-system preset in a consumer config" >&2
  exit 1
fi
echo 'No Missing token warnings.'

node "$repo_root/packages/uikit-cli/dist/cli.js" doctor styled-system/styles.css
