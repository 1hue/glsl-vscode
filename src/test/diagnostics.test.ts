// Include confinement: needs symlinks and paths outside the workspace, so built at runtime.
// Everything else is in fixtures/

import { diagnose, document, fixture } from './vscodeMock';

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

const lines = (...text: string[]) => text.join('\n');

const UNRESOLVED = /Could not process include directive/;

test('includes never resolve outside the workspace folder', async () => {
	const outer = fixture({
		'project.godot': '',
		'secret.glsl': 'float secret() { return 1.0; }',
		'ws/inner.glsl': 'float inner() { return 1.0; }',
	});
	const workspace = path.join(outer, 'ws');
	fs.symlinkSync(path.join(outer, 'secret.glsl'), path.join(workspace, 'link.glsl'));

	const main = document(
		path.join(workspace, 'a.frag'),
		lines(
			'#version 450',
			'#include "inner.glsl"',
			'#include "../secret.glsl"',
			`#include "${path.join(outer, 'secret.glsl')}"`,
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
		path.join(root, 'a.frag'),
		lines('#version 450', '#include "inner.glsl"', 'void main() {}'),
	);

	const [results] = await diagnose([main], { workspaceFolder: root, trusted: false });

	assert.equal(results.length, 1);
	assert.equal(results[0].line, 1);
	assert.match(results[0].message, UNRESOLVED);
});
