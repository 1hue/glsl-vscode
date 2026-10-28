#!/bin/sh
# Build .vsix in container
set -eu
cd "$(dirname "$0")/.."

# Colors when run in terminal
[ -t 0 ] && tty=-t || tty=

# Local reuse if installed, otherwise official container
reuse=reuse
command -v reuse >/dev/null ||
	reuse="podman run --rm $tty --pull=newer --userns=keep-id -v .:/w:Z -w /w docker.io/fsfe/reuse:latest"

# License compliance check and SPDX bill of materials (shipped as reuse.spdx)
$reuse lint
mkdir -p build
$reuse spdx --output build/reuse.spdx

podman run --rm $tty --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w \
	docker.io/library/node:latest \
	sh scripts/package.sh
