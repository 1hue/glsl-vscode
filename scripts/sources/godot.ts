// Godot shading language built-ins from the Godot documentation source (reStructuredText).

import { Definitions, FetchText, FunctionGroup, Hint, Source, SourceConfig, Variable, parseParams, tidy } from './common';

const DIRECTORY = 'tutorials/shaders/shader_reference';

// `shader_type` value -> documentation page
const SHADER_TYPES: Record<string, string> = {
	spatial: 'spatial_shader',
	canvas_item: 'canvas_item_shader',
	particles: 'particle_shader',
	sky: 'sky_shader',
	fog: 'fog_shader',
	texture_blit: 'texture_blit_shader',
};

// Section heading -> processing function the built-ins are available in.
// Headings not listed keep the current stage (e.g. "COLOR and TEXTURE" under "Fragment built-ins").
const STAGES: [RegExp, string | undefined][] = [
	[/^built-ins$/i, undefined],
	[/^global built-ins/i, 'global'],
	[/^vertex built-ins/i, 'vertex'],
	[/^fragment built-ins/i, 'fragment'],
	[/^light built-ins/i, 'light'],
	[/^start and process built-ins/i, 'start, process'],
	[/^start built-ins/i, 'start'],
	[/^process (built-ins|functions)/i, 'process'],
	[/^sky built-ins/i, 'sky'],
	[/^fog built-ins/i, 'fog'],
	[/^blit built-ins/i, 'blit'],
	[/^sdf functions/i, undefined],
];

interface GridTable {
	header: string[];
	rows: string[][];
}

export const godot: Source = { generate };

