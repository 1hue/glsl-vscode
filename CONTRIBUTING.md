# Development

Needs podman only. `make` runs on the host, while all actual work happens insde a node container.

```sh
make setup # then F5 in VS Code
```

Without F5:

```sh
make install # build and install into codium
make install VSCODE=code # or regular VS Code
make build # build/*.vsix only
```

Other commands:

```sh
make test
make format # Prettier
make web # preview in browser at localhost:8080, no VS Code
make web FILE=examples/rim.gdshader
```

`make web` takes VS Code's theme from `assets/web.css`, copied from a real preview's `<html>` style in Webview Developer Tools.

## Local `glslang-wasm`

The [`glslang-wasm`](.gitmodules) submodule isn't cloned by default and can replace the npm package.

```sh
make submodule # clone or reset to pinned commit
make wasm-link # use it in node_modules
make wasm-unlink # back to npm package
```

`make build` always uses the npm package.

## Docs

Built-in docs come from the GLSL spec and Godot docs, pinned as submodules in `vendor/`. To update, check out another commit there, `git add` it, then `make defs`.
