// GLSL keywords and qualifiers with Khronos spec anchors

export type Flavor = 'glsl' | 'essl';

export type QualifierGroup =
	| 'storage'
	| 'auxiliary'
	| 'interpolation'
	| 'precision'
	| 'invariant'
	| 'precise'
	| 'memory'
	| 'layout'
	| 'declaration'; // Own declaration: `precision highp float;`, `subroutine ...`

export interface Construct {
	names: string[];
	kind: 'statement' | 'qualifier' | 'layout' | 'directive' | 'macro';
	// No docs for C basics and obvious keywords
	section?: string;
	only?: Flavor; // Only in desktop GLSL or only in GLSL ES
	group?: QualifierGroup; // Qualifiers
	stages?: string[]; // Layout ids specific to these stages
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
	{ names: ['const', 'in', 'out', 'inout', 'uniform', 'buffer'], kind: 'qualifier', group: 'storage' },
	{ names: ['shared'], kind: 'qualifier', group: 'storage', section: 'shared-variables' },
	{ names: ['attribute', 'varying'], kind: 'qualifier', group: 'storage', section: 'storage-qualifiers', only: 'glsl' },
	{ names: ['patch'], kind: 'qualifier', group: 'auxiliary', section: 'storage-qualifiers' },
	{ names: ['centroid', 'sample'], kind: 'qualifier', group: 'auxiliary', section: 'interpolation-qualifiers' },
	{ names: ['smooth', 'flat'], kind: 'qualifier', group: 'interpolation', section: 'interpolation-qualifiers' },
	{ names: ['noperspective'], kind: 'qualifier', group: 'interpolation', section: 'interpolation-qualifiers', only: 'glsl' },
	{ names: ['highp', 'mediump', 'lowp'], kind: 'qualifier', group: 'precision', section: 'precision-qualifiers' },
	{ names: ['invariant'], kind: 'qualifier', group: 'invariant', section: 'the-invariant-qualifier' },
	{ names: ['precise'], kind: 'qualifier', group: 'precise', section: 'the-precise-qualifier' },
	{ names: ['coherent', 'volatile', 'restrict', 'readonly', 'writeonly'], kind: 'qualifier', group: 'memory', section: 'memory-qualifiers' },
	{ names: ['layout'], kind: 'qualifier', group: 'layout' },
	{ names: ['precision'], kind: 'qualifier', group: 'declaration', section: 'default-precision-qualifiers' },
	{ names: ['subroutine'], kind: 'qualifier', group: 'declaration', section: 'subroutines', only: 'glsl' },

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
		stages: ['tessellation evaluation'],
	},
	{
		names: ['points', 'lines', 'lines_adjacency', 'triangles', 'triangles_adjacency', 'invocations'],
		kind: 'layout',
		section: 'geometry-shader-inputs',
		stages: ['geometry'],
	},
	{ names: ['early_fragment_tests'], kind: 'layout', section: 'fragment-shader-inputs', stages: ['fragment'] },
	{ names: ['origin_upper_left', 'pixel_center_integer'], kind: 'layout', section: 'fragment-shader-inputs', only: 'glsl', stages: ['fragment'] },
	{ names: ['local_size_x', 'local_size_y', 'local_size_z'], kind: 'layout', section: 'compute-shader-inputs', stages: ['compute', 'mesh', 'task'] },
	{
		names: ['xfb_buffer', 'xfb_stride', 'xfb_offset'],
		kind: 'layout',
		section: 'transform-feedback-layout-qualifiers',
		only: 'glsl',
		stages: ['vertex', 'tessellation evaluation', 'geometry'],
	},
	{ names: ['vertices'], kind: 'layout', section: 'tessellation-control-outputs', stages: ['tessellation control'] },
	{ names: ['points', 'line_strip', 'triangle_strip', 'max_vertices'], kind: 'layout', section: 'geometry-outputs', stages: ['geometry'] },
	{ names: ['stream'], kind: 'layout', section: 'geometry-outputs', only: 'glsl', stages: ['geometry'] },
	{ names: ['index'], kind: 'layout', section: 'output-layout-qualifiers', only: 'glsl', stages: ['fragment'] },
	{
		names: ['depth_any', 'depth_greater', 'depth_less', 'depth_unchanged'],
		kind: 'layout',
		section: 'fragment-outputs',
		only: 'glsl',
		stages: ['fragment'],
	},
	{
		names: BLEND_EQUATIONS.map((e) => `blend_support_${e}`),
		kind: 'layout',
		section: 'fragment-outputs',
		only: 'essl',
		stages: ['fragment'],
	},
	{ names: ESSL_IMAGE_FORMATS, kind: 'layout', section: 'format-layout-qualifiers' },
	{ names: DESKTOP_IMAGE_FORMATS, kind: 'layout', section: 'format-layout-qualifiers', only: 'glsl' },
	{ names: ['input_attachment_index'], kind: 'layout', section: '_subpass_input_qualifier', stages: ['fragment'] },
	{ names: ['constant_id'], kind: 'layout', section: 'specialization-constant-qualifier' },
	{
		names: ['local_size_x_id', 'local_size_y_id', 'local_size_z_id'],
		kind: 'layout',
		section: 'specialization-constant-qualifier',
		stages: ['compute', 'mesh', 'task'],
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

// Groups allowed with each storage qualifier, per spec storage/interpolation/memory sections
export const STORAGE_COMPANIONS: Record<string, QualifierGroup[]> = {
	const: ['precision', 'precise'],
	in: ['auxiliary', 'interpolation', 'precision', 'precise', 'layout'],
	out: ['auxiliary', 'interpolation', 'precision', 'invariant', 'precise', 'layout'],
	inout: ['precision', 'precise', 'memory'],
	uniform: ['precision', 'memory', 'layout'],
	buffer: ['precision', 'memory', 'layout'],
	shared: ['precision'],
	attribute: ['precision'],
	varying: ['interpolation', 'precision', 'invariant'],
};

export type DeclarationScope = 'global' | 'member' | 'parameter' | 'local';

// Qualifier groups and storage allowed per declaration scope
export const SCOPE_QUALIFIERS: Record<DeclarationScope, { groups: QualifierGroup[]; storage: string[] }> = {
	global: {
		groups: ['storage', 'auxiliary', 'interpolation', 'precision', 'invariant', 'precise', 'memory', 'layout', 'declaration'],
		storage: ['const', 'in', 'out', 'uniform', 'buffer', 'shared', 'attribute', 'varying'],
	},
	member: {
		groups: ['auxiliary', 'interpolation', 'precision', 'invariant', 'precise', 'memory', 'layout'],
		storage: [],
	},
	parameter: {
		groups: ['storage', 'precision', 'precise', 'memory'],
		storage: ['const', 'in', 'out', 'inout'],
	},
	local: {
		groups: ['storage', 'precision', 'precise', 'declaration'],
		storage: ['const'],
	},
};

export function constructsFor(flavor: Flavor): Construct[] {
	return GLSL_CONSTRUCTS.filter((c) => !c.only || c.only === flavor);
}

/** Qualifiers that can follow `present` at `scope` */
export function nextQualifiers(flavor: Flavor, scope: DeclarationScope, present: string[]): string[] {
	const qualifiers = constructsFor(flavor).filter((c) => c.kind === 'qualifier');
	const groupOf = new Map(qualifiers.flatMap((c) => c.names.map((n) => [n, c.group!] as const)));

	const presentGroups = present.map((n) => groupOf.get(n));
	const { groups, storage } = SCOPE_QUALIFIERS[scope];

	// Storage qualifier decides the rest, else only storage fitting what's there
	const storageNow = present.find((n) => groupOf.get(n) === 'storage');
	const storageOptions = storage.filter((name) =>
		presentGroups.every((group) => !group || group === 'storage' || STORAGE_COMPANIONS[name]?.includes(group)),
	);

	const fits = (group: QualifierGroup) => {
		if (!groups.includes(group)) {
			return false;
		}
		if (group === 'declaration') {
			return present.length === 0;
		}
		if (group === 'storage') {
			return !storageNow;
		}
		if (presentGroups.includes(group) && group !== 'memory') {
			return false;
		}
		if (storageNow) {
			return STORAGE_COMPANIONS[storageNow]?.includes(group) ?? false;
		}
		return !storage.length || storageOptions.some((s) => STORAGE_COMPANIONS[s]?.includes(group));
	};

	return qualifiers
		.filter((c) => fits(c.group!))
		.flatMap((c) => c.names)
		.filter((n) => !present.includes(n) && (groupOf.get(n) !== 'storage' || storageOptions.includes(n)));
}
