// GLSL and GLSL ES built-ins from the Khronos GLSL specification source (AsciiDoc).

import { Definitions, FetchText, FunctionGroup, Signature, Source, SourceConfig, Variable, parseSignature, tidy } from './common';

type Block =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'source'; lines: string[] }
	| { kind: 'latex'; lines: string[] }
	| { kind: 'table'; rows: string[][]; header: boolean }
	| { kind: 'para'; lines: string[] };

const FILES = ['chapters/builtinfunctions.adoc', 'chapters/builtins.adoc'];

// AsciiDoc conditionals (`ifdef::GLSL[]`) and document attributes per output file
const FLAVORS = {
	glsl: {
		conditional: 'GLSL',
		title: 'OpenGL Shading Language specification',
		attributes: {
			slname: 'OpenGL Shading Language',
			apispec: 'OpenGL Specification',
			apiname: 'OpenGL',
		},
	},
	essl: {
		conditional: 'ESSL',
		title: 'OpenGL ES Shading Language specification',
		attributes: {
			slname: 'OpenGL ES Shading Language',
			apispec: 'OpenGL ES Specification',
			apiname: 'OpenGL ES',
		},
	},
};

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
	const [functionsText, variablesText] = await Promise.all(FILES.map((file) => fetchText(`${base}/${file}`)));

	const outputs: Record<string, Definitions> = {};

	for (const [name, flavor] of Object.entries(FLAVORS)) {
		const attributes = { ...SYMBOLS, ...flavor.attributes };
		const blocksOf = (text: string) => tokenize(preprocess(text, flavor.conditional));

		outputs[name] = {
			source: {
				name: `Khronos ${flavor.title}`,
				url: `https://github.com/${config.repo}/tree/${config.commit}`,
				commit: config.commit,
				copyright: 'Copyright 2008-2024 The Khronos Group Inc.',
				licenses: [{ id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }],
				modified: 'Modified by 1hue (glsl-vscode), 2026: converted from AsciiDoc to JSON and Markdown; markup simplified.',
			},
			functions: parseFunctions(blocksOf(functionsText), attributes),
			variables: parseVariables(blocksOf(variablesText), attributes),
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
			const rows = body
				.filter((row) => row.startsWith('|'))
				.map((row) => row.slice(1).split('|').map((cell) => cell.trim()));
			blocks.push({ kind: 'table', rows, header: tableHasHeader });
			tableHasHeader = false;
			i = end;
		} else {
			paragraph.push(line);
		}
	}

	flushParagraph();
	return blocks;
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
			const lines = block.lines.map((line) =>
				line
					.replace(/^\s*\*\*\s+/, '  - ')
					.replace(/^\s*\*\s+/, '- ')
					.replace(/^NOTE:\s*/, '**Note:** '),
			);
			return inline(lines.join('\n'), attributes);
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
		.replace(/<<[^,>]+,([^>]+)>>/g, '$1')
		.replace(/<<([^>]+)>>/g, (_, anchor: string) => anchor.replace(/-/g, ' '))
		.replace(/\*\*\*/g, () => protect('`*`'))
		.replace(/(^|[^\w*\\])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/gm, '$1**$2**')
		.replace(/(^|[^\w\\])_(?=\S)(.*?\S)_(?!\w)/gm, '$1*$2*')
		.replace(/~([^~\s]+)~/g, '_$1')
		.replace(/\^([^^\s]+)\^/g, '^$1')
		.replace(/\\(?=[<*_])/g, '');

	return restore(markdown);
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
