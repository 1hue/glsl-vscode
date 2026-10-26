// Keywords and types for completion. Built-in functions and variables come from data/*.json.

const CONTROL_KEYWORDS = [
	'break', 'continue', 'do', 'for', 'while', 'switch', 'case', 'default',
	'if', 'else', 'return', 'discard', 'true', 'false', 'struct',
];

const GLSL_QUALIFIERS = [
	'const', 'uniform', 'buffer', 'shared', 'attribute', 'varying',
	'in', 'out', 'inout', 'centroid', 'flat', 'smooth', 'noperspective', 'patch', 'sample',
	'invariant', 'precise', 'layout', 'subroutine', 'precision',
	'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
	'lowp', 'mediump', 'highp',
];

const GODOT_KEYWORDS = [
	'shader_type', 'render_mode', 'stencil_mode', 'group_uniforms', 'global', 'instance',
	'uniform', 'varying', 'const', 'in', 'out', 'inout', 'flat', 'smooth', 'lowp', 'mediump', 'highp',
];

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

export const GLSL_KEYWORDS = [...CONTROL_KEYWORDS, ...GLSL_QUALIFIERS];
export const GLSL_TYPES = [...vectorAndMatrixTypes(), ...opaqueTypes()];

export const GDSHADER_KEYWORDS = [...CONTROL_KEYWORDS, ...GODOT_KEYWORDS];

// Godot `shader_type` values
export const GDSHADER_SHADER_TYPES = ['spatial', 'canvas_item', 'particles', 'sky', 'fog', 'texture_blit'];

// Godot processing functions; built-ins are scoped to these.
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
