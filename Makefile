# Development commands, run in containers - see CONTRIBUTING.md
.PHONY: build install compile test setup sh clean submodule wasm-link wasm-unlink

# Colors when run in terminal
TTY := $(shell [ -t 0 ] && echo -t)
# Container with project at /w, image follows
RUN = podman run --rm $(TTY) --pull=newer --userns=keep-id -e HOME=/tmp -v .:/w:Z -w /w
NODE = docker.io/library/node:latest

# VS Code CLI, e.g. make install VSCODE=code
VSCODE ?= codium

build:
	sh scripts/build.sh

install: build
	$(VSCODE) --install-extension build/glsl-vscode-*.vsix --force

compile: | node_modules
	$(RUN) --network=none $(NODE) npm run compile

test: | node_modules
	$(RUN) --network=none $(NODE) npm test

# Install deps and audit
setup:
	$(RUN) $(NODE) sh -c 'npm ci && npm audit --audit-level=moderate'

# Install deps when missing, keep wasm-link
node_modules:
	$(MAKE) setup

# Shell into container, colored ls and prompt
sh:
	$(RUN) -i -e TERM $(NODE) bash --rcfile /etc/skel/.bashrc

clean:
	rm -rf out build/*.vsix build/reuse.spdx

# Clone or reset to pinned commit
submodule:
	git submodule update --init glslang-wasm

# Submodule instead of npm package, built if needed
wasm-link: | node_modules
	test -f glslang-wasm/dist/index.js || $(MAKE) -C glslang-wasm build
	rm -rf node_modules/glslang-wasm
	ln -s ../glslang-wasm node_modules/glslang-wasm

# Back to npm package
wasm-unlink: setup
