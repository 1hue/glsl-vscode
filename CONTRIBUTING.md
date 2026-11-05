# Development

Needs podman only. `make` runs on your machine, while all actual work happens insde a node container.

```sh
make setup # then F5 in VS Code
```

Or without the F5 hot reload:

```sh
make install # build and install into codium
make install VSCODE=code # or regular VS Code
make build # build/*.vsix only
```

Other commands:

```sh
make test
make format # Prettier
make audit # fix vulnerable deps
make web # preview in browser at localhost:8080, no VS Code
make web FILE=examples/rim.gdshader
```

`make web` takes VS Code's theme from `assets/web.css` - to update, copy the `<html>` style of the WebView preview in VSCode Developer Tools.

## Local `glslang-wasm`

The [`glslang-wasm`](.gitmodules) submodule isn't cloned by default and can replace the npm package.

```sh
make submodule # clone or reset to pinned commit
make wasm-link # use it in node_modules
make wasm-unlink # back to npm package
```

`make build` always uses the npm package.

## Docs

Built-in docs come from [GLSL spec](https://github.com/KhronosGroup/GLSL) and [Godot docs](https://github.com/godotengine/godot-docs), as submodules under `vendor/`.

Dependabot runs weekly and opens PR, with `data/*.json` regenerated via [defs.yml](.github/workflows/defs.yml).

To update manually, check out another commit in the submodule and run `make defs`.
