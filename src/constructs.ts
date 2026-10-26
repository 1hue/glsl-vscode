// GLSL keywords, qualifiers, etc., with Khronos spec anchors.

export type Flavor = 'glsl' | 'essl';

export interface Construct {
	names: string[];
	kind: 'statement' | 'qualifier' | 'layout' | 'directive' | 'macro';
	// No docs for basics borrowed from C or that are blatantly obvious
	section?: string;
	only?: Flavor; // Only in desktop GLSL or only in GLSL ES
}

const ESSL_IMAGE_FORMATS = [
	'rgba32f', 'rgba16f', 'r32f', 'rgba8', 'rgba8_snorm',
	'rgba32i', 'rgba16i', 'rgba8i', 'r32i',
	'rgba32ui', 'rgba16ui', 'rgba8ui', 'r32ui',
];

const DESKTOP_IMAGE_FORMATS = [
	'rg32f', 'rg16f', 'r11f_g11f_b10f', 'r16f', 'rgba16', 'rgb10_a2', 'rg16', 'rg8', 'r16', 'r8',
	'rgba16_snorm', 'rg16_snorm', 'rg8_snorm', 'r16_snorm', 'r8_snorm',
	'rg32i', 'rg16i', 'rg8i', 'r16i', 'r8i',
	'rgb10_a2ui', 'rg32ui', 'rg16ui', 'rg8ui', 'r16ui', 'r8ui',
];

const BLEND_EQUATIONS = [
	'multiply', 'screen', 'overlay', 'darken', 'lighten', 'colordodge', 'colorburn', 'hardlight', 'softlight',
	'difference', 'exclusion', 'hsl_hue', 'hsl_saturation', 'hsl_color', 'hsl_luminosity', 'all_equations',
];

export const GLSL_CONSTRUCTS: Construct[] = [
	// Statements
	{ names: ['if', 'else', 'switch', 'case', 'default', 'for', 'while', 'do', 'break', 'continue', 'return'], kind: 'statement' },
	{ names: ['discard'], kind: 'statement', section: 'jumps' },
	{ names: ['true', 'false', 'struct'], kind: 'statement' },

	// Qualifiers
	{ names: ['const', 'in', 'out', 'inout', 'uniform', 'buffer', 'layout'], kind: 'qualifier' },
	{ names: ['shared'], kind: 'qualifier', section: 'shared-variables' },
	{ names: ['patch'], kind: 'qualifier', section: 'storage-qualifiers' },
	{ names: ['attribute', 'varying'], kind: 'qualifier', section: 'storage-qualifiers', only: 'glsl' },
	{ names: ['centroid', 'sample', 'smooth', 'flat'], kind: 'qualifier', section: 'interpolation-qualifiers' },
	{ names: ['noperspective'], kind: 'qualifier', section: 'interpolation-qualifiers', only: 'glsl' },
	{ names: ['highp', 'mediump', 'lowp'], kind: 'qualifier', section: 'precision-qualifiers' },
	{ names: ['precision'], kind: 'qualifier', section: 'default-precision-qualifiers' },
	{ names: ['invariant'], kind: 'qualifier', section: 'the-invariant-qualifier' },
	{ names: ['precise'], kind: 'qualifier', section: 'the-precise-qualifier' },
	{ names: ['coherent', 'volatile', 'restrict', 'readonly', 'writeonly'], kind: 'qualifier', section: 'memory-qualifiers' },
	{ names: ['subroutine'], kind: 'qualifier', section: 'subroutines', only: 'glsl' },

	// Layout qualifier ids
	{
		names: ['shared', 'packed', 'std140', 'std430', 'row_major', 'column_major', 'binding', 'offset', 'align', 'set', 'push_constant'],
		kind: 'layout',
		section: 'uniform-and-shader-storage-block-layout-qualifiers',
	},
	{ names: ['location'], kind: 'layout', section: 'input-layout-qualifiers' },
	{ names: ['component'], kind: 'layout', section: 'input-layout-qualifiers', only: 'glsl' },
	{
		names: ['triangles', 'quads', 'isolines', 'equal_spacing', 'fractional_even_spacing', 'fractional_odd_spacing', 'cw', 'ccw', 'point_mode'],
		kind: 'layout',
		section: 'tessellation-evaluation-inputs',
	},
	{ names: ['points', 'lines', 'lines_adjacency', 'triangles', 'triangles_adjacency', 'invocations'], kind: 'layout', section: 'geometry-shader-inputs' },
	{ names: ['early_fragment_tests'], kind: 'layout', section: 'fragment-shader-inputs' },
	{ names: ['origin_upper_left', 'pixel_center_integer'], kind: 'layout', section: 'fragment-shader-inputs', only: 'glsl' },
	{ names: ['local_size_x', 'local_size_y', 'local_size_z'], kind: 'layout', section: 'compute-shader-inputs' },
	{ names: ['xfb_buffer', 'xfb_stride', 'xfb_offset'], kind: 'layout', section: 'transform-feedback-layout-qualifiers', only: 'glsl' },
	{ names: ['vertices'], kind: 'layout', section: 'tessellation-control-outputs' },
	{ names: ['points', 'line_strip', 'triangle_strip', 'max_vertices'], kind: 'layout', section: 'geometry-outputs' },
	{ names: ['stream'], kind: 'layout', section: 'geometry-outputs', only: 'glsl' },
	{ names: ['index'], kind: 'layout', section: 'output-layout-qualifiers', only: 'glsl' },
	{ names: ['depth_any', 'depth_greater', 'depth_less', 'depth_unchanged'], kind: 'layout', section: 'fragment-outputs', only: 'glsl' },
	{ names: BLEND_EQUATIONS.map((equation) => `blend_support_${equation}`), kind: 'layout', section: 'fragment-outputs', only: 'essl' },
	{ names: ESSL_IMAGE_FORMATS, kind: 'layout', section: 'format-layout-qualifiers' },
	{ names: DESKTOP_IMAGE_FORMATS, kind: 'layout', section: 'format-layout-qualifiers', only: 'glsl' },
	{ names: ['input_attachment_index'], kind: 'layout', section: '_subpass_input_qualifier' },
	{
		names: ['constant_id', 'local_size_x_id', 'local_size_y_id', 'local_size_z_id'],
		kind: 'layout',
		section: 'specialization-constant-qualifier',
	},

	// Preprocessor
	{ names: ['#define', '#undef', '#if', '#ifdef', '#ifndef', '#else', '#elif', '#endif', '#error', '#pragma', '#line'], kind: 'directive' },
	{ names: ['#extension'], kind: 'directive', section: 'preprocessor' },
	{ names: ['#version'], kind: 'directive', section: 'preprocessor', only: 'glsl' },
	{ names: ['#version'], kind: 'directive', section: 'version-declaration', only: 'essl' },
	{ names: ['__LINE__', '__FILE__', '__VERSION__'], kind: 'macro', section: 'preprocessor' },
	{ names: ['GL_ES'], kind: 'macro', section: 'preprocessor', only: 'essl' },
	{ names: ['GL_core_profile', 'GL_compatibility_profile', 'GL_es_profile'], kind: 'macro', section: 'preprocessor', only: 'glsl' },
];

export function constructsFor(flavor: Flavor): Construct[] {
	return GLSL_CONSTRUCTS.filter((construct) => !construct.only || construct.only === flavor);
}