async function generate(config: SourceConfig, fetchText: FetchText): Promise<Record<string, Definitions>> {
	const base = `https://raw.githubusercontent.com/${config.repo}/${config.commit}/${DIRECTORY}`;
	const fetchPage = (page: string) => fetchText(`${base}/${page}.rst`);

	const functionsPage = await fetchPage('shader_functions');
	const languagePage = await fetchPage('shading_language');
	const shaderPages = await Promise.all(
		Object.entries(SHADER_TYPES).map(async ([shaderType, page]) => ({ shaderType, text: await fetchPage(page) })),
	);

	const substitutions = parseSubstitutions(functionsPage);

	const definitions: Required<Definitions> = {
		source: {
			name: 'Godot Engine documentation',
			url: `https://github.com/${config.repo}/tree/${config.commit}/${DIRECTORY}`,
			commit: config.commit,
			copyright:
				'Juan Linietsky, Ariel Manzur and the Godot community. ' +
				'Function descriptions adapted from material Copyright © 2010-2014 Khronos Group, distributed subject to ' +
				'the terms and conditions set forth in the Open Publication License, v 1.0, 8 June 1999',
			licenses: [
				{ id: 'CC-BY-3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
				{ id: 'OPUBL-1.0', url: 'https://opencontent.org/openpub/' },
			],
			modified:
				'Modified by 1hue (glsl-vscode), 2026: converted from reStructuredText to JSON and Markdown; markup simplified. ' +
				'Built-in function descriptions are adapted by Godot from the Khronos OpenGL reference pages ' +
				'(https://registry.khronos.org/OpenGL-Refpages/gl4/).',
		},
		functions: parseFunctions(functionsPage, substitutions),
		variables: {},
		renderModes: {},
		stencilModes: {},
		hints: {},
		types: {},
		qualifiers: {},
	};

	for (const { shaderType, text } of shaderPages) {
		addShaderPage(definitions, shaderType, text, substitutions);
	}

	addLanguagePage(definitions, languagePage, substitutions);

	return { godot: definitions };
}

/** `.. |vec_type| replace:: :abbr:`vec_type (Any of: ...)`` */
function parseSubstitutions(text: string): Record<string, string> {
	const substitutions: Record<string, string> = {};

	for (const match of text.matchAll(/^\.\. \|(\w+)\| replace:: (.*)$/gm)) {
		const [, name, value] = match;
		substitutions[name] = name === 'componentwise' ? '*Component-wise function.*' : inline(value, {});
	}

	return substitutions;
}

/** reStructuredText inline markup to Markdown. */
function inline(text: string, substitutions: Record<string, string>): string {
	const codeSpans: string[] = [];
	const protect = (code: string) => `\u0000${codeSpans.push(code) - 1}\u0000`;
	const restore = (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);

	const markdown = text
		.replace(/``(.+?)``/g, (_, code) => protect('`' + code + '`'))
		.replace(/:math:`([^`]+)`/g, (_, math) => protect('`' + math + '`'))
		.replace(/\|(\w+)\|/g, (match, name) => substitutions[name] ?? match)
		.replace(/:abbr:`(\S+) \([^)]*\)`/g, '$1')
		.replace(/:ref:`([^`<]+?)\s*<[^>]+>`/g, '$1')
		.replace(/:sup:`([^`]+)`/g, '^$1')
		.replace(/:\w+:`([^`]+)`/g, '$1')
		.replace(/`([^`<]+?)\s*<(https?:[^>]+)>`__?/g, '[$1]($2)')
		.replace(/\\ /g, '')
		.replace(/\\(.)/g, '$1');

	return restore(markdown);
}

function indentOf(line: string): number {
	return line.length - line.trimStart().length;
}

/** Lines after `start` indented deeper than `indent`, dedented. Blank lines are kept. */
function indentedBlock(lines: string[], start: number, indent: number): { lines: string[]; end: number } {
	const body: string[] = [];
	let end = start;

	while (end < lines.length && (!lines[end].trim() || indentOf(lines[end]) > indent)) {
		body.push(lines[end]);
		end++;
	}

	const minIndent = Math.min(...body.filter((l) => l.trim()).map(indentOf));
	return { lines: body.map((l) => l.slice(minIndent)), end };
}

/**
 * Function descriptions: one or more signature lines
 * `|vec_type| **mix**\ (\ |vec_type| a, |vec_type| b, float c) :ref:...`
 * followed by an indented body with prose, `:param x:`, `:return:` and directives.
 */
function parseFunctions(text: string, substitutions: Record<string, string>): Record<string, FunctionGroup[]> {
	const functions: Record<string, FunctionGroup[]> = {};
	const lines = text.split('\n');

	const signatureLine = /^(\S.*?)\s*\*\*(\w+)\*\*\\ \((.*)\)\s*(?::ref:.*)?$/;

	let pending: { name: string; returns: string; params: string }[] = [];

	for (let i = 0; i < lines.length; i++) {
		const match = signatureLine.exec(lines[i]);
		if (match) {
			const [, returns, name, params] = match;
			pending.push({ name, returns: inline(returns, substitutions), params: inline(params, substitutions) });
			continue;
		}

		const startsBody = pending.length > 0 && lines[i].trim() && indentOf(lines[i]) > 0;
		if (!startsBody) {
			continue;
		}

		const body = indentedBlock(lines, i, 0);
		const group = parseFunctionBody(body.lines, substitutions);

		for (const name of new Set(pending.map((p) => p.name))) {
			const signatures = pending
				.filter((p) => p.name === name)
				.map((p) => ({ returns: p.returns, params: parseParams(p.params) }));
			(functions[name] ??= []).push({ ...group, signatures });
		}

		pending = [];
		i = body.end - 1;
	}

	return functions;
}

function parseFunctionBody(lines: string[], substitutions: Record<string, string>): Omit<FunctionGroup, 'signatures'> {
	const doc: string[] = [];
	const params: Record<string, string> = {};
	let returns: string | undefined;

	let paragraph: string[] = [];
	const flushParagraph = () => {
		if (paragraph.length) {
			doc.push(inline(paragraph.join('\n'), substitutions));
		}
		paragraph = [];
	};

	// Text on the directive/field line plus its indented continuation
	const content = (i: number, firstLine: string) => {
		const block = indentedBlock(lines, i + 1, indentOf(lines[i]));
		const text = [firstLine, ...block.lines].join('\n').trim();
		return { text: inline(tidy(text), substitutions), end: block.end };
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		const param = /^:param (\w+):\s*(.*)$/.exec(trimmed);
		const returnField = /^:return:\s*(.*)$/.exec(trimmed);
		const admonition = /^\.\. (note|warning)::\s*(.*)$/i.exec(trimmed);
		const codeBlock = /^\.\. code-block::/.test(trimmed);
		const reference = /^https?:\/\/\S+$/.test(trimmed);

		if (!trimmed) {
			flushParagraph();
		} else if (param) {
			flushParagraph();
			const { text, end } = content(i, param[2]);
			params[param[1]] = text;
			i = end - 1;
		} else if (returnField) {
			flushParagraph();
			const { text, end } = content(i, returnField[1]);
			returns = text;
			i = end - 1;
		} else if (admonition) {
			flushParagraph();
			const { text, end } = content(i, admonition[2]);
			const label = admonition[1].toLowerCase() === 'note' ? 'Note' : 'Warning';
			doc.push(`**${label}:** ${text}`);
			i = end - 1;
		} else if (codeBlock) {
			flushParagraph();
			const block = indentedBlock(lines, i + 1, indentOf(line));
			doc.push('```glsl\n' + tidy(block.lines.join('\n')) + '\n```');
			i = block.end - 1;
		} else if (reference) {
			flushParagraph();
			doc.push(`[OpenGL reference page](${trimmed})`);
		} else {
			paragraph.push(trimmed);
		}
	}
	flushParagraph();

	return {
		doc: tidy(doc.join('\n\n')),
		...(Object.keys(params).length ? { params } : {}),
		...(returns ? { returns } : {}),
	};
}

/** Section headings: a text line followed by an underline of one repeated character. */
function isHeading(lines: string[], i: number): boolean {
	const text = lines[i];
	const underline = lines[i + 1] ?? '';
	return (
		text.trim() !== '' &&
		!/^[\s+|.]/.test(text) &&
		/^([=\-~^"'`#*])\1{2,}\s*$/.test(underline) &&
		underline.trim().length >= text.trim().length
	);
}

