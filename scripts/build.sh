#!/bin/sh
# Build .vsix in container
set -eu

# Colors when run in terminal
[ -t 0 ] && tty=-t || tty=
run="podman run --rm -i $tty -e TERM --pull=newer --userns=keep-id -e HOME=/tmp"
# Images with project mount
node="-v .:/app:z -w /app docker.io/library/node:latest"
reuse_image="-v .:/data:z docker.io/fsfe/reuse:latest"

# Local reuse if installed, otherwise official container
reuse=reuse
command -v reuse >/dev/null || reuse="$run $reuse_image"

# Check licenses and write reuse.spdx bill of materials
$reuse lint
mkdir -p build
$reuse spdx --output build/reuse.spdx

$run $node sh scripts/package.sh
