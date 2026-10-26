// GLSL and GLSL ES built-ins from the Khronos GLSL specification source (AsciiDoc).

import { Definitions, FetchText, FunctionGroup, Signature, Source, SourceConfig, Variable, parseSignature, tidy } from './common';

type Block =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'source'; lines: string[] }
	| { kind: 'latex'; lines: string[] }
	| { kind: 'table'; rows: string[][]; header: boolean }
	| { kind: 'para'; lines: string[] };

const FILES = {
	functions: 'chapters/builtinfunctions.adoc',
	builtins: 'chapters/builtins.adoc',
	variables: 'chapters/variables.adoc',
	statements: 'chapters/statements.adoc',
	basics: 'chapters/basics.adoc',
};

type Chapter = keyof typeof FILES;

// AsciiDoc conditionals (`ifdef::GLSL[]`) and document attributes per output file
const FLAVORS = {
	glsl: {
		conditional: 'GLSL',
		title: 'OpenGL Shading Language specification',
		attributes: {
			slname: 'OpenGL Shading Language',
			slabbrev: 'GLSL',
			apispec: 'OpenGL Specification',
			apiname: 'OpenGL',
			version: '460',
			minor: '4.60',
			compiletimeerror: 'a compile-time error',
		},
	},
	essl: {
		conditional: 'ESSL',
		title: 'OpenGL ES Shading Language specification',
		attributes: {
			slname: 'OpenGL ES Shading Language',
			slabbrev: 'ESSL',
			apispec: 'OpenGL ES Specification',
			apiname: 'OpenGL ES',
			version: '320',
			minor: '3.20',
			compiletimeerror: 'a compile-time error',
		},
	},
};

interface ProseDoc {
	names: string[];
	target: 'qualifiers' | 'keywords';
	chapter: Chapter;
	// First paragraph of the doc
	start: RegExp;
	// Number of blocks (paragraphs, code, tables) to take
	blocks: number;
}

