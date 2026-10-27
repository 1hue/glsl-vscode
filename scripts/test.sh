#!/bin/sh
# Run tests in container, install deps first if missing
set -eu
cd "$(dirname "$0")/.."

# Only if missing - setup.sh would undo wasm-link.sh
test -d node_modules || sh scripts/setup.sh

podman run --rm --pull=newer --network=none --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	npm test
