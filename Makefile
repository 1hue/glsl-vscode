# Development commands in containers
.PHONY: build install compile test format setup sh clean clean-npm submodule wasm-link wasm-unlink vendor defs

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
RUN = podman run --rm -i $(TTY) -e TERM --userns=keep-id -e HOME=/tmp
# No network
RUN_OFFLINE = $(RUN) --network=none
# Images with project mount
NODE_IMAGE = docker.io/library/node:latest
NODE = -v .:/app:z -w /app $(NODE_IMAGE)

# VS Code CLI
VSCODE ?= codium

build:
	sh scripts/build.sh

install: build
	$(VSCODE) --install-extension build/glsl-vscode-*.vsix --force

compile: node_modules/.package-lock.json
	$(RUN_OFFLINE) $(NODE) npm run compile

test: node_modules/.package-lock.json
	$(RUN_OFFLINE) $(NODE) npm test

# Format TS, JS, JSON and CSS
format: node_modules/.package-lock.json
	$(RUN_OFFLINE) $(NODE) node_modules/.bin/prettier --write .

# Update image, drop wasm-link, install deps and audit
setup:
	podman pull $(NODE_IMAGE)
	test ! -L node_modules/glslang-wasm || rm node_modules/glslang-wasm
	$(RUN) $(NODE) sh -c 'npm ci && npm audit --audit-level=moderate'

# Install deps when lockfile changes
node_modules/.package-lock.json: package-lock.json
	$(MAKE) setup

# Shell into container with Debian colours
sh:
	$(RUN) $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf out build/*.vsix build/reuse.spdx

clean-npm: clean
	rm -rf node_modules

# Clone or reset to pinned commit
submodule:
	git submodule update --init vendor/glslang-wasm

# Use submodule instead of npm package, build if needed
wasm-link: node_modules/.package-lock.json
	test -f vendor/glslang-wasm/dist/index.js || $(MAKE) -C vendor/glslang-wasm build
	rm -rf node_modules/glslang-wasm
	ln -s ../vendor/glslang-wasm node_modules/glslang-wasm

# Switch back to npm package
wasm-unlink: setup

# Check out doc submodules
vendor:
	sh scripts/vendor.sh

# Regenerate data/*.json from doc submodules
defs: vendor node_modules/.package-lock.json
	$(RUN_OFFLINE) $(NODE) npm run gen:defs
