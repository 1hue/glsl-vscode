// Fragment shader rewrite for WebGL2 preview

export type WebGLVersion = '100' | '300 es';

export interface WebGLSource {
	fragment: string;
	version: WebGLVersion;
	/** Lines added before the original source - subtract from WebGL log line numbers */
	lineOffset: number;
}

const VERSION = /^[ \t]*#[ \t]*version[ \t]+(\d+)[^\n]*/m;

/**
 * Swap `#version` for one WebGL2 runs:
 * no `#version` or 100-120 -> ES 1.00, rest -> ES 3.00
 */
export function toWebGL(source: string): WebGLSource {
	const match = VERSION.exec(source);
	const version: WebGLVersion = !match || Number(match[1]) <= 120 ? '100' : '300 es';
	const prefix = [
		`#version ${version}`,
		'precision highp float;',
		...(version === '300 es' ? ['precision highp int;'] : []),
	];
	// Blank `#version` line - keeps original line numbers
	const body = match ? source.replace(VERSION, '') : source;

	return { fragment: `${prefix.join('\n')}\n${body}`, version, lineOffset: prefix.length };
}
