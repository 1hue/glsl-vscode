// Include confinement

import { diagnose, document, fixture } from './vscodeMock';

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import { test } from 'node:test';

const lines = (...text: string[]) => text.join('\n');

const UNRESOLVED = /Could not process include directive/;

test('includes never resolve outside the workspace folder', async () => {
	const outer = fixture({
		'project.godot': '',
		'secret.glsl': 'float secret() { return 1.0; }',
		'ws/inner.glsl': 'float inner() { return 1.0; }',
	});
	const workspace = `${outer}/ws`;
	fs.symlinkSync(`${outer}/secret.glsl`, `${workspace}/link.glsl`);

	const main = document(
		`${workspace}/a.frag`,
		lines(
			'#version 450',
			'#include "inner.glsl"',
			'#include "../secret.glsl"',
			`#include "${`${outer}/secret.glsl`}"`,
			'#include "link.glsl"',
			'#include "res://secret.glsl"',
			'void main() {}',
		),
	);

	const [results] = await diagnose([main], { workspaceFolder: workspace });
	const unresolvedLines = results.filter((r) => UNRESOLVED.test(r.message)).map((r) => r.line);

	assert.equal(results.length, 4);
	assert.deepEqual(unresolvedLines, [2, 3, 4, 5]);
});

test('Restricted Mode: includes not resolved at all', async () => {
	const root = fixture({ 'inner.glsl': 'float inner() { return 1.0; }' });
	const main = document(
		`${root}/a.frag`,
		lines('#version 450', '#include "inner.glsl"', 'void main() {}'),
	);

	const [results] = await diagnose([main], { workspaceFolder: root, trusted: false });

	assert.equal(results.length, 1);
	assert.equal(results[0].line, 1);
	assert.match(results[0].message, UNRESOLVED);
});

test('customBuiltins setting declares custom built-ins', async () => {
	const root = fixture({ 'project.godot': '' });
	const shader = document(
		`${root}/a.gdshader`,
		lines(
			'shader_type spatial;',
			'void fragment() {',
			'	ALBEDO = vec3(TRANSMITTANCE_Z) * my_func(VERTEX);',
			'}',
		),
		'gdshader',
	);
	const settings = { customBuiltins: ['float TRANSMITTANCE_Z', 'vec3 my_func(vec3 p);'] };

	const [without] = await diagnose([shader], { workspaceFolder: root });
	const [declared] = await diagnose([shader], { workspaceFolder: root, settings });

	assert.ok(without.some((r) => r.text === 'TRANSMITTANCE_Z'));
	assert.deepEqual(declared, []);
});