// Keywords, qualifiers and preprocessor directives described in running prose
const PROSE_DOCS: ProseDoc[] = [
	{ names: ['continue'], target: 'keywords', chapter: 'statements', start: /^The \*continue\* jump/, blocks: 1 },
	{ names: ['break'], target: 'keywords', chapter: 'statements', start: /^The \*break\* jump/, blocks: 1 },
	{ names: ['discard'], target: 'keywords', chapter: 'statements', start: /^The \*discard\* keyword/, blocks: 2 },
	{ names: ['return'], target: 'keywords', chapter: 'statements', start: /^The \*return\* jump/, blocks: 2 },
	{ names: ['subroutine'], target: 'qualifiers', chapter: 'statements', start: /^Subroutines provide/, blocks: 2 },

	{ names: ['layout'], target: 'qualifiers', chapter: 'variables', start: /^Layout qualifiers can appear in several forms/, blocks: 1 },
	{ names: ['invariant'], target: 'qualifiers', chapter: 'variables', start: /^To ensure that a particular output variable is invariant/, blocks: 4 },
	{ names: ['precise'], target: 'qualifiers', chapter: 'variables', start: /^The \*precise\* qualifier ensures/, blocks: 1 },
	{ names: ['precision'], target: 'qualifiers', chapter: 'variables', start: /^The precision statement/, blocks: 3 },
	{ names: ['coherent'], target: 'qualifiers', chapter: 'variables', start: /^Memory accesses to image variables declared using the \*coherent\*/, blocks: 1 },
	{ names: ['volatile'], target: 'qualifiers', chapter: 'variables', start: /^Memory accesses to image variables declared using the \*volatile\*/, blocks: 1 },
	{ names: ['restrict'], target: 'qualifiers', chapter: 'variables', start: /^Memory accesses to image variables declared using the \*restrict\*/, blocks: 1 },
	{ names: ['readonly'], target: 'qualifiers', chapter: 'variables', start: /^Memory accesses to image variables declared using the \*readonly\*/, blocks: 1 },
	{ names: ['writeonly'], target: 'qualifiers', chapter: 'variables', start: /^Memory accesses to image variables declared using the \*writeonly\*/, blocks: 1 },

	{ names: ['#version'], target: 'keywords', chapter: 'basics', start: /^Shaders (should|must) declare the version/, blocks: 5 },
	{ names: ['#extension'], target: 'keywords', chapter: 'basics', start: /^By default, compilers of this language must issue/, blocks: 4 },
	{ names: ['#define', '#undef'], target: 'keywords', chapter: 'basics', start: /^\*#define\* and \*#undef\*/, blocks: 1 },
	{ names: ['#error'], target: 'keywords', chapter: 'basics', start: /^\*#error\* will cause/, blocks: 1 },
	{ names: ['#pragma'], target: 'keywords', chapter: 'basics', start: /^\*#pragma\* allows/, blocks: 1 },
	{ names: ['#line'], target: 'keywords', chapter: 'basics', start: /^\*#line\* must have/, blocks: 3 },
	{ names: ['__LINE__'], target: 'keywords', chapter: 'basics', start: /^\+__LINE__\+ will/, blocks: 1 },
	{ names: ['__FILE__'], target: 'keywords', chapter: 'basics', start: /^\+__FILE__\+ will/, blocks: 1 },
	{ names: ['__VERSION__'], target: 'keywords', chapter: 'basics', start: /^\+__VERSION__\+ will/, blocks: 1 },
	{ names: ['GL_ES'], target: 'keywords', chapter: 'basics', start: /^\+GL_ES\+ will/, blocks: 1 },
	{
		names: ['GL_core_profile', 'GL_compatibility_profile', 'GL_es_profile'],
		target: 'keywords',
		chapter: 'basics',
		start: /^There is a built-in macro definition for each profile/,
		blocks: 6,
	},
];

// Math attributes used in prose, e.g. `{pi}`
const SYMBOLS: Record<string, string> = {
	pi: 'π',
	cdot: '·',
	vert: '|',
	leq: '≤',
	geq: '≥',
	neq: '≠',
	times: '×',
	lambda: 'λ',
	delta: 'δ',
	partial: '∂',
};

export const khronos: Source = { generate };

async function generate(config: SourceConfig, fetchText: FetchText): Promise<Record<string, Definitions>> {
	const base = `https://raw.githubusercontent.com/${config.repo}/${config.commit}`;
	const chapters = Object.keys(FILES) as Chapter[];
	const texts = await Promise.all(chapters.map((chapter) => fetchText(`${base}/${FILES[chapter]}`)));
	const textOf = Object.fromEntries(chapters.map((chapter, index) => [chapter, texts[index]])) as Record<Chapter, string>;

	const outputs: Record<string, Definitions> = {};

	for (const [name, flavor] of Object.entries(FLAVORS)) {
		const attributes = { ...SYMBOLS, ...flavor.attributes };
		const blocksOf = (chapter: Chapter) => tokenize(preprocess(textOf[chapter], flavor.conditional));

		const variableBlocks = blocksOf('variables');
		const { types, qualifiers } = parseTypeTables(variableBlocks, attributes);
		parseLayoutQualifiers(variableBlocks, attributes, qualifiers);

		const keywords: Record<string, string> = {};
		const targets = { qualifiers, keywords };
		const blocksByChapter = { variables: variableBlocks } as Partial<Record<Chapter, Block[]>>;

		for (const prose of PROSE_DOCS) {
			const blocks = (blocksByChapter[prose.chapter] ??= blocksOf(prose.chapter));
			const doc = proseDoc(blocks, prose.start, prose.blocks, attributes);
			for (const keyword of doc ? prose.names : []) {
				addDoc(targets[prose.target], keyword, doc!);
			}
		}

		outputs[name] = {
			source: {
				name: `Khronos ${flavor.title}`,
				url: `https://github.com/${config.repo}/tree/${config.commit}`,
				commit: config.commit,
				copyright: 'Copyright 2008-2026 The Khronos Group Inc.',
				licenses: [{ id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }],
				modified: 'Modified by 1hue (glsl-vscode), 2026: converted from AsciiDoc to JSON and Markdown; markup simplified.',
			},
			functions: parseFunctions(blocksOf('functions'), attributes),
			variables: parseVariables(blocksOf('builtins'), attributes),
			types,
			qualifiers,
			keywords,
		};
	}

	return outputs;
}

/**
 * Resolves `ifdef::X[]` / `ifndef::X[]` / `endif::X[]` blocks
 * and single-line `ifdef::X[text]`.
 */
function preprocess(text: string, conditional: string): string[] {
	const out: string[] = [];
	const active: boolean[] = [];
	const isActive = () => active.every(Boolean);

	for (const line of text.split('\n')) {
		const condition = /^(ifdef|ifndef)::([\w,+]+)\[(.*)\]\s*$/.exec(line);

		if (condition) {
			const [, directive, names, inlineText] = condition;
			const defined = names.split(/[,+]/).includes(conditional);
			const include = directive === 'ifdef' ? defined : !defined;

			if (inlineText) {
				if (include && isActive()) {
					out.push(inlineText);
				}
			} else {
				active.push(include);
			}
			continue;
		}

		if (/^endif::/.test(line)) {
			active.pop();
			continue;
		}

		if (isActive()) {
			out.push(line);
		}
	}

	return out;
}

/** Splits AsciiDoc lines into headings, code blocks, math blocks, tables and paragraphs. */
function tokenize(lines: string[]): Block[] {
	const blocks: Block[] = [];
	let paragraph: string[] = [];
	let tableHasHeader = false;

	const flushParagraph = () => {
		if (paragraph.length) {
			blocks.push({ kind: 'para', lines: paragraph });
		}
		paragraph = [];
	};

	// Lines from `start` up to the closing `fence`
	const collect = (start: number, fence: string) => {
		const body: string[] = [];
		let end = start;
		while (end < lines.length && lines[end] !== fence) {
			body.push(lines[end++]);
		}
		return { body, end };
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const heading = /^(=+)\s+(.*)$/.exec(line);

		// `--` delimits an open block, which only groups content.
		if (!line.trim() || line === '--') {
			flushParagraph();
		} else if (/^\/\//.test(line) || /^\[\[.*\]\]$/.test(line)) {
			// Comment or anchor
		} else if (heading) {
			flushParagraph();
			blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
		} else if ((/^\[source/.test(line) && lines[i + 1] === '----') || line === '----') {
			flushParagraph();
			const { body, end } = collect(line === '----' ? i + 1 : i + 2, '----');
			blocks.push({ kind: 'source', lines: body });
			i = end;
		} else if (/^\[latexmath\]/.test(line) && lines[i + 1] === '++++') {
			flushParagraph();
			const { body, end } = collect(i + 2, '++++');
			blocks.push({ kind: 'latex', lines: body });
			i = end;
		} else if (/^\[(options|cols)=/.test(line)) {
			flushParagraph();
			tableHasHeader = /header/.test(line);
		} else if (/^\|===/.test(line)) {
			flushParagraph();
			const { body, end } = collect(i + 1, line);
			const rows: string[][] = [];

			for (const row of body) {
				if (row.startsWith('|')) {
					rows.push(row.slice(1).split('|').map((cell) => cell.trim()));
				} else if (row.trim() && rows.length) {
					// Cell text continued on the next line, possibly followed by more cells:
					// `  *image2D*   | a handle for accessing a 2D texture`
					const [continued, ...moreCells] = row.split('|').map((cell) => cell.trim());
					const last = rows[rows.length - 1];
					const cell = last[last.length - 1];
					// ` +` ends a line inside a cell.
					last[last.length - 1] = cell.endsWith(' +') ? `${cell.slice(0, -2)}<br>${continued}` : `${cell} ${continued}`.trim();
					last.push(...moreCells);
				}
			}

			blocks.push({ kind: 'table', rows: expandRowSpans(rows), header: tableHasHeader });
			tableHasHeader = false;
			i = end;
		} else {
			paragraph.push(line);
		}
	}

	flushParagraph();
	return blocks;
}

/**
 * Copies cells spanning several rows into the rows below.
 * The span is written before the cell's `|`, so it ends the previous cell: `| X  .5+| *uniform*`.
 */
function expandRowSpans(rows: string[][]): string[][] {
	const spans: { text: string; remaining: number }[] = [];

	return rows.map((cells) => {
		const parsed: { text: string; span: number }[] = [];
		let nextSpan = 1;

		for (const cell of cells) {
			const spec = /^(.*?)\s*\.(\d+)\+$/s.exec(cell);
			parsed.push({ text: spec ? spec[1] : cell, span: nextSpan });
			nextSpan = spec ? Number(spec[2]) : 1;
		}

		const row: string[] = [];
		while (parsed.length || spans[row.length]?.remaining) {
			const spanned = spans[row.length];

			if (spanned?.remaining) {
				row.push(spanned.text);
				spanned.remaining--;
				continue;
			}

			const cell = parsed.shift()!;
			spans[row.length] = { text: cell.text, remaining: cell.span - 1 };
			row.push(cell.text);
		}

		return row;
	});
}

function blockToMarkdown(block: Block, attributes: Record<string, string>): string {
	switch (block.kind) {
		case 'source':
			return '```glsl\n' + block.lines.join('\n') + '\n```';

		case 'latex':
			return '```\n' + block.lines.join('\n').trim() + '\n```';

		case 'table': {
			const row = (cells: string[]) => '| ' + cells.map((cell) => inline(cell, attributes)).join(' | ') + ' |';
			const columns = block.rows[0].length;
			const separator = '|' + ' --- |'.repeat(columns);
			const emptyHeader = '|' + '   |'.repeat(columns);

			const rows = block.rows.map(row);
			if (block.header) {
				return [rows[0], separator, ...rows.slice(1)].join('\n');
			}
			return [emptyHeader, separator, ...rows].join('\n');
		}

		case 'para': {
			// Wrapped lines are joined; list items keep their own line.
			const lines: string[] = [];
			for (const raw of block.lines) {
				const line = raw.replace(/^\s*\*\*\s+/, '  - ').replace(/^\s*\*\s+/, '- ');
				const startsItem = /^\s*- /.test(line);

				if (startsItem || !lines.length) {
					lines.push(startsItem ? line.trimEnd() : line.trim());
				} else {
					lines[lines.length - 1] += ' ' + line.trim();
				}
			}

			const isNote = /^NOTE:\s*/.test(lines[0] ?? '');
			if (isNote) {
				lines[0] = lines[0].replace(/^NOTE:\s*/, '');
			}

			const markdown = inline(lines.join('\n'), attributes);
			return isNote ? `**Note:** ${markdown}` : markdown;
		}

		default:
			return '';
	}
}

/** AsciiDoc inline markup to Markdown. */
function inline(text: string, attributes: Record<string, string>): string {
	// Code spans are set aside so emphasis rules don't touch them.
	const codeSpans: string[] = [];
	const protect = (code: string) => `\u0000${codeSpans.push(code) - 1}\u0000`;
	const restore = (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, index) => codeSpans[Number(index)]);

	// Inside code and equations: drop emphasis, keep sub/superscripts readable.
	const plain = (s: string) =>
		s
			.replace(/\*([^*]+)\*/g, '$1')
			.replace(/(^|[^\w])_([^_]+?)_(?!\w)/g, '$1$2')
			.replace(/~([^~]+)~/g, '_$1')
			.replace(/\^([^^]+)\^/g, '^$1')
			.replace(/\s*\n\s*/g, ' ');

	const markdown = text
		.replace(/\{(\w+)\}/g, (match, name) => attributes[name] ?? match)
		.replace(/"`(.*?)`"/g, '“$1”')
		.replace(/latexmath:\[(.*?)\]/g, (_, math) => protect('`' + math + '`'))
		.replace(/\[eq\]#([\s\S]*?)#/g, (_, math) => protect('`' + plain(math) + '`'))
		.replace(/`([^`]+)`/g, (_, code) => protect('`' + plain(code) + '`'))
		// Passthrough, e.g. `+__LINE__+`
		.replace(/(^|[^\w+])\+(\S(?:[^+\n]*?\S)?)\+(?![\w+])/gm, (_, before, code) => before + protect('`' + code + '`'))
		.replace(/<<[^,>]+,([^>]+)>>/g, '$1')
		.replace(/<<([^>]+)>>/g, (_, anchor: string) => anchor.replace(/-/g, ' '))
		.replace(/\*\*\*/g, () => protect('`*`'))
		.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, (_, name) => protect('`' + plain(name) + '`'))
		// The spec uses _x_ for parameter names and *x* for types, functions and keywords: both become code.
		.replace(/(^|[^\w\\])_(?=\S)(.*?\S)_(?!\w)/gm, (_, before, name) => before + protect('`' + plain(name) + '`'))
		.replace(/(^|[^\w*\\])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/gm, (_, before, name) => before + protect('`' + plain(name) + '`'))
		.replace(/~([^~\s]+)~/g, '_$1')
		.replace(/\^([^^\s]+)\^/g, '^$1')
		.replace(/\\(?=[<*_])/g, '');

	return restore(markdown);
}

/**
 * Basic types (`| Type | Meaning` tables) and qualifiers (`| ... Qualifier | Meaning`).
 * A qualifier listed in several tables (e.g. `in` as storage and parameter qualifier) keeps every meaning.
 */
function parseTypeTables(blocks: Block[], attributes: Record<string, string>) {
	const types: Record<string, string> = {};
	const qualifiers: Record<string, string> = {};

	for (const block of blocks) {
		if (block.kind !== 'table' || !block.rows.length) {
			continue;
		}

		// Some tables lack the header option, so go by the first row.
		const [first, second] = block.rows[0];
		const target = second !== 'Meaning' ? undefined : first === 'Type' ? types : /Qualifier$/.test(first) ? qualifiers : undefined;
		if (!target) {
			continue;
		}

		for (const [nameCell, meaning = ''] of block.rows.slice(1)) {
			const doc = inline(meaning, attributes);

			for (const [, name] of nameCell.matchAll(/\*(\w+)\*/g)) {
				if (doc) {
					addDoc(target, name, doc);
				}
			}
		}
	}

	return { types, qualifiers };
}

/** Adds a doc, keeping docs added earlier for the same name. */
function addDoc(target: Record<string, string>, name: string, doc: string) {
	if (!target[name]) {
		target[name] = doc;
	} else if (!target[name].includes(doc)) {
		target[name] = `${target[name]}\n\n${doc}`;
	}
}

/**
 * Layout qualifier identifiers (`std430`, `binding`, `local_size_x`, image formats) from the summary table,
 * each with the first paragraph of the chapter that introduces it, e.g. "The *binding* qualifier specifies ...".
 */
function parseLayoutQualifiers(blocks: Block[], attributes: Record<string, string>, qualifiers: Record<string, string>) {
	const start = blocks.findIndex((block) => block.kind === 'heading' && block.text === 'Layout Qualifiers');
	const end = blocks.findIndex((block) => block.kind === 'heading' && block.text === 'Interpolation Qualifiers');
	if (start < 0 || end < start) {
		return;
	}
	const chapter = blocks.slice(start, end);

	const introductions: Record<string, string> = {};
	for (const block of chapter) {
		if (block.kind !== 'para') {
			continue;
		}

		// "The *a*, *b*, and *c* qualifiers ..." or "*a* specifies ..."
		const subjects = /^(?:The )?((?:\*\w+\*(?:,? and |,? or |, )?)+)\s/.exec(block.lines.join(' '));
		for (const [, name] of subjects?.[1].matchAll(/\*(\w+)\*/g) ?? []) {
			introductions[name] ??= blockToMarkdown(block, attributes);
		}
	}

	const table = chapter.find((block) => block.kind === 'table' && block.rows[0]?.[0] === 'Layout Qualifier');
	if (table?.kind !== 'table') {
		return;
	}

	const [header, ...rows] = table.rows;
	const placements = header.slice(1, 5).map((column) => column.toLowerCase());

	// A name can have several rows, e.g. `points` for geometry inputs and outputs.
	const layouts = new Map<string, { takesValue: boolean; uses: string[] }>();

	for (const [nameCell, ...cells] of rows) {
		const names = [...nameCell.matchAll(/\*([\w ]+)\*/g)].flatMap(([, list]) => list.split(/\s+/));

		// `X` marks where the qualifier can be used; other text narrows it, e.g. "opaque types only".
		const usedOn = placements
			.map((placement, index) => {
				const mark = cells[index] ?? '';
				return !mark ? undefined : mark === 'X' ? placement : `${placement} (${inline(mark, attributes)})`;
			})
			.filter(Boolean);
		const interfaces = cells[4] ? inline(cells[4], attributes) : 'any interface';
		const use = `- ${interfaces}: ${usedOn.join(', ')}`;

		for (const name of names) {
			const layout = layouts.get(name) ?? { takesValue: nameCell.includes('='), uses: [] };
			layouts.set(name, layout);
			if (!layout.uses.includes(use)) {
				layout.uses.push(use);
			}
		}
	}

	for (const [name, { takesValue, uses }] of layouts) {
		const usage = `Layout qualifier \`layout(${takesValue ? `${name} = …` : name})\`, used on:\n\n${uses.join('\n')}`;
		addDoc(qualifiers, name, tidy([usage, introductions[name] ?? ''].join('\n\n')));
	}
}

/** `count` blocks starting at the paragraph matching `start`, stopping at the next heading. */
function proseDoc(blocks: Block[], start: RegExp, count: number, attributes: Record<string, string>): string | undefined {
	const index = blocks.findIndex((block) => block.kind === 'para' && start.test(block.lines.join(' ')));
	if (index < 0) {
		return undefined;
	}

	const taken: string[] = [];
	for (const block of blocks.slice(index, index + count)) {
		if (block.kind === 'heading') {
			break;
		}
		taken.push(blockToMarkdown(block, attributes));
	}

	return tidy(taken.join('\n\n'));
}

/**
 * Functions: each prototype block starts a group; the prose, tables and
 * examples that follow (until the next heading or prototype block) are its doc.
 */
function parseFunctions(blocks: Block[], attributes: Record<string, string>): Record<string, FunctionGroup[]> {
	const functions: Record<string, FunctionGroup[]> = {};

	let current: { signatures: Map<string, Signature[]>; doc: string[] } | undefined;

	const finishGroup = () => {
		if (!current) {
			return;
		}

		const doc = tidy(current.doc.join('\n\n'));
		for (const [name, signatures] of current.signatures) {
			(functions[name] ??= []).push({ signatures, doc });
		}
		current = undefined;
	};

	for (const block of blocks) {
		if (block.kind === 'heading') {
			finishGroup();
			continue;
		}

		if (block.kind === 'source') {
			const lines = block.lines.filter((line) => line.trim());
			const parsed = lines.map((line) => parseSignature(line.replace(/\s*\/\/.*$/, '')));
			const isPrototypeBlock = lines.length > 0 && parsed.every(Boolean);

			if (isPrototypeBlock) {
				finishGroup();
				current = { signatures: new Map(), doc: [] };

				for (const signature of parsed) {
					const { name, ...rest } = signature!;
					if (!current.signatures.has(name)) {
						current.signatures.set(name, []);
					}
					current.signatures.get(name)!.push(rest);
				}
				continue;
			}
		}

		current?.doc.push(blockToMarkdown(block, attributes));
	}

	finishGroup();
	return functions;
}

/**
 * Stage for a section heading in the built-in variables chapter.
 * `undefined` keeps the current stage, `false` stops parsing.
 */
function stageFor(heading: string): string | undefined | false {
	if (/redeclaring/i.test(heading)) {
		return false;
	}

	const profile = /compatibility/i.test(heading) ? ' (compatibility profile)' : '';

	if (/constants/i.test(heading)) {
		return 'constant' + profile;
	}
	if (/state/i.test(heading)) {
		return 'uniform' + profile;
	}
	if (/vertex shader built-in inputs/i.test(heading)) {
		return 'vertex' + profile;
	}
	if (/compatibility profile built-in language/i.test(heading)) {
		return 'all stages' + profile;
	}

	const stage = /^(vertex|tessellation control|tessellation evaluation|geometry|fragment|compute|mesh|task) shader/i.exec(heading);
	return stage ? stage[1].toLowerCase() : undefined;
}

/**
 * Variables: declarations come from code blocks; docs are the paragraphs
 * whose first sentence names the variable, plus follow-up paragraphs that
 * name no variable at all.
 */
function parseVariables(blocks: Block[], attributes: Record<string, string>): Record<string, Variable[]> {
	const variables = new Map<string, { stage: string; decl: string; doc: string[] }[]>();

	let stage: string | undefined;
	let describing: string[] = [];

	const declare = (name: string, decl: string) => {
		if (!stage) {
			return;
		}

		const contexts = variables.get(name) ?? [];
		variables.set(name, contexts);

		if (!contexts.some((context) => context.stage === stage)) {
			contexts.push({ stage, decl, doc: [] });
		}
	};

	const attach = (names: string[], markdown: string) => {
		for (const name of names) {
			const context = variables.get(name)?.find((c) => c.stage === stage);
			if (context && !context.doc.includes(markdown)) {
				context.doc.push(markdown);
			}
		}
	};

	for (const block of blocks) {
		if (block.kind === 'heading') {
			const next = stageFor(block.text);
			if (next === false) {
				break;
			}

			if (next !== undefined) {
				stage = next;
			} else if (block.level <= 2) {
				stage = undefined;
			}
			describing = [];
			continue;
		}

		if (!stage) {
			continue;
		}

		if (block.kind === 'source') {
			const declarations = parseDeclarations(block.lines);

			if (declarations.size) {
				for (const [name, decl] of declarations) {
					declare(name, decl);
				}
				describing = [];
			} else {
				// Example code, e.g. how gl_GlobalInvocationID is computed
				attach(describing, blockToMarkdown(block, attributes));
			}
			continue;
		}

		if (block.kind !== 'para') {
			continue;
		}

		// Names appear emphasized as `_gl_Position_`, so `\b` can't be used before `gl_`.
		const builtinName = /(?<![A-Za-z0-9])gl_[A-Za-z0-9]+/g;

		const text = block.lines.join(' ');
		const firstSentence = text.split(/\.\s/)[0];
		const named = [...new Set(firstSentence.match(builtinName) ?? [])];

		if (named.length) {
			describing = named;
		} else if (builtinName.test(text)) {
			describing = [];
		}

		attach(describing, blockToMarkdown(block, attributes));
	}

	const result: Record<string, Variable[]> = {};
	for (const [name, contexts] of variables) {
		result[name] = contexts.map((context) => ({
			stage: context.stage,
			decl: context.decl,
			doc: tidy(context.doc.join('\n\n')),
		}));
	}
	return result;
}

/**
 * Built-in declarations in a code block, e.g. `in vec4 gl_FragCoord;`,
 * members of `out gl_PerVertex { ... } gl_out[];` and `struct gl_DepthRangeParameters`.
 */
function parseDeclarations(lines: string[]): Map<string, string> {
	const found = new Map<string, string>();

	let block: { qualifier: string; name: string; lines: string[] } | undefined;

	for (const line of lines) {
		const open = /^\s*((?:\w+\s+)*?)(\w+)\s*\{\s*$/.exec(line);
		if (open && !block) {
			block = { qualifier: open[1].trim(), name: open[2], lines: [line.trimEnd()] };
			continue;
		}

		if (block) {
			block.lines.push(line.trimEnd());

			const close = /^\s*\}\s*(gl_\w+)?(\s*\[[^\]]*\])?\s*;/.exec(line);
			if (close) {
				const whole = block.lines.join('\n');
				if (block.name.startsWith('gl_')) {
					found.set(block.name, whole);
				}
				if (close[1]) {
					found.set(close[1], whole);
				}
				block = undefined;
				continue;
			}
		}

		const qualifiers = '(?:(?:patch|in|out|const|uniform|flat|centroid|highp|mediump|lowp)\\s+)*';
		const declaration = new RegExp(`^\\s*(${qualifiers})(\\w+)\\s+(gl_\\w+)(\\s*\\[[^\\]]*\\])?\\s*(=\\s*[^;]+)?;`).exec(line);
		if (!declaration) {
			continue;
		}

		const [, ownQualifiers, , name] = declaration;
		const text = line.trim().replace(/\s+\/\//, ' //');

		// Block members inherit the block's in/out unless they repeat it (some ESSL blocks do).
		const hasStorage = /\b(in|out)\b/.test(ownQualifiers);
		const qualified = block && !hasStorage ? `${block.qualifier} ${text}`.trim() : text;
		found.set(name, qualified);
	}

	return found;
}
