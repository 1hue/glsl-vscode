# Shortcuts for scripts/ - see CONTRIBUTING.md
.PHONY: build install test setup clean submodule wasm-link wasm-unlink

# Editor CLI, e.g. make install CODE=codium
CODE ?= code

build:
	sh scripts/build.sh

install: build
	$(CODE) --install-extension build/glsl-vscode-*.vsix --force

test:
	sh scripts/test.sh

clean:
	rm -rf out build/*.vsix build/reuse.spdx

setup:
	sh scripts/setup.sh

# Clone or reset to pinned commit
submodule:
	git submodule update --init glslang-wasm

wasm-link:
	sh scripts/wasm-link.sh

wasm-unlink:
	sh scripts/wasm-unlink.sh
