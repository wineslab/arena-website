#!/usr/bin/env bash
# monitor.sh — live, readable status of everything Arena runs.
#
# Two apps make up Arena:
#   • web — the Flask app (logs/arena.log, run/arena.pid, port $PORT)
#   • db  — PostgreSQL in Docker (container "arena-db", port 5432)
#
# Usage:
#   ./monitor.sh            Status panel, then follow BOTH logs live (colorized).
#   ./monitor.sh status     Print the status panel once and exit.
#   ./monitor.sh watch      Refresh the status panel every 2s (no logs).
#   ./monitor.sh logs       Skip the panel, just follow both logs live.
#
# In the live stream each line is tagged [web] / [db]; errors are red,
# warnings/HTTP 4xx-5xx are yellow — so problems jump out in real time.
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
LOG_FILE="logs/arena.log"
PID_FILE="run/arena.pid"
DB_CONTAINER="arena-db"
LINES="${LINES:-40}"          # history shown when following logs

# ── colors (disabled if stdout isn't a terminal) ──────────────────────────────
if [[ -t 1 ]]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[34m'; C=$'\033[36m'
  DIM=$'\033[2m'; BOLD=$'\033[1m'; Z=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; C=''; DIM=''; BOLD=''; Z=''
fi

dot()  { printf '%s●%s' "$1" "$Z"; }   # colored status dot
have() { command -v "$1" >/dev/null 2>&1; }

# ── status checks ─────────────────────────────────────────────────────────────

web_status() {
  local pid="" alive=0 port=0 http="—"
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && alive=1
  fi
  ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q ":$PORT" && port=1
  if have curl; then
    http="$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null || echo 000)"
  fi

  if [[ $alive -eq 1 && ( "$http" =~ ^[23] || $port -eq 1 ) ]]; then
    printf '%s  %sweb%s   pid %-7s port %s   HTTP %s%s%s\n' \
      "$(dot "$G")" "$BOLD" "$Z" "${pid:-?}" "$PORT" \
      "$([[ "$http" =~ ^[23] ]] && echo "$G" || echo "$Y")" "$http" "$Z"
  elif [[ $port -eq 1 ]]; then
    printf '%s  %sweb%s   port %s in use, but pidfile stale  %s(run ./stop.sh then ./start.sh)%s\n' \
      "$(dot "$Y")" "$BOLD" "$Z" "$PORT" "$DIM" "$Z"
  else
    printf '%s  %sweb%s   not running                       %s(start with ./start.sh)%s\n' \
      "$(dot "$R")" "$BOLD" "$Z" "$DIM" "$Z"
  fi
}

db_status() {
  if ! have docker; then
    printf '%s  %sdb%s    docker not installed%s\n' "$(dot "$DIM")" "$BOLD" "$Z" ""
    return
  fi
  local state health
  state="$(docker inspect -f '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || echo absent)"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$DB_CONTAINER" 2>/dev/null || echo none)"

  case "$state" in
    running)
      if [[ "$health" == "healthy" || "$health" == "none" ]]; then
        printf '%s  %sdb%s    container up   port 5432   health: %s\n' "$(dot "$G")" "$BOLD" "$Z" "${health}"
      else
        printf '%s  %sdb%s    container up   health: %s%s%s  %s(docker compose logs db)%s\n' \
          "$(dot "$Y")" "$BOLD" "$Z" "$Y" "$health" "$Z" "$DIM" "$Z"
      fi ;;
    absent)
      printf '%s  %sdb%s    no container                      %s(start with docker compose up -d)%s\n' \
        "$(dot "$R")" "$BOLD" "$Z" "$DIM" "$Z" ;;
    *)
      printf '%s  %sdb%s    container %s%s%s\n' "$(dot "$R")" "$BOLD" "$Z" "$R" "$state" "$Z" ;;
  esac
}

last_problem() {
  # Show the most recent error-ish line from the web log, if any.
  [[ -f "$LOG_FILE" ]] || return
  local line
  # Prefer the actual exception/error message; skip traceback frames and the
  # "(Background on this error…)" hint URL that SQLAlchemy appends.
  line="$(grep -iE 'error|exception|critical|fatal' "$LOG_FILE" 2>/dev/null \
          | grep -viE '^\s*(\(Background|File "|raise |self\.|[a-z_]+\()|sqlalche\.me' \
          | tail -n 1)"
  [[ -n "$line" ]] && printf '  %slast web error:%s %s%s%s\n' "$DIM" "$Z" "$R" "${line:0:110}" "$Z"
}

panel() {
  printf '%s┌─ Arena status ─ %s ─────────────────────────────%s\n' "$C" "$(date '+%H:%M:%S')" "$Z"
  web_status
  db_status
  last_problem
  printf '%s└──────────────────────────────────────────────────────────%s\n' "$C" "$Z"
}

# ── live log stream ───────────────────────────────────────────────────────────

# Reads stdin, prefixes each line with a colored [tag], and tints the line by
# severity (red = error/traceback, yellow = warning or HTTP 4xx/5xx).
colorize() {
  local tag="$1" tagcol="$2"
  awk -v tag="[$tag]" -v tc="$tagcol" -v z="$Z" -v r="$R" -v y="$Y" '
    {
      lc = tolower($0); col = ""
      if (lc ~ /error|exception|traceback|critical|fatal|failed/)      col = r
      else if (lc ~ /warn/ || $0 ~ /" (4[0-9][0-9]|5[0-9][0-9]) /)     col = y
      printf "%s%-6s%s %s%s%s\n", tc, tag, z, col, $0, z
      fflush()
    }'
}

follow_logs() {
  local pids=()
  printf '%sFollowing logs (Ctrl-C to quit)…%s\n\n' "$DIM" "$Z"

  if [[ -f "$LOG_FILE" ]]; then
    tail -n "$LINES" -f "$LOG_FILE" 2>/dev/null | colorize web "$C" &
    pids+=($!)
  else
    printf '%s[web]  no log yet at %s — start with ./start.sh%s\n' "$Y" "$LOG_FILE" "$Z"
  fi

  if have docker && docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    docker logs -f --tail "$LINES" "$DB_CONTAINER" 2>&1 | colorize db "$B" &
    pids+=($!)
  else
    printf '%s[db]   container %s not running — start with docker compose up -d%s\n' "$Y" "$DB_CONTAINER" "$Z"
  fi

  if [[ ${#pids[@]} -eq 0 ]]; then
    echo "Nothing to follow."
    return
  fi
  # Clean up the background tails on exit.
  trap 'kill "${pids[@]}" 2>/dev/null; printf "\n%sstopped.%s\n" "$DIM" "$Z"; exit 0' INT TERM
  wait
}

# ── dispatch ──────────────────────────────────────────────────────────────────
case "${1:-live}" in
  status|-s)   panel ;;
  watch|-w)    while true; do clear; panel; sleep 2; done ;;
  logs|-l)     follow_logs ;;
  live|"")     panel; echo; follow_logs ;;
  -h|--help)   sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)           echo "Unknown command: $1 (try: status | watch | logs | live)" >&2; exit 1 ;;
esac
