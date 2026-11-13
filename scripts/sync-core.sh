#!/bin/sh
# Copies shared/core.js into every mod folder.
# With --check: changes nothing, lists copies that differ, and exits 1 if any do.
set -eu
cd "$(dirname "$0")/.."
status=0
for dir in */mods/*/; do
  if [ "${1:-}" = "--check" ]; then
    cmp -s shared/core.js "${dir}core.js" || { echo "out of date: ${dir}core.js"; status=1; }
  else
    cp shared/core.js "${dir}core.js"
  fi
done
exit $status
