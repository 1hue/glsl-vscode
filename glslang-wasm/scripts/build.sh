#!/bin/sh
# Runs compile.sh in an Emscripten container
set -eu
cd "$(dirname "$0")/.."

podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/emscripten/emsdk:latest \
	sh scripts/compile.sh
