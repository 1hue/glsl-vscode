#!/bin/sh
# Build .vsix from within a Node container, see build.sh
set -eu

# Build in copy - keeps node_modules out of project
cp -a /w/. /tmp/src
cd /tmp/src

cp build/reuse.spdx reuse.spdx
npm ci
npm run package

mkdir -p /w/build
cp build/*.vsix /w/build/
