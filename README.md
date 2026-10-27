# GLSL for VS Code

GLSL, GLSL ES and GDShader support. No language server or insert coin needed.

- Syntax highlighting (grammar from [vscode-shader](https://github.com/stef-levesque/vscode-shader))
- Hover docs for built-in functions and variables
- Completion: built-ins, keywords, types, your own functions/variables
- Signature help
- Outline, go to symbol
- Go to definition, also for built-ins (opens a read-only declarations file)
- Errors and warnings from [glslang](https://github.com/KhronosGroup/glslang) (bundled as WebAssembly), `#include` resolved

No formatting or rename.

## Diagnostics

Each GLSL file is checked as one shader stage, from:

1. `glsl.diagnostics.stages` setting, e.g. `{"**/*_vs.glsl": "vertex"}`
2. `#pragma shader_stage(vertex)`
3. Extension: `.vert`, `.frag.glsl` etc.
4. Otherwise fragment

Godot RD shaders (`#[vertex]`, `#[fragment]`, `#[compute]` sections) are checked per section as Vulkan GLSL.
Other files switch to Vulkan GLSL when they use `layout(set = ...)`, `push_constant` etc.

`#include "..."` is relative to the including file, `res://` to the Godot project root.
Includes never resolve outside the workspace folder (or the file's own folder when none is open), symlinks included,
and not at all in Restricted Mode.
Files with neither `#version` nor `main` are treated as includes and only checked through files that include them.
Turn off with `glsl.diagnostics.enable`.

`.gdshader` files are checked as GLSL too: Godot-only syntax (`shader_type`, `render_mode`, uniform hints, `varying` etc.)
is ignored and Godot's built-ins are declared for the file's `shader_type`. Projects on the Compatibility renderer
are checked as GLSL ES 3.0, others as GLSL 460. Not a replacement for Godot's own checker:

- Built-ins aren't tied to their processing function (`ALBEDO` in `vertex()` isn't flagged)
- Outside Compatibility, implicit `int` to `float` (`float x = 1;`) isn't flagged, though Godot rejects it
- Messages read like GLSL, not Godot

`.gdshaderinc` files are checked through the shaders that include them.

## Files

- GLSL: `.glsl` `.vert` `.frag` `.geom` `.tesc` `.tese` `.comp` `.mesh` `.task`, ray tracing (`.rgen` etc.),
  `.vs` `.fs` `.gs` `.vsh` `.fsh` `.gsh` `.csh`, includes `.glsl.inc` `.glslinc`
- GLSL ES docs are used when the file has `#version 300 es` (or `#version 100`)
- Godot: `.gdshader` `.gdshaderinc`. Built-ins follow `shader_type` and the processing function you're in.
  Godot Tools registers the same language id; with both installed their grammars compete.

## Documentation sources

Built-in docs are generated from these. Modified by 1hue (glsl-vscode), 2026: converted to JSON/Markdown,
markup simplified. Per-file details in `REUSE.toml`.

- [Khronos GLSL specification source](https://github.com/KhronosGroup/GLSL),
  Copyright 2008-2026 The Khronos Group Inc.,
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Used for GLSL and GLSL ES.
- [Godot documentation](https://github.com/godotengine/godot-docs),
  Copyright 2014-present Juan Linietsky, Ariel Manzur and the Godot community,
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
  Its function descriptions are adapted from the
  [Khronos OpenGL reference pages](https://registry.khronos.org/OpenGL-Refpages/gl4/),
  Copyright © 2010-2014 Khronos Group, distributed subject to the terms and conditions set forth in the
  [Open Publication License, v 1.0](https://opencontent.org/openpub/), 8 June 1999.

Pinned commits are in `package.json` under `config`.

glslang is BSD and others (`glslang-wasm/dist/LICENSE.glslang.txt`), built with Emscripten (MIT). See [glslang-wasm](https://github.com/1hue/glslang-wasm).
GLSL extension specs (ray tracing built-ins etc.) aren't openly licensed - no docs for them here.

## Building

Clone with `--recurse-submodules` (`glslang-wasm/` is a submodule). Needs Node.js, or podman:

```sh
./scripts/build.sh                 # in a container, writes build/*.vsix
npm ci && npm run package          # same, with local Node
code --install-extension build/glsl-vscode-*.vsix --force
```

Regenerate docs after changing a commit in `package.json` `config`:

```sh
npm run gen:defs
```

Development: `npm install`, then F5 in VS Code (compiles first). Tests: `npm test`.
