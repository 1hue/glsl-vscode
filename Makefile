# Development commands in containers
.PHONY: build install compile test format setup sh clean submodule wasm-link wasm-unlink vendor defs

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
RUN = podman run --rm -i $(TTY) -e TERM --pull=newer --userns=keep-id -e HOME=/tmp
# No network
RUN_OFFLINE = $(RUN) --network=none
# Images with project mount
NODE = -v .:/app:Z -w /app docker.io/library/node:latest

# VS Code CLI
VSCODE ?= codium

build:
	sh scripts/build.sh

install: build
	$(VSCODE) --install-extension build/glsl-vscode-*.vsix --force

compile: | node_modules
	$(RUN_OFFLINE) $(NODE) npm run compile

test: | node_modules
	$(RUN_OFFLINE) $(NODE) npm test

# Format TS, JS, JSON and CSS
format: | node_modules
	$(RUN_OFFLINE) $(NODE) npx prettier --write .

# Install deps and audit
setup:
	$(RUN) $(NODE) sh -c 'npm ci && npm audit --audit-level=moderate'

# Install deps when missing, keep wasm-link
node_modules:
	$(MAKE) setup

# Shell into container with colored ls and prompt
sh:
	$(RUN) $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf out build/*.vsix build/reuse.spdx

# Clone or reset to pinned commit
submodule:
	git submodule update --init vendor/glslang-wasm

# Use submodule instead of npm package, build if needed
wasm-link: | node_modules
	test -f vendor/glslang-wasm/dist/index.js || $(MAKE) -C vendor/glslang-wasm build
	rm -rf node_modules/glslang-wasm
	ln -s ../vendor/glslang-wasm node_modules/glslang-wasm

# Switch back to npm package
wasm-unlink: setup

# Check out doc submodules
vendor:
	sh scripts/vendor.sh

# Regenerate data/*.json from doc submodules
defs: vendor | node_modules
	$(RUN_OFFLINE) $(NODE) npm run gen:defs
