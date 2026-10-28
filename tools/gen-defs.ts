// Generate data/*.json from doc submodules in vendor/ - check out first with `make vendor`
// Usage: node out/tools/gen-defs.js [source...]

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gdshaderGrammar } from './grammars/gdshader';
import { Source, SourceConfig } from './sources/common';
import { godot } from './sources/godot';
import { khronos } from './sources/khronos';

// Compiled to out/tools/: project root two levels up
const root = path.join(__dirname, '..', '..');

// Keys match tools/sources.json
const SOURCES: Record<string, Source> = {
	glslSpec: khronos,
	godotDocs: godot,
};

async function main() {
	const config: Record<string, SourceConfig> = JSON.parse(await fs.readFile(path.join(root, 'tools', 'sources.json'), 'utf8'));
	const requested = process.argv.slice(2);
	const names = requested.length ? requested : Object.keys(SOURCES);

	for (const name of names) {
		const source = SOURCES[name];
		const sourceConfig = config[name];
		if (!source || !sourceConfig) {
			throw new Error(`Unknown source '${name}'`);
		}
		const directory = path.join(root, sourceConfig.directory);
		const commit = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

		const outputs = await source.generate(sourceConfig, commit, (file) => fs.readFile(path.join(directory, file), 'utf8'));

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
