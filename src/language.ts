// Keywords and types for completion; built-in functions and variables in data/*.json.

import { Construct, GLSL_CONSTRUCTS } from './constructs';

function namesOf(kinds: Construct['kind'][]): string[] {
	const constructs = GLSL_CONSTRUCTS.filter((c) => kinds.includes(c.kind));
	return [...new Set(constructs.flatMap((c) => c.names))];
}

export const STATEMENT_KEYWORDS = namesOf(['statement']);

export const GDSHADER_QUALIFIERS = [
	'global', 'instance', 'uniform', 'varying', 'const', 'in', 'out', 'inout', 'flat', 'smooth', 'lowp', 'mediump', 'highp',
];

const GODOT_KEYWORDS = ['shader_type', 'render_mode', 'stencil_mode', 'group_uniforms', ...GDSHADER_QUALIFIERS];

function vectorAndMatrixTypes(): string[] {
	const types = ['void', 'bool', 'int', 'uint', 'float', 'double', 'atomic_uint'];

	for (const size of [2, 3, 4]) {
		types.push(`vec${size}`, `dvec${size}`, `bvec${size}`, `ivec${size}`, `uvec${size}`);
		types.push(`mat${size}`, `dmat${size}`);

		for (const rows of [2, 3, 4]) {
			types.push(`mat${size}x${rows}`, `dmat${size}x${rows}`);
		}
	}

	return types;
}

function opaqueTypes(): string[] {
	const dimensions = ['1D', '2D', '3D', 'Cube', '2DRect', '1DArray', '2DArray', 'CubeArray', 'Buffer', '2DMS', '2DMSArray'];
	const shadowDimensions = ['1D', '2D', 'Cube', '2DRect', '1DArray', '2DArray', 'CubeArray'];
	const types = ['sampler', 'samplerShadow'];

	for (const prefix of ['', 'i', 'u']) {
		for (const dimension of dimensions) {
			types.push(`${prefix}sampler${dimension}`, `${prefix}image${dimension}`, `${prefix}texture${dimension}`);
		}
	}

	for (const dimension of shadowDimensions) {
		types.push(`sampler${dimension}Shadow`);
	}

	return types;
}

export const GLSL_KEYWORDS = namesOf(['statement', 'qualifier']);
export const GLSL_QUALIFIERS = namesOf(['qualifier']);
export const GLSL_TYPES = [...vectorAndMatrixTypes(), ...opaqueTypes()];

export const GDSHADER_KEYWORDS = [...STATEMENT_KEYWORDS, ...GODOT_KEYWORDS];

// Godot's preprocessor, with `#include`
export const GDSHADER_DIRECTIVES = ['#define', '#undef', '#if', '#ifdef', '#ifndef', '#elif', '#else', '#endif', '#include', '#pragma', '#error'];

// Godot `shader_type` values
export const GDSHADER_SHADER_TYPES = ['spatial', 'canvas_item', 'particles', 'sky', 'fog', 'texture_blit'];

// Godot processing functions; built-ins scoped to these
export const GDSHADER_STAGE_FUNCTIONS = ['vertex', 'fragment', 'light', 'start', 'process', 'sky', 'fog', 'blit'];

// GLSL stage by file extension
export const STAGE_BY_EXTENSION: Record<string, string> = {
	'.vert': 'vertex',
	'.vs': 'vertex',
	'.vsh': 'vertex',
	'.glslv': 'vertex',
	'.frag': 'fragment',
	'.fs': 'fragment',
	'.fsh': 'fragment',
	'.glslf': 'fragment',
	'.geom': 'geometry',
	'.gs': 'geometry',
	'.gsh': 'geometry',
	'.glslg': 'geometry',
	'.tesc': 'tessellation control',
	'.tese': 'tessellation evaluation',
	'.comp': 'compute',
	'.csh': 'compute',
	'.mesh': 'mesh',
	'.task': 'task',
};
