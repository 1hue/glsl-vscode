// Preview source rewrite, checked with glslang as ES

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGlslang } from '../glslang';
import { toWebGL } from '../previewSource';

const lines = (...text: string[]) => text.join('\n');

async function check(fragment: string) {
	const glslang = await loadGlslang();
	return (await glslang.check(fragment, { stage: 'fragment' })).diagnostics;
}

test('desktop and ES 3.00 sources become valid ES 3.00', async () => {
	const body = lines('out vec4 color;', 'uniform float time;', 'void main() { color = vec4(time); }');

	for (const header of ['#version 330 core', '#version 450', '#version 300 es']) {
		const result = toWebGL(lines(header, body));

		assert.equal(result.version, '300 es', header);
		assert.deepEqual(await check(result.fragment), [], header);
	}
});

test('legacy and versionless sources become valid ES 1.00', async () => {
	const body = 'uniform vec2 resolution; void main() { gl_FragColor = vec4(gl_FragCoord.xy / resolution, 0.0, 1.0); }';

	for (const source of [body, lines('#version 100', body), lines('#version 120', body)]) {
		const result = toWebGL(source);

		assert.equal(result.version, '100', source);
		assert.deepEqual(await check(result.fragment), [], source);
	}
});

test('lineOffset maps errors back to original lines', async () => {
	const source = lines('// header comment', '#version 330', 'out vec4 color;', 'void main() { color = foo; }');
	const result = toWebGL(source);

	const [error] = await check(result.fragment);

	assert.equal(error.line! - result.lineOffset, 4);
});
