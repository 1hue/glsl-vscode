# GLSL for VS Code

GLSL, GLSL ES and Godot shader support. No language server needed.

- Syntax highlighting (grammar from [vscode-shader](https://github.com/stef-levesque/vscode-shader))
- Hover docs for built-in functions and variables
- Completion: built-ins, keywords, types, your own functions/variables
- Signature help
- Outline, go to symbol
- Go to definition, also for built-ins (opens a read-only declarations file)

No diagnostics, formatting or rename; those need a real compiler.

## Files

- GLSL: `.glsl` `.vert` `.frag` `.geom` `.tesc` `.tese` `.comp` `.mesh` `.task`, ray tracing (`.rgen` etc.),
  `.vs` `.fs` `.gs` `.vsh` `.fsh` `.gsh` `.csh`, includes `.glsl.inc` `.glslinc`
- GLSL ES docs are used when the file has `#version 300 es` (or `#version 100`)
- Godot: `.gdshader` `.gdshaderinc`. Built-ins follow `shader_type` and the processing function you're in.
  Godot Tools registers the same language id; with both installed their grammars compete.

## Documentation sources

Built-in docs are generated from these. Modified by 1hue (glsl-vscode), 2026: converted to JSON/Markdown,
markup simplified. Full license texts in the `LICENSE-*.md` files.

- [Khronos GLSL specification source](https://github.com/KhronosGroup/GLSL),
  Copyright 2008-2024 The Khronos Group Inc.,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Used for GLSL and GLSL ES.
- [Godot documentation](https://github.com/godotengine/godot-docs),
  Juan Linietsky, Ariel Manzur and the Godot community,
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Its function descriptions are adapted from the
  [Khronos OpenGL reference pages](https://registry.khronos.org/OpenGL-Refpages/gl4/),
  Copyright © 2010-2014 Khronos Group, distributed subject to the terms and conditions set forth in the
  [Open Publication License, v 1.0](https://opencontent.org/openpub/), 8 June 1999.

Pinned commits are in `package.json` under `config`.
GLSL extension specs (ray tracing built-ins etc.) are not openly licensed, so they have no docs here.

## Building

Needs Node.js, or podman:

```sh
./scripts/build.sh                 # in a container, writes build/*.vsix
npm ci && npm run package          # same, with local Node
code --install-extension build/glsl-vscode-*.vsix --force
```

Regenerate docs after changing a commit in `package.json` `config`:

```sh
npm run gen:defs
```

Development: `npm install`, then F5 in VS Code (compiles first).
