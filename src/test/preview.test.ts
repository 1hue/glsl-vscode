// Preview source for WebGL2 checked with glslang as ES

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGlslang } from '#src/diagnostics/glslang';
import type { Shader } from '#src/webview/protocol';
import { annotationsOf, toWebGL } from '#src/preview/webgl';

const lines = (...text: string[]) => text.join('\n');

const glslang = loadGlslang();

async function webgl(source: string): Promise<Shader> {
	const result = await toWebGL(await glslang, source);
	assert.ok(!('errors' in result), 'errors' in result ? result.errors : '');
	return result;
}

/** Adds the `#version` three.js would */
async function check({ fragment, version }: Shader) {
	const source = version === '300 es' ? `#version 300 es\n${fragment}` : fragment;
	return (await (await glslang).check(source, { stage: 'fragment' })).diagnostics;
}

test('desktop, Vulkan and ES 3.00 sources become valid ES 3.00', async () => {
	const sources = [
		lines('#version 330 core', 'out vec4 color;', 'uniform float time;', 'void main() { color = vec4(time); }'),
		lines('#version 460', 'layout(location = 0) out vec4 color;', 'uniform float time;', 'void main() { color = vec4(time); }'),
		lines(
			'#version 460',
			'layout(set = 0, binding = 0) uniform Params { vec3 tint; } params;',
			'layout(location = 0) in vec2 vUv;',
			'layout(location = 0) out vec4 color;',
			'void main() { color = vec4(params.tint * vUv.x, 1.0); }',
		),
		lines('#version 300 es', 'out vec4 color;', 'uniform float time;', 'void main() { color = vec4(time); }'),
	];

	for (const source of sources) {
		const result = await webgl(source);

		assert.equal(result.version, '300 es', source);
		assert.deepEqual(await check(result), [], source);
	}
});

test('legacy and versionless sources become valid ES 1.00', async () => {
	const body = 'uniform vec2 resolution; void main() { gl_FragColor = vec4(gl_FragCoord.xy / resolution, 0.0, 1.0); }';

	for (const source of [body, lines('#version 100', body), lines('#version 120', body)]) {
		const result = await webgl(source);

		assert.equal(result.version, '100', source);
		assert.deepEqual(await check(result), [], source);
	}
});

test('lineOffset maps WebGL errors back to original lines', async () => {
	const source = lines('// header comment', '#version 300 es', 'out highp vec4 color;', 'void main() { color = foo; }');
	const result = await webgl(source);

	const [error] = await check(result);

	assert.equal(error.line! - result.lineOffset!, 4);
});

test('errors before WebGL use original lines', async () => {
	const result = await toWebGL(await glslang, lines('#version 460', '', 'void main() { foo; }'));

	assert.ok('errors' in result);
	assert.match(result.errors, /^ERROR: 0:3:\d+: 'foo' : undeclared identifier/);
});

test('controls skip built-ins and keep declared names', async () => {
	const source = lines(
		'#version 460',
		'uniform float time;',
		'uniform vec3 lightPosition;',
		'uniform float roughness; // [0, 2] = 0.5',
		'uniform sampler2D noise;',
		'layout(location = 0) out vec4 color;',
		'void main() { color = texture(noise, vec2(time + roughness)) + vec4(lightPosition, 1.0); }',
	);

	const { controls } = await webgl(source);

	assert.deepEqual(controls, [
		{ name: 'roughness', label: 'roughness', type: 'float', min: 0, max: 2, value: 0.5 },
		{ name: '_noise', label: 'noise', type: 'sampler2D', min: 0, max: 1 },
	]);
});

test('annotations: range, default, both or neither', () => {
	const source = lines(
		'uniform float a; // [0, 10]',
		'uniform float b; //= 0.25',
		'uniform vec3 c; // [-1, 1] = (1, 0.5, 0.2)',
		'uniform bool d; // = true',
		'uniform float e; // time in seconds',
		'	float f;  // [1, 2]=1.5',
	);

	assert.deepEqual(Object.fromEntries(annotationsOf(source)), {
		a: { min: 0, max: 10 },
		b: { value: 0.25 },
		c: { min: -1, max: 1, value: [1, 0.5, 0.2] },
		d: { value: true },
		f: { min: 1, max: 2, value: 1.5 },
	});
});
