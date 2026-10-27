# Contributing

## Build

Needs podman only. After cloning:

```sh
./scripts/setup.sh    # install dependencies
./scripts/test.sh
./scripts/build.sh    # build/*.vsix
code --install-extension build/glsl-vscode-*.vsix --force
```

For development run `setup.sh`, then F5 in VS Code.

With local Node instead: `npm ci`, `npm test`, `npm run package`.

## Docs

Regenerate after changing a commit in `package.json` `config`: `npm run gen:defs`.
