// Godot shader source as GLSL glslang can check. Godot-only syntax blanked with spaces so positions match

import { Definitions } from './types';

// GLSL ES types without default precision; Godot doesn't need it declared
const ES_PRECISION = [
	'float',
	'int',
	'sampler3D',
	'samplerCubeShadow',
	'sampler2DShadow',
	'sampler2DArray',
	'sampler2DArrayShadow',
	'isampler2D',
	'isampler3D',
	'isamplerCube',
	'isampler2DArray',
	'usampler2D',
	'usampler3D',
	'usamplerCube',
	'usampler2DArray',
].map((type) => `precision highp ${type};`);

/** Same length, newlines kept */
export function blank(text: string): string {
	return text.replace(/[^\n]/g, ' ');
}

export function shaderTypeOf(text: string): string | undefined {
	return /\bshader_type\s+(\w+)\s*;/.exec(text)?.[1];
}

export function gdshaderToGlsl(text: string): string {
	return (
		text
			.replace(/\b(shader_type|render_mode|stencil_mode|group_uniforms)\b[^;]*;/g, blank)
			.replace(/\b(global|instance)(?=\s+uniform\b)/g, blank)
			.replace(/\bvarying(\s+(flat|smooth))?\b/g, blank)
			// `uniform float x : hint_range(0, 1) = 0.5;`: hints, and defaults (none in GLSL ES)
			.replace(/(\buniform\b[^;:=]*)([:=][^;]*)/g, (_match, declaration: string, hints: string) => declaration + blank(hints))
	);
}

/** Godot built-ins for shader type, plus Godot-only functions (`texture_sdf` etc.) as prototypes */
export function gdshaderPreamble(godot: Definitions, glslFunctions: Set<string>, shaderType: string, es: boolean): string {
	const lines = es ? [...ES_PRECISION] : [];

	for (const entries of Object.values(godot.variables)) {
		const entry = entries.find((e) => e.shaderType === shaderType);
		if (entry) {
			const declaration = entry.decl.replace(/^(in|out|inout)\s+/, '');
			lines.push(declaration.startsWith('sampler') ? `uniform ${declaration};` : `${declaration};`);
		}
	}

	for (const [name, groups] of Object.entries(godot.functions)) {
		if (glslFunctions.has(name)) {
			continue;
		}
		for (const group of groups.filter((g) => !g.shaderType || g.shaderType === shaderType)) {
			for (const { returns, params } of group.signatures) {
				// Unexpanded generic types (`vec_int_type`, `gsampler2D`)
				if ([returns, ...params.map((p) => p.type)].some((type) => /_type$|^g(sampler|vec)/.test(type))) {
					continue;
				}
				lines.push(`${returns} ${name}(${params.map((p) => `${p.type} ${p.name}`).join(', ')});`);
			}
		}
	}

	return lines.join('\n') + '\n';
}
