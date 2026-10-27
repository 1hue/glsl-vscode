#!/bin/sh
# Install dependencies and audit them in Node container
set -eu
cd "$(dirname "$0")/.."

podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	sh -c 'npm ci && npm audit --audit-level=moderate'
