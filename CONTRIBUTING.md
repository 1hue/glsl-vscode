# Contributing

## Build

Needs podman only. After cloning:

```sh
make setup # then F5 in VS Code
```

Without F5:

```sh
make install # build and install in VS Code, CODE=codium for VSCodium
# or:
make build # build/*.vsix only
```

> [!TIP]
>
> | Commands | | |
> | --- | --- | --- |
> | `make` | on host | Provides development environment via podman |
> | `package.json` scripts | in container | Actual work: compile, test, package |

## Local `glslang-wasm` as submodule

Instead of the npm package

```sh
make submodule      # clone or reset to pinned commit
make wasm-link      # build if needed, use submodule for tests and F5
make wasm-unlink    # back to npm package
```

`make build` always uses the npm package.

## Docs

Regenerate after changing a commit in `package.json` `config`: `npm run gen:defs`.
