#!/bin/sh
# Run tests in Node container, see setup.sh
set -eu
cd "$(dirname "$0")/.."

podman run --rm --pull=newer --network=none --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	npm test
