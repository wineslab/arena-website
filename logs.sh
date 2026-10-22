#!/usr/bin/env bash
# logs.sh — view the Arena app logs.
#
# Usage:
#   ./logs.sh           Follow the log live (tail -f).
#   ./logs.sh 100       Print the last 100 lines and exit.
set -euo pipefail

cd "$(dirname "$0")"

LOG_FILE="logs/arena.log"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No log file yet at $LOG_FILE — start the app with ./start.sh" >&2
  exit 1
fi

if [[ $# -ge 1 ]]; then
  tail -n "$1" "$LOG_FILE"
else
  echo "Following $LOG_FILE (Ctrl-C to quit)…"
  tail -f "$LOG_FILE"
fi
