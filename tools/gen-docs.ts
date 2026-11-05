// Generate data/*.json from doc submodules in vendor/
// Usage: node out/tools/gen-docs.js [source...]

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { gdshaderGrammar } from './grammars/gdshader';
import { Source, SourceConfig } from './sources/common';
import { godot } from './sources/godot';
import { khronos } from './sources/khronos';

// Keys as per sources.json
const SOURCES: Record<string, Source> = {
	glslSpec: khronos,
	godotDocs: godot,
};

async function main() {
	const config: Record<string, SourceConfig> = JSON.parse(
		await fs.readFile('tools/sources.json', 'utf8'),
	);
	const requested = process.argv.slice(2);
	const names = requested.length ? requested : Object.keys(SOURCES);

	for (const name of names) {
		const source = SOURCES[name];
		const sourceConfig = config[name];
		if (!source || !sourceConfig) {
			throw new Error(`Unknown source '${name}'`);
		}
		const directory = sourceConfig.directory;
		const commit = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
		}).trim();

		const outputs = await source.generate(sourceConfig, commit, (file) =>
			fs.readFile(`${directory}/${file}`, 'utf8'),
		);

		for (const [file, data] of Object.entries(outputs)) {
			await writeJson(`data/${file}.json`, data);
		}

		if (outputs.godot) {
			await writeJson('syntaxes/gdshader.tmLanguage.json', gdshaderGrammar(outputs.godot));
		}
	}
}

async function writeJson(file: string, data: unknown) {
	await fs.writeFile(file, JSON.stringify(data, null, '\t') + '\n');
	console.log(`wrote ${file}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