/** Top-level (unindented) grid tables with the heading they appear under. */
function* gridTables(text: string): Generator<{ heading: string; table: GridTable }> {
	const lines = text.split('\n');
	let heading = '';

	for (let i = 0; i < lines.length; i++) {
		if (isHeading(lines, i)) {
			heading = lines[i].trim();
			i++;
			continue;
		}

		if (!lines[i].startsWith('+-')) {
			continue;
		}

		const tableLines: string[] = [];
		while (i < lines.length && /^[+|]/.test(lines[i])) {
			tableLines.push(lines[i++]);
		}

		yield { heading, table: parseGridTable(tableLines) };
	}
}

function parseGridTable(lines: string[]): GridTable {
	const border = lines[0];
	const columns: number[] = [];
	for (let i = 0; i < border.length; i++) {
		if (border[i] === '+') {
			columns.push(i);
		}
	}

	const cellsOf = (line: string) => {
		const cells: string[] = [];
		for (let c = 0; c < columns.length - 1; c++) {
			cells.push(line.slice(columns[c] + 1, columns[c + 1]).trim());
		}
		return cells;
	};

	let header: string[] = [];
	const rows: string[][] = [];
	let current: string[][] = [];

	const flushRow = () => {
		if (current.length) {
			rows.push(current.map((cell) => tidy(cell.join('\n'))).map((cell) => cell.replace(/\n/g, ' ')));
		}
		current = [];
	};

	for (const line of lines.slice(1)) {
		if (line.startsWith('+=')) {
			flushRow();
			header = rows.pop() ?? [];
			continue;
		}
		if (line.startsWith('+')) {
			flushRow();
			continue;
		}

		const cells = cellsOf(line);

		// Some rows are missing their separator: a new bold name in the first column starts a new row.
		const startsNewEntry = current.length && /\*\*/.test(cells[0]) && current[0].some((l) => /\*\*/.test(l));
		if (startsNewEntry) {
			flushRow();
		}

		if (!current.length) {
			current = cells.map(() => []);
		}
		cells.forEach((cell, c) => cell && current[c].push(cell));
	}
	flushRow();

	return { header, rows };
}

