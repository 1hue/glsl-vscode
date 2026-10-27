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

The [glslang-wasm](glslang-wasm) git submodule isn't cloned by default - replaces the npm package.

```sh
make submodule # clone or reset to pinned commit
make wasm-link # build if needed, use submodule for tests and F5
make wasm-unlink # back to npm package
```

> [!NOTE]
> `make build` always uses the npm package.

## Docs

Regenerate after changing a commit in `package.json` `config`: `npm run gen:defs`.
