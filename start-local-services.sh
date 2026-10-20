#!/usr/bin/env bash
# Starts the 5 non-Docker services (backend, file-service, notification-service,
# call-service, frontend), each in its own terminal window running
# the real foreground command — so you see live output/errors directly instead
# of them being buried in logs/<name>.log (still tee'd there too, for `tail -f`).
# Run deploy-local.sh first to bring up Postgres/Keycloak/RabbitMQ and the
# api-gateway container (:8081).
#
# Usage:
#   ./start-local-services.sh          # start all services (opens one terminal window each)
#   ./start-local-services.sh stop     # stop all services started by this script
#   ./start-local-services.sh status   # show which services are running

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
PID_FILE="$SCRIPT_DIR/.local-services.pids"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
ok()  { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
warn() { echo "[$(date '+%H:%M:%S')] ⚠ $*" >&2; }
err() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; exit 1; }

# name -> URL polled to decide "healthy". Spring services expose actuator/health;
# ng serve has none, so any HTTP response on the dev server root counts as up.
declare -A HEALTH_URLS=(
  [backend]="http://localhost:8082/actuator/health"
  [file-service]="http://localhost:8083/actuator/health"
  [notification-service]="http://localhost:8084/actuator/health"
  [call-service]="http://localhost:8085/actuator/health"
  [frontend]="http://localhost:4200"
)
HEALTH_TIMEOUT=90   # seconds to wait for a single service to become healthy
HEALTH_INTERVAL=2

declare -A SERVICE_PORTS=(
  [backend]=8082
  [file-service]=8083
  [notification-service]=8084
  [call-service]=8085
  [frontend]=4200
)

# Prints the PID bound to $1/tcp (LISTEN), or nothing if the port is free.
# The `|| true` matters: under `pipefail`, an intermediate grep finding no match
# (the common, "port is free" case) makes the whole pipeline report failure even
# though `head -1` itself succeeds — which would silently kill the script via
# `set -e` at the call site (`existing_pid="$(port_owner_pid ...)"` isn't inside
# an if/while, so nothing else guards it).
port_owner_pid() {
  ss -ltnp 2>/dev/null | grep -E ":$1[[:space:]]" | grep -oP 'pid=\K[0-9]+' | head -1 || true
}

# Returns 0 once the service responds healthy, 1 on timeout. Never trips `set -e`
# on transient curl failures while a JVM is still booting.
wait_for_health() {
  local name="$1" url="$2" waited=0 body=""
  while (( waited < HEALTH_TIMEOUT )); do
    if [[ "$name" == "frontend" ]]; then
      curl -s -o /dev/null --max-time 2 "$url" && return 0
    else
      body="$(curl -s --max-time 2 "$url" 2>/dev/null || true)"
      [[ "$body" == *'"status":"UP"'* ]] && return 0
    fi
    sleep "$HEALTH_INTERVAL"
    waited=$(( waited + HEALTH_INTERVAL ))
  done
  return 1
}

command -v direnv >/dev/null 2>&1 || err "direnv not found — needed to load .env (see .envrc)"
[[ -f "$SCRIPT_DIR/.env" ]] || err ".env not found — create it from .env.example"

# Picks a terminal emulator: $TERMINAL if set, else the first of these found
# on PATH. Prints the binary name on stdout, fails if none exist.
pick_terminal() {
  local candidates=("${TERMINAL:-}" konsole tilix gnome-terminal xterm x-terminal-emulator)
  for t in "${candidates[@]}"; do
    [[ -z "$t" ]] && continue
    if command -v "$t" >/dev/null 2>&1; then
      echo "$t"
      return 0
    fi
  done
  return 1
}

# Opens a new terminal window titled $1, running $3 (a shell command string)
# from working directory $2 via emulator $4. Prints the PID of the launched
# window process to stdout, needed by stop_all()/status_all() for tracking.
#
# Backgrounding the emulator and capturing "$!" only gives a real, killable
# window PID if the emulator forks a standalone process per invocation rather
# than handing off to an already-running single-instance/D-Bus server (which
# would make "$!" a short-lived launcher PID instead) — verified empirically
# for konsole in this env; gnome-terminal is given --wait specifically because
# it's a known offender here, but an untested emulator could still misbehave.
launch_in_terminal() {
  local title="$1" workdir="$2" body="$3" bin="$4"
  local wrapped="set -o pipefail; printf '\033]0;%s\007' '$title'; cd '$workdir' && { $body; }; ec=\$?; echo; echo \"[$title] exited with code \$ec — press Enter to close this window\"; read -r _"
  # Redirected to /dev/null: the terminal emulator's own startup chatter (e.g.
  # konsole's locale warning) would otherwise inherit this function's stdout —
  # which, called as "pid=\$(launch_in_terminal ...)", is a pipe being read by
  # command substitution. Since the backgrounded emulator keeps that fd open
  # for its entire lifetime, the substitution would block until the window is
  # closed instead of returning immediately after echoing the PID below.
  case "$(basename "$bin")" in
    konsole)        konsole -e bash -c "$wrapped" >/dev/null 2>&1 & ;;
    tilix)          tilix -e bash -c "$wrapped" >/dev/null 2>&1 & ;;
    gnome-terminal) gnome-terminal --wait --title="$title" -- bash -c "$wrapped" >/dev/null 2>&1 & ;;
    *)              "$bin" -T "$title" -e bash -c "$wrapped" >/dev/null 2>&1 & ;;
  esac
  echo $!
}

