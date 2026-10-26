#!/bin/sh
# Builds the .vsix in a container
set -eu
cd "$(dirname "$0")/.."

# Runs inside container
build_steps='
# Work on a copy so node_modules never lands in the project
cp -a /w/. /tmp/src
cd /tmp/src

npm ci
npm run package

mkdir -p /w/build
cp build/*.vsix /w/build/
'

podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	sh -euc "$build_steps"
