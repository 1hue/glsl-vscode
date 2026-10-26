#!/bin/sh
# Builds the .vsix in a container
set -eu
cd "$(dirname "$0")/.."

# License compliance check and SPDX bill of materials (shipped as reuse.spdx)
reuse_steps='
reuse lint
mkdir -p build
reuse spdx --creator-person 1hue --output build/reuse.spdx
'

# Runs inside Node container
build_steps='
# Work on a copy so node_modules never lands in the project
cp -a /w/. /tmp/src
cd /tmp/src

cp build/reuse.spdx reuse.spdx
npm ci
npm run package

mkdir -p /w/build
cp build/*.vsix /w/build/
'

# Local reuse if installed, otherwise in a Python container
if command -v reuse >/dev/null; then
	sh -euc "$reuse_steps"
else
	podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
		docker.io/library/python:latest \
		sh -euc "pip install --quiet --user --no-warn-script-location reuse && export PATH=\$HOME/.local/bin:\$PATH && $reuse_steps"
fi

podman run --rm --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	sh -euc "$build_steps"
