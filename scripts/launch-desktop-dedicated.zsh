#!/bin/zsh
set -euo pipefail

APP_ROOT="${HAPA_AVATAR_BUILDER_ROOT:-/Users/calderwong/Desktop/hapa-avatar-builder}"
APP_ROOT="$(cd "$APP_ROOT" && pwd -P)"
CANONICAL_LAUNCHD_LABEL="com.hapa.avatarbuilder.8797.codex"
CANONICAL_PORT="8797"
OPERATOR_CONSOLE_PORT="${HAPA_AVATAR_OPERATOR_PORT:-8799}"
LOG_DIR="$APP_ROOT/logs"
LOG_FILE="$LOG_DIR/desktop-dedicated-launcher.log"
ELECTRON_LOG_FILE="$LOG_DIR/desktop-electron.log"
MAX_LOG_BYTES="${HAPA_AVATAR_MAX_DESKTOP_LOG_BYTES:-20971520}"
LAUNCH_LOCK_DIR="$LOG_DIR/.desktop-launch.lock"
LAUNCH_LOCK_HELD="0"
PROBE_TIMEOUT_SECONDS="${HAPA_AVATAR_PROBE_TIMEOUT_SECONDS:-1}"
mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

rotate_log_if_large() {
  local file="$1"
  local size="0"
  if [ ! -f "$file" ]; then
    return
  fi
  size="$(/usr/bin/stat -f '%z' "$file" 2>/dev/null || echo 0)"
  if [ "$size" -lt "$MAX_LOG_BYTES" ]; then
    return
  fi
  local archived="${file%.log}.$(/bin/date '+%Y%m%d-%H%M%S').log"
  /bin/mv "$file" "$archived"
}

rotate_log_if_large "$LOG_FILE"
rotate_log_if_large "$ELECTRON_LOG_FILE"
exec >> "$LOG_FILE" 2>&1

timestamp() {
  date "+%Y-%m-%d %H:%M:%S"
}

release_launch_lock() {
  if [ "$LAUNCH_LOCK_HELD" != "1" ]; then
    return
  fi
  /bin/rm -f "$LAUNCH_LOCK_DIR/owner-pid"
  /bin/rmdir "$LAUNCH_LOCK_DIR" >/dev/null 2>&1 || true
  LAUNCH_LOCK_HELD="0"
}

acquire_launch_lock() {
  local announced="0"
  local owner_pid=""
  for _ in {1..1200}; do
    if /bin/mkdir "$LAUNCH_LOCK_DIR" >/dev/null 2>&1; then
      echo "$$" > "$LAUNCH_LOCK_DIR/owner-pid"
      LAUNCH_LOCK_HELD="1"
      trap release_launch_lock EXIT INT TERM HUP
      return
    fi

    owner_pid="$(<"$LAUNCH_LOCK_DIR/owner-pid" 2>/dev/null || true)"
    if [ -n "$owner_pid" ] && ! kill -0 "$owner_pid" >/dev/null 2>&1; then
      echo "[$(timestamp)] Recovering stale desktop-launch lock left by process $owner_pid"
      /bin/rm -f "$LAUNCH_LOCK_DIR/owner-pid"
      /bin/rmdir "$LAUNCH_LOCK_DIR" >/dev/null 2>&1 || true
      continue
    fi

    if [ "$announced" = "0" ]; then
      echo "[$(timestamp)] Another Avatar Builder launch is preparing; waiting instead of starting a competing build"
      announced="1"
    fi
    sleep 0.25
  done

  echo "[$(timestamp)] ERROR: timed out waiting for the existing Avatar Builder launch preparation"
  exit 1
}

is_hapa_html() {
  local port="$1"
  local payload
  payload="$(curl -fsS --connect-timeout 1 --max-time "$PROBE_TIMEOUT_SECONDS" "http://127.0.0.1:${port}/" 2>/dev/null || true)"
  [[ "$payload" == *"Hapa Avatar Builder"* ]]
}

is_hapa_api() {
  local port="$1"
  local expected_owner="${2:-}"
  local payload
  payload="$(curl -fsS --connect-timeout 1 --max-time "$PROBE_TIMEOUT_SECONDS" "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)"
  [[ "$payload" == *'"service":"hapa-avatar-builder"'* ]] || return 1
  [[ "$payload" == *'"echoDeliveryFreshness":{"ok":true'* ]] || return 1
  if [ -n "$expected_owner" ]; then
    [[ "$payload" == *"\"processOwner\":\"${expected_owner}\""* ]] || return 1
  fi
}

