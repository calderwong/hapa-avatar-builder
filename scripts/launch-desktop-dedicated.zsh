#!/bin/zsh
set -euo pipefail

APP_ROOT="${HAPA_AVATAR_BUILDER_ROOT:-/Users/calderwong/Desktop/hapa-avatar-builder}"
APP_ROOT="$(cd "$APP_ROOT" && pwd -P)"
EXPECTED_BUILD_SIGNATURE="$(/usr/bin/python3 -c 'import hashlib, pathlib, sys; h=hashlib.sha256(); [h.update(pathlib.Path(p).read_bytes()) for p in sys.argv[1:]]; print(h.hexdigest()[:16])' "$APP_ROOT/server/api.mjs" "$APP_ROOT/server/file-serving.mjs")"
CANONICAL_LAUNCHD_LABEL="com.hapa.avatarbuilder.8797.codex"
CANONICAL_PORT="8797"
OPERATOR_CONSOLE_PORT="${HAPA_AVATAR_OPERATOR_PORT:-8799}"
LOG_DIR="$APP_ROOT/logs"
LOG_FILE="$LOG_DIR/desktop-dedicated-launcher.log"
mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
exec >> "$LOG_FILE" 2>&1

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

is_hapa_html() {
  local port="$1"
  curl -fsS --max-time 1 "http://127.0.0.1:${port}/" 2>/dev/null | head -c 1024 | grep -q "Hapa Avatar Builder"
}

is_hapa_api() {
  local port="$1"
  local expected_owner="${2:-}"
  curl -fsS --max-time 1 "http://127.0.0.1:${port}/api/health" 2>/dev/null | /usr/bin/python3 -c '
import json, sys
payload = json.load(sys.stdin)
expected_signature = sys.argv[1]
expected_owner = sys.argv[2]
runtime = payload.get("runtime") or {}
echo_freshness = runtime.get("echoDeliveryFreshness") or {}
ok = (
    payload.get("service") == "hapa-avatar-builder"
    and runtime.get("buildSignature") == expected_signature
    and echo_freshness.get("ok") is True
)
if expected_owner:
    ok = ok and runtime.get("processOwner") == expected_owner
raise SystemExit(0 if ok else 1)
' "$EXPECTED_BUILD_SIGNATURE" "$expected_owner"
}

is_hapa_endpoint() {
  local port="$1"
  local expected_owner="${2:-}"
  is_hapa_html "$port" && is_hapa_api "$port" "$expected_owner"
}

launchd_target() {
  echo "gui/$(id -u)/${CANONICAL_LAUNCHD_LABEL}"
}

canonical_launchd_registered() {
  launchctl print "$(launchd_target)" >/dev/null 2>&1
}

restart_canonical_launchd() {
  echo "[$(timestamp)] Restarting canonical launchd-owned Avatar Builder API"
  launchctl kickstart -k "$(launchd_target)"
}

is_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

pids_for_port() {
  local port="$1"
  lsof -nP -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | sort -u
}

stop_listeners_on_port() {
  local port="$1"
  local pids
  pids="$(pids_for_port "$port" || true)"
  if [ -z "$pids" ]; then
    return
  fi
  echo "$pids" | while read -r pid; do
    if [ -n "$pid" ]; then
      echo "[$(timestamp)] Stopping stale Hapa desktop server process $pid on port $port"
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  for _ in {1..24}; do
    if ! is_listening "$port"; then
      return
    fi
    sleep 0.25
  done
}

desktop_process_pids() {
  ps -axo pid=,command= | awk -v root="$APP_ROOT" '
    index($0, root "/node_modules/.bin/electron .") ||
    index($0, root "/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .") {
      print $1
    }
  ' | sort -u
}

is_owned_desktop_process() {
  local pid="$1"
  local command
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$command" in
    "$APP_ROOT/node_modules/.bin/electron ."*|"$APP_ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ."*)
      return 0
      ;;
  esac
  return 1
}

close_existing_desktops() {
  if [ "${HAPA_AVATAR_KEEP_EXISTING:-0}" = "1" ]; then
    echo "[$(timestamp)] Keeping existing Hapa Avatar Builder desktop windows by request"
    return
  fi

  local output
  output="$(desktop_process_pids || true)"
  if [ -z "$output" ]; then
    return
  fi

  local -a pids
  pids=("${(@f)output}")
  local pid
  for pid in "${pids[@]}"; do
    if [ "$pid" != "$$" ] && is_owned_desktop_process "$pid"; then
      echo "[$(timestamp)] Closing stale Hapa Avatar Builder desktop process $pid"
      kill -TERM "$pid" >/dev/null 2>&1 || true
    fi
  done

  local remaining
  for _ in {1..24}; do
    remaining=0
    for pid in "${pids[@]}"; do
      if is_owned_desktop_process "$pid"; then
        remaining=1
        break
      fi
    done
    if [ "$remaining" = "0" ]; then
      if is_listening "$OPERATOR_CONSOLE_PORT"; then
        echo "[$(timestamp)] Optional operator-console port $OPERATOR_CONSOLE_PORT remains occupied by another process; the Builder UI will continue without it"
      fi
      return
    fi
    sleep 0.25
  done

  for pid in "${pids[@]}"; do
    if is_owned_desktop_process "$pid"; then
      echo "[$(timestamp)] Force-stopping unresponsive Hapa Avatar Builder desktop process $pid"
      kill -KILL "$pid" >/dev/null 2>&1 || true
    fi
  done

  for _ in {1..20}; do
    remaining=0
    for pid in "${pids[@]}"; do
      if is_owned_desktop_process "$pid"; then
        remaining=1
        break
      fi
    done
    if [ "$remaining" = "0" ]; then
      return
    fi
    sleep 0.1
  done

  echo "[$(timestamp)] ERROR: an old Hapa Avatar Builder desktop process would not stop"
  exit 1
}

