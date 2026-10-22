#!/usr/bin/env bash
# start.sh — launch the Arena web app (LDAP + RBAC) in the background.
#
# Uses the project virtualenv, writes logs to logs/arena.log and the PID to
# run/arena.pid. Refuses to start a second copy if one is already running.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-8080}"
PYTHON="./arena-website/bin/python"
LOG_DIR="logs"
RUN_DIR="run"
LOG_FILE="$LOG_DIR/arena.log"
PID_FILE="$RUN_DIR/arena.pid"

mkdir -p "$LOG_DIR" "$RUN_DIR"

# Already running? (check the PID file, then the port.)
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running (pid $(cat "$PID_FILE")). Use ./stop.sh first." >&2
  exit 1
fi
if ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q ":$PORT"; then
  echo "Port $PORT is already in use by another process. Use ./stop.sh or set PORT=..." >&2
  exit 1
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "Virtualenv python not found at $PYTHON" >&2
  exit 1
fi

echo "Starting Arena on http://localhost:$PORT  (logs: $LOG_FILE)"
nohup "$PYTHON" app.py >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
sleep 1

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Started (pid $(cat "$PID_FILE")). Tail logs with ./logs.sh"
else
  echo "Failed to start — see $LOG_FILE" >&2
  rm -f "$PID_FILE"
  exit 1
fi
