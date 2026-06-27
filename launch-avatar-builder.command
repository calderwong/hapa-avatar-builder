#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

export HAPA_AVATAR_DEDICATED_PORT="${HAPA_AVATAR_DEDICATED_PORT:-8797}"
exec "$SCRIPT_DIR/scripts/launch-desktop-dedicated.zsh"