echo "[$(timestamp)] Dedicated Hapa Avatar Builder launcher starting from $APP_ROOT"

cd "$APP_ROOT"
if [ ! -f package.json ]; then
  echo "[$(timestamp)] ERROR: package.json not found in $APP_ROOT"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[$(timestamp)] Installing dependencies"
  npm install
fi

close_existing_desktops

echo "[$(timestamp)] Building production UI"
npm run build

# 8799 is reserved for the optional Electron operator console and must never be
# selected as the Builder UI/API port.
port_candidates=(8797 8795 8796 8798)
if [ -n "${HAPA_AVATAR_DEDICATED_PORT:-}" ]; then
  if [ "$HAPA_AVATAR_DEDICATED_PORT" = "$OPERATOR_CONSOLE_PORT" ]; then
    echo "[$(timestamp)] Ignoring dedicated UI port $HAPA_AVATAR_DEDICATED_PORT because it is reserved for the optional operator console"
  else
    port_candidates=("$HAPA_AVATAR_DEDICATED_PORT" "${port_candidates[@]}")
  fi
fi

selected_port=""
reuse_existing="0"
reuse_desktop_server="${HAPA_AVATAR_REUSE_DESKTOP_SERVER:-0}"

if canonical_launchd_registered; then
  if ! is_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical"; then
    restart_canonical_launchd
    for _ in {1..80}; do
      if is_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical"; then
        break
      fi
      sleep 0.25
    done
  fi
  if is_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical"; then
    selected_port="$CANONICAL_PORT"
    reuse_existing="1"
    echo "[$(timestamp)] Canonical launchd API matches build $EXPECTED_BUILD_SIGNATURE and current Echo delivery sources"
  else
    echo "[$(timestamp)] ERROR: canonical launchd API did not become ready with build $EXPECTED_BUILD_SIGNATURE"
    exit 1
  fi
fi

if [ -z "$selected_port" ]; then
  for port in "${port_candidates[@]}"; do
    if is_hapa_endpoint "$port"; then
      selected_port="$port"
      if [ "$reuse_desktop_server" = "1" ]; then
        reuse_existing="1"
      else
        echo "[$(timestamp)] Rebuilding against existing Hapa UI port $port; restarting server so API routes match the new build"
        stop_listeners_on_port "$port"
        reuse_existing="0"
      fi
      break
    fi
  done
fi

if [ -z "$selected_port" ]; then
  for port in "${port_candidates[@]}"; do
    if ! is_listening "$port"; then
      selected_port="$port"
      break
    fi
  done
fi

if [ -z "$selected_port" ]; then
  echo "[$(timestamp)] ERROR: no dedicated desktop port is available from: ${port_candidates[*]}"
  exit 1
fi

desktop_url="http://127.0.0.1:${selected_port}"
bind_host="${HAPA_AVATAR_BIND_HOST:-127.0.0.1}"
https_port="${HAPA_AVATAR_HTTPS_PORT:-$((selected_port + 1))}"

if [ "$reuse_existing" = "1" ]; then
  echo "[$(timestamp)] Reusing existing Hapa UI on $desktop_url"
else
  server_log="$LOG_DIR/desktop-static-${selected_port}.log"
  pid_file="$LOG_DIR/desktop-static-${selected_port}.pid"
  echo "[$(timestamp)] Starting dedicated static API/UI server on $desktop_url (bind $bind_host, phone https $https_port)"
  HAPA_AVATAR_PROCESS_OWNER="dedicated-launcher-fallback" HAPA_AVATAR_PUBLIC_PORT="$selected_port" HAPA_AVATAR_PUBLIC_HTTPS_PORT="$https_port" node "$APP_ROOT/server/api.mjs" --host "$bind_host" --port "$selected_port" --https-port "$https_port" --static "$APP_ROOT/dist" >> "$server_log" 2>&1 &
  server_pid="$!"
  echo "$server_pid" > "$pid_file"

  for _ in {1..80}; do
    if is_hapa_endpoint "$selected_port"; then
      break
    fi
    if ! kill -0 "$server_pid" >/dev/null 2>&1; then
      echo "[$(timestamp)] ERROR: dedicated server exited before UI became ready. See $server_log"
      exit 1
    fi
    sleep 0.25
  done

  if ! is_hapa_endpoint "$selected_port"; then
    echo "[$(timestamp)] ERROR: timed out waiting for Hapa UI on $desktop_url. See $server_log"
    exit 1
  fi
fi

export HAPA_AVATAR_EXTERNAL_API=1
export HAPA_AVATAR_DESKTOP_URL="$desktop_url"
export HAPA_AVATAR_API_BASE="$desktop_url"
export HAPA_AVATAR_PUBLIC_PORT="$selected_port"
export HAPA_AVATAR_PUBLIC_HTTPS_PORT="$https_port"

echo "[$(timestamp)] Launching Electron desktop shell at $desktop_url"
exec npm run desktop
