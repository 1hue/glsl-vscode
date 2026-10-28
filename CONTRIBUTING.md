# Contributing

## Build

Needs podman only. After cloning:

```sh
make setup # then F5 in VS Code
```

Without F5:

```sh
# Build and install extension:
make install
make install VSCODE=code # for regular VS Code instead of codium
# Or:
make build # build/*.vsix only
```

> [!NOTE]
> | Commands | | |
> | --- | --- | --- |
> | `make` | on host | Provides development environment via podman |
> | `package.json` scripts | in container | Actual work: compile, test, package |

## Local `glslang-wasm` as submodule

The [glslang-wasm](.gitmodules) git submodule isn't cloned by default - can replace the npm package.

```sh
make submodule # git update submodule
make wasm-link # put it in `node_modules`
make wasm-unlink # back to npm package
```

> [!NOTE]
> `make build` always uses the npm package.

## Docs

Regenerate with `make defs`. To update docs, check out another commit in `vendor/glsl-spec` or `vendor/godot-docs`, `git add` it, then `make defs`.