function stageFor(heading: string, current: string | undefined): string | undefined {
	for (const [pattern, stage] of STAGES) {
		if (pattern.test(heading)) {
			return stage;
		}
	}
	return current;
}

/** Built-ins, functions, render modes and stencil modes of one shader type page. */
function addShaderPage(definitions: Required<Definitions>, shaderType: string, text: string, substitutions: Record<string, string>) {
	let stage: string | undefined;
	let lastHeading = '';

	for (const { heading, table } of gridTables(text)) {
		if (heading !== lastHeading) {
			stage = stageFor(heading, stage);
			lastHeading = heading;
		}

		const kind = table.header[0];

		for (const [first, description] of table.rows) {
			const doc = inline(description ?? '', substitutions);

			if (kind === 'Render mode' || kind === 'Stencil mode') {
				const name = /\*\*(\w+)\*\*/.exec(first)?.[1];
				const target = kind === 'Render mode' ? definitions.renderModes : definitions.stencilModes;
				if (name) {
					(target[shaderType] ??= {})[name] = doc;
				}
				continue;
			}

			if (kind !== 'Built-in' && kind !== 'Function') {
				continue;
			}

			const func = /^(.*?)\s*\*\*(\w+)\*\*\s*\((.*)\)$/.exec(first);
			if (func) {
				const [, returns, name, params] = func;
				const group: FunctionGroup = {
					signatures: [{ returns, params: parseParams(params) }],
					doc,
					shaderType,
					...(stage ? { stage } : {}),
				};
				(definitions.functions[name] ??= []).push(group);
				continue;
			}

			const variable = /^(.*?)\s*\*\*(\w+)\*\*(.*)$/.exec(first);
			if (variable) {
				const [, typePart, name, suffix] = variable;
				const entry: Variable = {
					decl: `${typePart} ${name}${suffix}`.trim(),
					doc,
					shaderType,
					...(stage ? { stage } : {}),
				};
				(definitions.variables[name] ??= []).push(entry);
			}
		}
	}
}

/** Data types, interpolation qualifiers and uniform hints. */
function addLanguagePage(definitions: Required<Definitions>, text: string, substitutions: Record<string, string>) {
	for (const { table } of gridTables(text)) {
		const [first, second, third] = table.header;

		if (first === 'Type' && second === 'Description') {
			for (const [type, description] of table.rows) {
				definitions.types[type.replace(/\*/g, '')] = inline(description, substitutions);
			}
		} else if (first === 'Qualifier') {
			for (const [qualifier, description] of table.rows) {
				definitions.qualifiers[qualifier.replace(/\*/g, '')] = inline(description, substitutions);
			}
		} else if (first === 'Type' && second === 'Hint' && third === 'Description') {
			for (const [types, hint, description] of table.rows) {
				const entry = {
					types: types.replace(/\*/g, ''),
					doc: inline(description, substitutions),
				};
				for (const name of expandHint(hint)) {
					const label = hint.includes('(') ? hint : name;
					definitions.hints[name] = { ...entry, label } satisfies Hint;
				}
			}
		}
	}
}

/**
 * `filter[_nearest, _linear][_mipmap][_anisotropic]` -> filter_nearest, filter_linear,
 * filter_nearest_mipmap, ..., filter_linear_mipmap_anisotropic.
 * The first bracket group is a required choice, later groups extend the previous names.
 */
function expandHint(text: string): string[] {
	const match = /^(\w+)((?:\[[^\]]+\])*)/.exec(text);
	if (!match) {
		return [];
	}

	const [, base, bracketPart] = match;
	const groups = [...bracketPart.matchAll(/\[([^\]]+)\]/g)].map((g) => g[1].split(',').map((option) => option.trim()));

	if (!groups.length) {
		return [base];
	}

	let level = groups[0].map((option) => base + option);
	const names = [...level];

	for (const options of groups.slice(1)) {
		level = level.flatMap((name) => options.map((option) => name + option));
		names.push(...level);
	}

	return names;
}
