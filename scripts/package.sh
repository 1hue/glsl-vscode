#!/bin/sh
# Builds the .vsix. Runs inside Node container, see build.sh
set -eu

# Work on a copy so node_modules never lands in the project
cp -a /w/. /tmp/src
cd /tmp/src

cp build/reuse.spdx reuse.spdx
npm ci
npm run package

mkdir -p /w/build
cp build/*.vsix /w/build/