is_hapa_endpoint() {
  local port="$1"
  local expected_owner="${2:-}"
  is_hapa_html "$port" && is_hapa_api "$port" "$expected_owner"
}

wait_for_hapa_endpoint() {
  local port="$1"
  local expected_owner="${2:-}"
  local attempts="${3:-3}"
  local attempt
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    if is_hapa_endpoint "$port" "$expected_owner"; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep 0.5
    fi
  done
  return 1
}

has_current_production_build() {
  [ -f "$APP_ROOT/dist/index.html" ] \
    && [ -d "$APP_ROOT/dist/assets" ] \
    && [ -f "$APP_ROOT/dist/hapa-echo-delivery-build.json" ]
}

focus_existing_desktop() {
  local payload
  payload="$(curl -fsS --connect-timeout 1 --max-time "$PROBE_TIMEOUT_SECONDS" \
    -X POST "http://127.0.0.1:${OPERATOR_CONSOLE_PORT}/v1/focus" 2>/dev/null || true)"
  [[ "$payload" == *'"ok":true'* ]] \
    && [[ "$payload" == *'"service":"hapa-avatar-builder-desktop"'* ]] \
    && [[ "$payload" == *'"action":"focused"'* ]]
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
  if [ "${HAPA_AVATAR_REPLACE_DESKTOP:-0}" != "1" ]; then
    echo "[$(timestamp)] Preserving any existing Avatar Builder window; Electron will focus it on a repeat launch"
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

acquire_launch_lock

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
force_rebuild="${HAPA_AVATAR_FORCE_REBUILD:-0}"

if [ "$force_rebuild" != "1" ] && canonical_launchd_registered && wait_for_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical" 3; then
  selected_port="$CANONICAL_PORT"
  reuse_existing="1"
  echo "[$(timestamp)] Healthy canonical Hapa UI is already ready on port $CANONICAL_PORT; skipping rebuild"
fi

if [ "$force_rebuild" != "1" ] && [ -z "$selected_port" ] && canonical_launchd_registered && is_listening "$CANONICAL_PORT"; then
  selected_port="$CANONICAL_PORT"
  reuse_existing="1"
  echo "[$(timestamp)] Canonical port $CANONICAL_PORT is owned and listening but busy; preserving it and opening the Builder instead of rebuilding or restarting"
fi

if [ -z "$selected_port" ]; then
  close_existing_desktops
  if [ "$force_rebuild" != "1" ] && has_current_production_build; then
    echo "[$(timestamp)] Current production UI already exists; skipping rebuild"
  else
    echo "[$(timestamp)] Preparing production UI because deployable source changed or no certified build exists"
    npm run build
  fi
fi

if [ -z "$selected_port" ] && canonical_launchd_registered; then
  if ! wait_for_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical" 2; then
    restart_canonical_launchd
    for _ in {1..120}; do
      if is_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical"; then
        break
      fi
      sleep 0.5
    done
  fi
  if wait_for_hapa_endpoint "$CANONICAL_PORT" "launchd-canonical" 3; then
    selected_port="$CANONICAL_PORT"
    reuse_existing="1"
    echo "[$(timestamp)] Canonical launchd API is healthy and owns the current certified UI"
  else
    echo "[$(timestamp)] ERROR: canonical launchd API did not become ready"
    exit 1
  fi
fi

if [ -z "$selected_port" ]; then
  for port in "${port_candidates[@]}"; do
    if is_hapa_endpoint "$port"; then
      selected_port="$port"
      reuse_existing="1"
      echo "[$(timestamp)] Reusing matching Hapa UI port $port without stopping its server"
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

if focus_existing_desktop; then
  echo "[$(timestamp)] Focused the existing Hapa Avatar Builder window through its loopback desktop control"
  release_launch_lock
  trap - EXIT INT TERM HUP
  exit 0
fi

echo "[$(timestamp)] Launching Electron desktop shell at $desktop_url"
release_launch_lock
trap - EXIT INT TERM HUP
npm run desktop 2>&1 | /usr/bin/awk '
/GL_INVALID_OPERATION.*mtl_pipeline_cache/ {
  gpu_errors += 1
  if (gpu_errors <= 5) { print; fflush() }
  else if (gpu_errors == 6) { print "[desktop] Repeated Metal pipeline errors suppressed after five samples"; fflush() }
  next
}
{ print; fflush() }
' >> "$ELECTRON_LOG_FILE"
