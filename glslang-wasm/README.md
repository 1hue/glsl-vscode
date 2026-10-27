# glslang-wasm

[glslang](https://github.com/KhronosGroup/glslang) parser compiled to WebAssembly. Checks one shader stage at a time and returns diagnostics. No linking, no SPIR-V output. Runs in Node, browsers and workers.

```js
const { createGlslang } = require('glslang-wasm');

const glslang = await createGlslang();
const { diagnostics } = await glslang.check(source, { stage: 'fragment' });
// [{ severity: 'error', source: '0', line: 2, column: 15, message: "'foo' : undeclared identifier" }]
```

Options:

- `stage`: `vertex`, `fragment`, `compute`, etc.
- `client`: `none` (default), `opengl` or `vulkan`. `vulkan` for Vulkan GLSL (`set`, push constants, etc.)
- `defaultVersion`, `defaultProfile`: used without `#version`
- `name`: source name in diagnostics, passed as `includer` to `include`
- `include(header, { includer, system, depth })`: resolves `#include`, returns `{ name, source }` or nothing. Synchronous. Enables `GL_GOOGLE_include_directive`, no `#extension` line needed

Diagnostics inside includes have `source` set to the include's `name`.

If a check crashes (stack overflow on very deep expressions) it rejects and the next call gets a fresh instance.

## Build

```sh
npm run build
```

Runs `scripts/compile.sh` in the `emscripten/emsdk` container. glslang tag and commit are pinned in `scripts/compile.sh`.

## License

Wrapper MIT. `dist/glslang.wasm` contains glslang (`dist/LICENSE.glslang.txt`) and Emscripten's runtime (`dist/LICENSE.emscripten.txt`, `dist/LICENSE.musl.txt`).
