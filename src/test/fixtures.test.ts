// Each shader under fixtures/ is checked against its markers:
//   code; // error: 'foo': undeclared identifier
//   code; // error `foo`: 'foo': undeclared identifier    (also checks underlined text)
// Marker alone on its line applies to next code line. No markers - no diagnostics expected
// Each folder under fixtures/ is workspace folder for its files

import { ROOT, Result, diagnose, document } from './vscodeMock';

import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';

const FIXTURES = `${ROOT}/src/test/fixtures`;

const MARKER = /\/\/ (error|warning)(?: `([^`]+)`)?: (.*)$/;

const LANGUAGES: Record<string, string> = {
	'.glsl': 'glsl',
	'.frag': 'glsl',
	'.vert': 'glsl',
	'.comp': 'glsl',
	'.gdshader': 'gdshader',
	'.gdshaderinc': 'gdshader',
};

interface Expected {
	line: number;
	text?: string;
	message: string;
	severity: Result['severity'];
}

function expectedOf(source: string): Expected[] {
	const expected: Expected[] = [];
	let pending: Omit<Expected, 'line'>[] = [];

	source.split('\n').forEach((text, line) => {
		const marker = MARKER.exec(text);
		const comment = /^\s*\/\//.test(text);

		if (marker) {
			const [, severity, underlined, message] = marker;
			const entry = { severity: severity as Result['severity'], message, ...(underlined ? { text: underlined } : {}) };
			if (comment) {
				pending.push(entry);
				return;
			}
			expected.push({ line, ...entry });
		}

		if (!comment && text.trim()) {
			expected.push(...pending.map((entry) => ({ line, ...entry })));
			pending = [];
		}
	});

	return expected;
}

/** Underlined text only compared where the marker gives it */
function comparable(results: Result[], expected: Expected[]): Expected[] {
	return results.map(({ line, text, message, severity }) => {
		const wantsText = expected.some((e) => e.line === line && e.message === message && e.text !== undefined);
		return { line, message, severity, ...(wantsText ? { text } : {}) };
	});
}

function byPosition(a: Expected, b: Expected): number {
	return a.line - b.line || a.message.localeCompare(b.message);
}

function shaderFiles(directory: string): string[] {
	return fs.readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((f) => path.extname(f) in LANGUAGES);
}

for (const workspace of fs.readdirSync(FIXTURES)) {
	const root = `${FIXTURES}/${workspace}`;

	for (const file of shaderFiles(root)) {
		test(`${workspace}/${file}`, async () => {
			const source = fs.readFileSync(`${root}/${file}`, 'utf8');
			const shader = document(`${root}/${file}`, source, LANGUAGES[path.extname(file)]);
			const expected = expectedOf(source);

			const [results] = await diagnose([shader], { workspaceFolder: root });

			assert.deepEqual(comparable(results, expected).sort(byPosition), expected.sort(byPosition));
		});
	}
}