# name:dir:command
SERVICES=(
  "backend:wac/backend:./mvnw spring-boot:run"
  "file-service:wac/file-service:./mvnw spring-boot:run"
  "notification-service:wac/notification-service:./mvnw spring-boot:run"
  "call-service:wac/call-service:./mvnw spring-boot:run"
  "frontend:wac/frontend:npm start"
)

start_all() {
  mkdir -p "$LOG_DIR"
  : > "$PID_FILE"

  local term_bin
  term_bin="$(pick_terminal)" || err "No terminal emulator found (tried \$TERMINAL, konsole, tilix, gnome-terminal, xterm, x-terminal-emulator) — install one or set \$TERMINAL"
  log "Using terminal emulator: $term_bin"

  local skipped=() launched=()

  for entry in "${SERVICES[@]}"; do
    local_name="${entry%%:*}"
    rest="${entry#*:}"
    local_dir="${rest%%:*}"
    local_cmd="${rest#*:}"

    port="${SERVICE_PORTS[$local_name]:-}"
    if [[ -n "$port" ]]; then
      existing_pid="$(port_owner_pid "$port")"
      if [[ -n "$existing_pid" ]]; then
        existing_cmd="$(ps -p "$existing_pid" -o cmd= 2>/dev/null | cut -c1-70 || true)"
        warn "$local_name: port $port already in use by PID $existing_pid ($existing_cmd) — not starting a duplicate"
        skipped+=("$local_name")
        continue
      fi
    fi

    log "Starting $local_name in a new terminal window ..."
    body="direnv exec '$SCRIPT_DIR/$local_dir' $local_cmd 2>&1 | tee '$LOG_DIR/$local_name.log'"
    pid="$(launch_in_terminal "$local_name" "$SCRIPT_DIR/$local_dir" "$body" "$term_bin")"
    echo "$local_name:$pid" >> "$PID_FILE"
    ok "$local_name started (pid $pid, log: logs/$local_name.log)"
    launched+=("$local_name")
    sleep 1
  done

  local any_failed=0
  if [[ ${#launched[@]} -gt 0 ]]; then
    echo ""
    log "Waiting for services to become healthy (up to ${HEALTH_TIMEOUT}s each)..."
    for local_name in "${launched[@]}"; do
      url="${HEALTH_URLS[$local_name]:-}"
      [[ -z "$url" ]] && continue
      if wait_for_health "$local_name" "$url"; then
        ok "$local_name is healthy ($url)"
      else
        warn "$local_name did NOT become healthy within ${HEALTH_TIMEOUT}s ($url) — last log lines:"
        tail -n 20 "$LOG_DIR/$local_name.log" >&2 || true
        any_failed=1
      fi
    done
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ ${#skipped[@]} -gt 0 ]]; then
    echo " ⚠ Skipped (port already held by another process): ${skipped[*]}"
    echo "   Kill the owning PID shown in the warning above, then re-run to actually start it."
  fi
  if [[ "$any_failed" -eq 0 && ${#skipped[@]} -eq 0 ]]; then
    echo " All services are up and healthy."
  elif [[ "$any_failed" -ne 0 ]]; then
    echo " ⚠ One or more freshly-launched services failed their health check — see above."
  fi
  echo " Tail logs with:  tail -f logs/<service>.log"
  echo " Check status:    ./start-local-services.sh status"
  echo " Stop everything: ./start-local-services.sh stop"
  echo ""
  echo " Gateway  : http://localhost:8081"
  echo " Frontend : http://localhost:4200"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  [[ "$any_failed" -eq 0 && ${#skipped[@]} -eq 0 ]] || exit 1
}

stop_all() {
  [[ -f "$PID_FILE" ]] || { log "No PID file found — nothing to stop"; exit 0; }
  while IFS=: read -r name pid; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
      ok "Stopped $name (pid $pid)"
    else
      log "$name (pid $pid) already stopped"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
}

status_all() {
  [[ -f "$PID_FILE" ]] || { log "No PID file found — nothing tracked"; exit 0; }
  while IFS=: read -r name pid; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
      echo "  $name: running (pid $pid)"
    else
      echo "  $name: stopped"
    fi
  done < "$PID_FILE"
}

case "${1:-start}" in
  start)  start_all ;;
  stop)   stop_all ;;
  status) status_all ;;
  *) err "Usage: $0 [start|stop|status]" ;;
esac
