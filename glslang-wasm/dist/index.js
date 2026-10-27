// @ts-check
'use strict';

const createModule = require('./glslang.js');

const STAGES = {
	vertex: 0,
	tesscontrol: 1,
	tesseval: 2,
	geometry: 3,
	fragment: 4,
	compute: 5,
	raygen: 6,
	intersect: 7,
	anyhit: 8,
	closesthit: 9,
	miss: 10,
	callable: 11,
	task: 12,
	mesh: 13,
};

const CLIENTS = { none: 0, opengl: 1, vulkan: 2 };

// EProfile bits
const PROFILES = { none: 1, core: 2, compatibility: 4, es: 8 };

/**
 * `ERROR: 0:12:5: 'foo' : undeclared identifier`
 * `WARNING: 0:3: '#extension' : extension not supported: GL_FOO`
 */
const LOCATED = /^(ERROR|WARNING): (.*?):(\d+):(?:(\d+):)? (.*)$/;
const UNLOCATED = /^(ERROR|WARNING): (.*)$/;

/** @param {string} log */
function parseLog(log) {
	/** @type {import('./index').Diagnostic[]} */
	const diagnostics = [];

	for (const line of log.split(/\r?\n/)) {
		const located = LOCATED.exec(line);
		if (located) {
			const [, severity, source, row, column, message] = located;
			diagnostics.push({
				severity: severity === 'ERROR' ? 'error' : 'warning',
				source,
				line: Number(row),
				...(column ? { column: Number(column) } : {}),
				message,
			});
			continue;
		}

		// Totals like `1 compilation errors.  No code generated.`
		if (UNLOCATED.test(line) || !line.trim()) {
			continue;
		}

		const last = diagnostics[diagnostics.length - 1];
		if (last) {
			last.message += `\n${line}`;
		}
	}

	return diagnostics;
}

/** @type {typeof import('./index').createGlslang} */
async function createGlslang(options = {}) {
	const load = async () => {
		const module = await createModule({ wasmBinary: options.wasmBinary, print() {}, printErr() {} });
		if (!module._initialize()) {
			throw new Error('glslang initialization failed');
		}
		return module;
	};

	let ready = load();
	await ready;

	return {
		async check(source, { stage, client = 'none', defaultVersion = 100, defaultProfile = 'none' }) {
			const module = await ready;
			const pointer = module.stringToNewUTF8(source);

			let log;
			try {
				log = module.UTF8ToString(
					module._check(pointer, STAGES[stage], CLIENTS[client], defaultVersion, PROFILES[defaultProfile]),
				);
			} catch (error) {
				// Trap or host stack overflow leaves instance state unwound
				ready = load();
				throw error;
			}

			module._free(pointer);
			return { log, diagnostics: parseLog(log) };
		},

		async dispose() {
			(await ready)._finalize();
		},
	};
}

module.exports = { createGlslang, parseLog };
