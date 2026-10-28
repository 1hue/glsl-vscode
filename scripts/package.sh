#!/bin/sh
# Build .vsix from within a Node container, see build.sh
set -eu

# Build in copy - keeps node_modules out of project
cp -a /w/. /tmp/src
cd /tmp/src

cp build/reuse.spdx reuse.spdx
npm ci
npm run package

# Fail if runtime dependencies missing from .vsix - diagnostics and preview need them
files=$(npx vsce ls)
for file in node_modules/glslang-wasm/dist/glslang.wasm node_modules/three/build/three.module.js node_modules/three/build/three.core.js node_modules/@vscode/codicons/dist/codicon.ttf; do
	echo "$files" | grep -qx "$file"
done

mkdir -p /w/build
cp build/*.vsix /w/build/
