#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d node_modules ]; then
  npm install
fi

if [ ! -d dist ]; then
  npm run build
fi

npm run desktop
