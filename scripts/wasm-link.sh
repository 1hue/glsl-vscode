#!/bin/sh
# Use glslang-wasm submodule instead of npm package - undo with wasm-unlink.sh
set -eu
cd "$(dirname "$0")/.."

test -f glslang-wasm/dist/index.js || sh glslang-wasm/scripts/build.sh

rm -rf node_modules/glslang-wasm
ln -s ../glslang-wasm node_modules/glslang-wasm
