// Godot built-ins preamble. Godot shader diagnostics themselves are in fixtures/

import { ROOT } from './vscodeMock';

import * as assert from 'node:assert/strict';
import * as path from 'path';
import { test } from 'node:test';
import { gdshaderPreamble } from '../gdshaderGlsl';
import { Definitions } from '../types';

test('preamble is valid GLSL for every shader type and profile', async () => {
	const godot = require(path.join(ROOT, 'data/godot.json')) as Definitions;
	const glslangWasm = require(path.join(ROOT, 'glslang-wasm/dist')) as typeof import('../../glslang-wasm/dist');
	const glslang = await glslangWasm.createGlslang();
	const shaderTypes = ['spatial', 'canvas_item', 'particles', 'sky', 'fog', 'texture_blit'];

	for (const es of [true, false]) {
		const glsl = require(path.join(ROOT, `data/${es ? 'essl' : 'glsl'}.json`)) as Definitions;
		const glslFunctions = new Set(Object.keys(glsl.functions));

		for (const shaderType of shaderTypes) {
			const preamble = gdshaderPreamble(godot, glslFunctions, shaderType, es);
			const result = await glslang.check(preamble, {
				stage: 'fragment',
				defaultVersion: es ? 300 : 460,
				defaultProfile: es ? 'es' : 'core',
			});

			assert.deepEqual(result.diagnostics, [], `${shaderType} ${es ? 'es' : 'core'}`);
		}
	}
});
