// Generate data/*.json from doc sources pinned in tools/sources.json
// Usage: node out/tools/gen-defs.js [--pin] [source...]
// --pin: record file hashes instead of checking them, after changing a commit

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gdshaderGrammar } from './grammars/gdshader';
import { Source, SourceConfig } from './sources/common';
import { godot } from './sources/godot';
import { khronos } from './sources/khronos';

// Compiled to out/tools/: project root two levels up
const root = path.join(__dirname, '..', '..');
const SOURCES_FILE = path.join(root, 'tools', 'sources.json');

// Keys match tools/sources.json
const SOURCES: Record<string, Source> = {
	glslSpec: khronos,
	godotDocs: godot,
};

async function main() {
	const config: Record<string, SourceConfig> = JSON.parse(await fs.readFile(SOURCES_FILE, 'utf8'));

	const args = process.argv.slice(2);
	const pin = args.includes('--pin');
	const requested = args.filter((arg) => arg !== '--pin');
	const names = requested.length ? requested : Object.keys(SOURCES);

	for (const name of names) {
		const source = SOURCES[name];
		const sourceConfig = config[name];
		if (!source || !sourceConfig) {
			throw new Error(`Unknown source '${name}'`);
		}
		if (pin) {
			sourceConfig.files = {};
		}

		const outputs = await source.generate(sourceConfig, (file) => readPinned(sourceConfig, file, pin));

		for (const [file, data] of Object.entries(outputs)) {
			await writeJson(path.join('data', `${file}.json`), data);
		}

		if (outputs.godot) {
			await writeJson(path.join('syntaxes', 'gdshader.tmLanguage.json'), gdshaderGrammar(outputs.godot));
		}
	}

	if (pin) {
		await writeJson(path.relative(root, SOURCES_FILE), config);
	}
}

/** File at pinned commit. Hash recorded with `pin`, else checked */
async function readPinned(config: SourceConfig, file: string, pin: boolean): Promise<string> {
	const url = `https://raw.githubusercontent.com/${config.repo}/${config.commit}/${file}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: ${response.status} ${response.statusText}`);
	}
	const text = await response.text();
	const hash = createHash('sha256').update(text).digest('hex');

	if (pin) {
		config.files[file] = hash;
	} else if (config.files[file] !== hash) {
		throw new Error(`${url}: hash ${hash} doesn't match tools/sources.json - run with --pin after changing commit`);
	}
	return text;
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
