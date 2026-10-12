#!/usr/bin/env bash
# Usage: annotate.sh level title file — prints the end of a log as a GitHub annotation,
# so results are readable from the run's annotations without downloading logs.
level="$1"; title="$2"; file="$3"
msg=$(tail -c 6000 "$file" 2>/dev/null | python3 -c 'import sys;print(sys.stdin.read().replace("%","%25").replace("\r","").replace("\n","%0A"))')
echo "::${level} title=${title}::${msg}"
