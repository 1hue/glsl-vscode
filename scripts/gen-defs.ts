// Generates data/*.json from doc sources pinned in package.json `config`.
// Usage: node out/scripts/gen-defs.js [source...]

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gdshaderGrammar } from './grammars/gdshader';
import { Source } from './sources/common';
import { godot } from './sources/godot';
import { khronos } from './sources/khronos';

// Compiled to out/scripts/: project root two levels up
const root = path.join(__dirname, '..', '..');

// Keys match package.json `config`
const SOURCES: Record<string, Source> = {
	glslSpec: khronos,
	godotDocs: godot,
};

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: ${response.status} ${response.statusText}`);
	}
	return response.text();
}

async function main() {
	const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

	const requested = process.argv.slice(2);
	const names = requested.length ? requested : Object.keys(SOURCES);

	for (const name of names) {
		const source = SOURCES[name];
		const config = pkg.config?.[name];
		if (!source || !config) {
			throw new Error(`Unknown source '${name}'`);
		}

		const outputs = await source.generate(config, fetchText);

		for (const [file, data] of Object.entries(outputs)) {
			await writeJson(path.join('data', `${file}.json`), data);
		}

		if (outputs.godot) {
			await writeJson(path.join('syntaxes', 'gdshader.tmLanguage.json'), gdshaderGrammar(outputs.godot));
		}
	}
}

async function writeJson(relativePath: string, data: unknown) {
	const target = path.join(root, relativePath);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, JSON.stringify(data, null, '\t') + '\n');
	console.log(`wrote ${relativePath}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
