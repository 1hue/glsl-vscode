// Fragment shader for WebGL2 and its uniform controls

import type { Diagnostic, Glslang } from 'glslang-wasm' with { 'resolution-mode': 'import' };
import { ES_PRECISION, blank, gdshaderToGlsl, shaderTypeOf } from '#src/diagnostics/gdshader';
import type { Definitions } from '#src/language/types';
import { isVulkan } from '#src/language/vulkan';
import type { Control, Shader, Value, WebGLVersion } from '#src/webview/protocol';

export type WebGLResult = Shader | { errors: string };

const VERSION = /^[ \t]*#[ \t]*version[ \t]+(\d+)[^\n]*/m;
export const INCLUDE = /^[ \t]*#[ \t]*include[ \t]+"([^"]+)"[^\n]*/gm;

// Preview-set uniforms
const BUILTINS = new Set([
	'time',
	'u_time',
	'resolution',
	'u_resolution',
	'mouse',
	'u_mouse',
	'frame',
	'u_frame',
	'modelMatrix',
	'viewMatrix',
	'projectionMatrix',
	'modelViewMatrix',
	'normalMatrix',
	'cameraPosition',
	'lightPosition',
]);

// e.g. `uniform highp vec3 color`
const UNIFORM = /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(?:\[\s*\d+\s*\])?\s*;/gm;
// Annotated uniforms and block members like `name; // [0, 1] = 0.5`
const COMMENTED = /\b(\w+)\s*(?:\[\s*\d+\s*\])?\s*;[ \t]*\/\/([^\n]*)/g;
const ANNOTATION = /^\s*(?:\[\s*([-+.\deE]+)\s*,\s*([-+.\deE]+)\s*\])?\s*(?:=\s*(.+?))?\s*$/;

export async function toWebGL(glslang: Glslang, source: string): Promise<WebGLResult> {
	const match = VERSION.exec(source);
	const version = match ? Number(match[1]) : 100;
	if (version <= 120) {
		return rewrite(source, '100');
	}
	if (version === 300) {
		return rewrite(source, '300 es');
	}

	const client = isVulkan(source) ? 'vulkan' : 'opengl';
	const { diagnostics, spirv } = await glslang.compile(source, { stage: 'fragment', client, autoMap: true });
	if (!spirv) {
		return { errors: format(diagnostics) };
	}
	const result = await glslang.crossCompile(spirv, { version: 300, es: true });
	if (!result.source) {
		return { errors: `Can't run in WebGL2: ${result.error}` };
	}

	const annotations = annotationsOf(source);
	return {
		fragment: result.source.replace(VERSION, ''),
		version: '300 es',
		controls: result.uniforms
			.filter((u) => !BUILTINS.has(u.label))
			.map((u) => control(u.name, u.label, u.type, annotations.get(u.label))),
		builtins: result.uniforms
			.filter((u) => BUILTINS.has(u.label) && u.name !== u.label)
			.map(({ name, label }) => ({ name, label })),
	};
}

const GODOT_CONSTANTS: Record<string, string> = { PI: '3.141592653589793', TAU: '6.283185307179586', E: '2.718281828459045' };

// Godot inputs and output defaults, in assignment order
const GODOT_FRAGMENT: Record<string, [string, string][]> = {
	canvas_item: [
		['UV', 'vUv'],
		['TIME', 'time'],
		['FRAGCOORD', 'gl_FragCoord'],
		['VERTEX', 'gl_FragCoord.xy'],
		['SCREEN_UV', 'gl_FragCoord.xy / resolution'],
		['SCREEN_PIXEL_SIZE', '1.0 / resolution'],
		['COLOR', 'vec4(1.0)'],
	],
	spatial: [
		['UV', 'vUv'],
		['TIME', 'time'],
		['FRAGCOORD', 'gl_FragCoord'],
		['SCREEN_UV', 'gl_FragCoord.xy / resolution'],
		['VERTEX', '(viewMatrix * vec4(vPosition, 1.0)).xyz'],
		['NORMAL', 'normalize(mat3(viewMatrix) * vNormal)'],
		['VIEW', 'normalize(-VERTEX)'],
		['ALBEDO', 'vec3(1.0)'],
		['ALPHA', '1.0'],
		['ROUGHNESS', '1.0'],
		['SPECULAR', '0.5'],
	],
};

