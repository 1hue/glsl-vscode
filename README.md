# GLSL for VS Code

GLSL syntax highlighting from [vscode-shader](https://github.com/stef-levesque/vscode-shader)
plus language features through a LSP such as [glsl_analyzer](https://github.com/nolanderc/glsl_analyzer) - expected in PATH.


## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `glsl.languageServer.enabled` | `true` | Start a language server for GLSL files. |
| `glsl.languageServer.path` | `glsl_analyzer` | Executable name (looked up on `PATH`) or absolute path. |
| `glsl.languageServer.args` | `[]` | Arguments passed to the server (must speak LSP over stdio). |
| `glsl.languageServer.env` | `{}` | Extra environment variables for the server. |
| `glsl.trace.server` | `off` | Trace LSP traffic in the "GLSL Language Server" output channel. |

If the server is not found, highlighting still works and a warning is shown.
Changing settings restarts the server; you can also run **GLSL: Restart Language Server**.

## Building

```sh
npm install
npx vsce package          # produces glsl-vscode-<version>.vsix
code --install-extension glsl-vscode-*.vsix
```

Without a local Node.js:

```sh
podman run --rm -v "$PWD":/w:Z -w /w docker.io/library/node:22 \
  sh -c 'npm install && npx vsce package'
```

For development, open this folder in VS Code and press F5 (after `npm install`).
