#!/usr/bin/env bash
# stop.sh — stop the Arena web app.
#
# Kills the process from run/arena.pid, then sweeps any leftover process still
# listening on the port (Flask's debug reloader spawns a child with its own PID).
set -uo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-8080}"
PID_FILE="run/arena.pid"
stopped=0

# 1) Kill the recorded PID (and let it take its children down).
if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null && stopped=1
  fi
  rm -f "$PID_FILE"
fi

# 2) Sweep anything still listening on the port (e.g. reloader child).
port_pids="$(ss -ltnp "( sport = :$PORT )" 2>/dev/null \
              | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
if [[ -n "$port_pids" ]]; then
  for p in $port_pids; do
    kill "$p" 2>/dev/null && stopped=1
  done
fi

# 3) Give them a moment; force-kill survivors on the port.
sleep 1
port_pids="$(ss -ltnp "( sport = :$PORT )" 2>/dev/null \
              | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
if [[ -n "$port_pids" ]]; then
  for p in $port_pids; do kill -9 "$p" 2>/dev/null && stopped=1; done
fi

if [[ "$stopped" -eq 1 ]]; then
  echo "Stopped Arena (port $PORT)."
else
  echo "Nothing was running on port $PORT."
fi
