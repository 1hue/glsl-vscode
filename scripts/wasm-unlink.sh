#!/bin/sh
# Back to glslang-wasm npm package - fresh npm ci replaces link
set -eu
cd "$(dirname "$0")/.."

exec sh scripts/setup.sh