/** `includes` nested first, inserted before source */
export function gdshaderToWebGL(source: string, godot: Definitions, includes: string[] = []): WebGLResult {
	const shaderType = shaderTypeOf(source);
	const inputs = shaderType && GODOT_FRAGMENT[shaderType];
	if (!inputs) {
		return { errors: 'Preview runs canvas_item and spatial shaders' };
	}

	const declared = new Set<string>();
	const globals: string[] = [];
	for (const [name, entries] of Object.entries(godot.variables)) {
		const declaration = entries.find((e) => e.shaderType === shaderType)?.decl.replace(/^(in|out|inout)\s+/, '');
		if (!declaration || declaration.includes('[')) {
			continue;
		}
		const [type] = declaration.split(/\s+/);
		declared.add(name);
		globals.push(type.startsWith('sampler') ? `uniform ${declaration};` : `${declaration} = ${GODOT_CONSTANTS[name] ?? `${type}(0)`};`);
	}

	const toGlsl = (text: string) => gdshaderToGlsl(text).replace(INCLUDE, blank);
	const included = includes.map(toGlsl);
	const body = toGlsl(source);

	const prefix = [
		...ES_PRECISION,
		'in vec3 vPosition;',
		'in vec3 vNormal;',
		'in vec2 vUv;',
		'uniform float time;',
		'uniform vec2 resolution;',
		'uniform mat4 viewMatrix;',
		'uniform vec3 lightPosition;',
		'out vec4 fragColor;',
		...globals,
		...included,
	];

	const unshaded = /\brender_mode\b[^;]*\bunshaded\b/.test(source);
	const output =
		shaderType === 'canvas_item'
			? ['fragColor = COLOR;']
			: unshaded
				? ['fragColor = vec4(ALBEDO + EMISSION, ALPHA);']
				: [
						'vec3 light = normalize((viewMatrix * vec4(lightPosition, 1.0)).xyz - VERTEX);',
						'fragColor = vec4(ALBEDO * (0.2 + 0.8 * max(dot(normalize(NORMAL), light), 0.0)) + EMISSION, ALPHA);',
					];
	const main = [
		'void main() {',
		...inputs.filter(([name]) => declared.has(name)).map(([name, value]) => `${name} = ${value};`),
		...(/\bvoid\s+fragment\s*\(\s*\)/.test(source) ? ['fragment();'] : []),
		...output,
		'}',
	];

	const annotations = annotationsOf([...includes, source].join('\n'));
	return {
		fragment: [...prefix, body, ...main].join('\n'),
		version: '300 es',
		lineOffset: prefix.join('\n').split('\n').length + 1,
		controls: [...included, body]
			.flatMap((text) => [...text.matchAll(UNIFORM)])
			.filter(([, , name]) => !BUILTINS.has(name))
			.map(([, type, name]) => control(name, name, type, annotations.get(name))),
		builtins: [],
	};
}

/** three.js adds its own `#version` */
export function withoutVersion(source: string): string {
	return source.replace(VERSION, '');
}

/** Add precision without shifting lines */
function rewrite(source: string, version: WebGLVersion): Shader {
	const prefix = ['precision highp float;', ...(version === '300 es' ? ['precision highp int;'] : [])];
	const body = source.replace(VERSION, '');
	const annotations = annotationsOf(source);

	return {
		fragment: `${prefix.join('\n')}\n${body}`,
		version,
		lineOffset: prefix.length + (version === '300 es' ? 1 : 0),
		controls: [...source.matchAll(UNIFORM)]
			.filter(([, , name]) => !BUILTINS.has(name))
			.map(([, type, name]) => control(name, name, type, annotations.get(name))),
		builtins: [],
	};
}

function control(name: string, label: string, type: string, annotation?: Partial<Control>): Control {
	return { name, label, type, min: 0, max: 1, ...annotation };
}

/** Ranges and defaults from `[min, max] = default` comments */
export function annotationsOf(source: string): Map<string, Partial<Control>> {
	const annotations = new Map<string, Partial<Control>>();
	for (const [, name, comment] of source.matchAll(COMMENTED)) {
		const match = ANNOTATION.exec(comment);
		if (!match || (match[1] === undefined && match[3] === undefined)) {
			continue;
		}
		const [, min, max, value] = match;
		annotations.set(name, {
			...(min !== undefined ? { min: Number(min), max: Number(max) } : {}),
			...(value !== undefined ? { value: parseValue(value) } : {}),
		});
	}
	return annotations;
}

/** Annotation default like `0.5`, `(1, 0.5, 0.2)`, `true` */
function parseValue(text: string): Value {
	if (text === 'true' || text === 'false') {
		return text === 'true';
	}
	const numbers = text.replace(/^\(|\)$/g, '').split(',').map(Number);
	return numbers.length === 1 ? numbers[0] : numbers;
}

/** glslang errors like `ERROR: 0:12:5: message` */
function format(diagnostics: Diagnostic[]): string {
	return diagnostics
		.filter((d) => d.severity === 'error')
		.map((d) => `ERROR: ${[d.source, d.line, d.column].filter((part) => part !== undefined).join(':')}: ${d.message}`)
		.join('\n');
}
