// Fragment shader as source WebGL2 runs, plus controls for its own uniforms

import type { Diagnostic, Glslang } from 'glslang-wasm' with { 'resolution-mode': 'import' };
import { isVulkan } from '#src/language/vulkan';
import type { Control, Shader, Value, WebGLVersion } from '#src/webview/protocol';

export type WebGLResult = Shader | { errors: string };

const VERSION = /^[ \t]*#[ \t]*version[ \t]+(\d+)[^\n]*/m;

// Set by the preview, no control
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

// `uniform highp vec3 color;`
const UNIFORM = /^[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*(?:\[\s*\d+\s*\])?\s*;/gm;
// `name; // [0, 1] = 0.5` on uniforms and block members
const COMMENTED = /\b(\w+)\s*(?:\[\s*\d+\s*\])?\s*;[ \t]*\/\/([^\n]*)/g;
const ANNOTATION = /^\s*(?:\[\s*([-+.\deE]+)\s*,\s*([-+.\deE]+)\s*\])?\s*(?:=\s*(.+?))?\s*$/;

/**
 * Versionless, 100-120: text rewrite to ES 1.00
 * `300 es`: as is
 * Rest: glslang -> SPIR-V -> SPIRV-Cross -> ES 3.00
 */
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

/** `#version` line blanked - three.js adds its own */
export function withoutVersion(source: string): string {
	return source.replace(VERSION, '');
}

/** Precision added, `#version` blanked - keeps original line numbers */
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

/** Declared name -> range and default from `// [min, max] = default` */
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

/** `0.5`, `(1, 0.5, 0.2)`, `true` */
function parseValue(text: string): Value {
	if (text === 'true' || text === 'false') {
		return text === 'true';
	}
	const numbers = text.replace(/^\(|\)$/g, '').split(',').map(Number);
	return numbers.length === 1 ? numbers[0] : numbers;
}

/** glslang errors as `ERROR: 0:12:5: message`, lines of original source */
function format(diagnostics: Diagnostic[]): string {
	return diagnostics
		.filter((d) => d.severity === 'error')
		.map((d) => `ERROR: ${[d.source, d.line, d.column].filter((part) => part !== undefined).join(':')}: ${d.message}`)
		.join('\n');
}
