# Shortcuts for scripts/ - see CONTRIBUTING.md
.PHONY: build install test setup clean submodule wasm-link wasm-unlink

# VS Code CLI, e.g. make install VSCODE=code
VSCODE ?= codium

build:
	sh scripts/build.sh

install: build
	$(VSCODE) --install-extension build/glsl-vscode-*.vsix --force

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
