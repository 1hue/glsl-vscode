// glslang-wasm is an ES module - loaded with import(), not require()

import type * as GlslangWasm from 'glslang-wasm' with { 'resolution-mode': 'import' };

export async function loadGlslang(): Promise<GlslangWasm.Glslang> {
	const { createGlslang } = await import('glslang-wasm');
	return createGlslang();
}

let shared: Promise<GlslangWasm.Glslang> | undefined;

/** One instance for diagnostics and preview */
export function sharedGlslang(): Promise<GlslangWasm.Glslang> {
	return (shared ??= loadGlslang());
}
