// Godot built-ins preamble

import './vscodeMock';

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGlslang } from '#src/diagnostics/glslang';
import { gdshaderPreamble } from '#src/diagnostics/gdshader';
import { Definitions } from '#src/language/types';

test('preamble is valid GLSL for every shader type and profile', async () => {
	const godot = require('#data/godot') as Definitions;
	const glslang = await loadGlslang();
	const shaderTypes = ['spatial', 'canvas_item', 'particles', 'sky', 'fog', 'texture_blit'];

	for (const es of [true, false]) {
		const glsl = require(`#data/${es ? 'essl' : 'glsl'}`) as Definitions;
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

test('preamble declares numbered and undocumented built-ins', () => {
	const godot = require('#data/godot') as Definitions;
	const expected = {
		sky: ['FRAGCOORD', 'LIGHT0_ENABLED', 'LIGHT3_COLOR'],
		particles: ['USERDATA1', 'USERDATA6'],
		spatial: ['EXPOSURE', 'STREAMING_LOD', 'LIGHT_IS_AREA'],
	};

	for (const [shaderType, names] of Object.entries(expected)) {
		const preamble = gdshaderPreamble(godot, new Set(), shaderType, false);
		for (const name of names) {
			assert.match(preamble, new RegExp(`\\b${name};`), `${shaderType} ${name}`);
		}
		assert.doesNotMatch(preamble, /\b(LIGHTX|USERDATAX)\b/, shaderType);
	}
});

test('preamble leaves out removed built-ins', () => {
	const godot = require('#data/godot') as Definitions;
	for (const shaderType of ['spatial', 'canvas_item']) {
		const preamble = gdshaderPreamble(godot, new Set(), shaderType, false);
		assert.doesNotMatch(preamble, /\b(SCREEN_TEXTURE|DEPTH_TEXTURE)\b/, shaderType);
	}
});
