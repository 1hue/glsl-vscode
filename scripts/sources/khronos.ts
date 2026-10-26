// GLSL and GLSL ES built-ins from the Khronos GLSL specification source (AsciiDoc).

import { AbstractBlock, load } from '@asciidoctor/core';
import { Flavor, constructsFor } from '../../src/constructs';
import { Definitions, FetchText, FunctionGroup, Signature, Source, SourceConfig, Variable, parseSignature, tidy } from './common';

type Block =
	| { kind: 'heading'; level: number; text: string; id?: string }
	| { kind: 'source'; lines: string[] }
	| { kind: 'latex'; lines: string[] }
	| { kind: 'table'; rows: string[][]; header: boolean }
	| { kind: 'para'; lines: string[] }
	// Syntax (`[role="bnf"]`), never shown
	| { kind: 'grammar'; lines: string[] };

// Parts of asciidoctor nodes its type definitions leave out
interface TableNode extends AbstractBlock {
	rows: { head: CellNode[][]; body: CellNode[][] };
}

interface CellNode {
	rowspan: number | null;
	source(): string;
}

interface ItemNode extends AbstractBlock {
	getText(): string | null;
}

interface ListNode extends AbstractBlock {
	getItems(): ItemNode[];
}

// Items are [terms, description] pairs.
interface DescriptionListNode extends AbstractBlock {
	getItems(): [unknown, ItemNode | null][];
}

interface SourceNode extends AbstractBlock {
	getSourceLines(): string[];
}

const FILES = {
	functions: 'chapters/builtinfunctions.adoc',
	builtins: 'chapters/builtins.adoc',
	variables: 'chapters/variables.adoc',
	statements: 'chapters/statements.adoc',
	basics: 'chapters/basics.adoc',
};

type Chapter = keyof typeof FILES;

// AsciiDoc conditionals (`ifdef::GLSL[]`) and document attributes per output file
const FLAVORS: Record<Flavor, { conditional: string; title: string; attributes: Record<string, string> }> = {
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

	const outputs: Record<string, Definitions> = {};

	for (const [name, flavor] of Object.entries(FLAVORS) as [Flavor, (typeof FLAVORS)[Flavor]][]) {
		const attributes = { ...SYMBOLS, ...flavor.attributes };
		const parsed = await Promise.all(texts.map((text) => toBlocks(text, flavor.conditional)));
		const blocksOf = Object.fromEntries(chapters.map((chapter, index) => [chapter, parsed[index]])) as Record<Chapter, Block[]>;

		const { types, qualifiers } = parseTypeTables(blocksOf.variables, attributes);
		const keywords: Record<string, string> = {};
		addConstructDocs(name, parsed.flat(), attributes, { qualifiers, keywords });

		outputs[name] = {
			source: {
				name: `Khronos ${flavor.title}`,
				url: `https://github.com/${config.repo}/tree/${config.commit}`,
				commit: config.commit,
				copyright: 'Copyright 2008-2026 The Khronos Group Inc.',
				licenses: [{ id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }],
				modified: 'Modified by 1hue (glsl-vscode), 2026: converted from AsciiDoc to JSON and Markdown; markup simplified.',
			},
			functions: parseFunctions(blocksOf.functions, attributes),
			variables: parseVariables(blocksOf.builtins, attributes),
			types,
			qualifiers,
			keywords,
		};
	}

	return outputs;
}

/**
 * Parses AsciiDoc and flattens it into headings, code, math, tables and paragraphs in document order.
 * `conditional` selects `ifdef::GLSL[]` or `ifdef::ESSL[]` content.
 */
async function toBlocks(text: string, conditional: string): Promise<Block[]> {
	const document = await load(text, { attributes: { [conditional]: '' } });
	const blocks: Block[] = [];

	const visit = (node: AbstractBlock) => {
		for (const child of node.getBlocks()) {
			switch (child.getContext()) {
				case 'section':
					blocks.push({ kind: 'heading', level: (child.getLevel() ?? 0) + 1, text: child.getTitle() ?? '', id: child.getId() });
					visit(child);
					break;

				case 'paragraph':
					blocks.push({ kind: 'para', lines: (child as SourceNode).getSourceLines() });
					break;

				case 'listing':
				case 'literal':
					blocks.push({ kind: 'source', lines: (child as SourceNode).getSourceLines() });
					break;

				case 'stem':
					blocks.push({ kind: 'latex', lines: (child as SourceNode).getSourceLines() });
					break;

				case 'table':
					blocks.push(tableBlock(child as TableNode));
					break;

				case 'ulist':
				case 'olist':
					blocks.push({ kind: 'para', lines: listLines(child as ListNode, 1) });
					break;

				case 'dlist':
					// `{empty}:: text` lines without a term, as a list; ` +` breaks a line into another item
					blocks.push({
						kind: 'para',
						lines: (child as DescriptionListNode)
							.getItems()
							.flatMap(([, description]) => (description ? rawText(description).split(/\s\+\n/) : []))
							.map((item) => `* ${item.replace(/\s*\n\s*/g, ' ').replace(/\s\+$/, '')}`),
					});
					break;

				case 'admonition': {
					// `NOTE: text` paragraph or `[NOTE]` block
					const start = blocks.length;
					if (child.getBlocks().length) {
						visit(child);
					} else {
						blocks.push({ kind: 'para', lines: (child as SourceNode).getSourceLines() });
					}

					const first = blocks.slice(start).find((block) => block.kind === 'para');
					if (first?.kind === 'para' && child.getStyle() === 'NOTE') {
						first.lines[0] = `NOTE: ${first.lines[0]}`;
					}
					break;
				}

				case 'open':
				case 'example':
				case 'sidebar':
				case 'quote':
					if (child.hasRole('bnf')) {
						blocks.push({ kind: 'grammar', lines: grammarLines(child) });
					} else {
						visit(child);
					}
					break;
			}
		}
	};

	visit(document);
	return blocks;
}

/** Text of a grammar block: `_rule_ : ::` definition lists of `*name* +` lines. */
function grammarLines(node: AbstractBlock): string[] {
	return node.getBlocks().flatMap((child) => {
		if (child.getContext() === 'paragraph') {
			return (child as SourceNode).getSourceLines();
		}
		if (child.getContext() === 'dlist') {
			return (child as DescriptionListNode)
				.getItems()
				.flatMap(([terms, description]) => [...(terms as ItemNode[]), ...(description ? [description] : [])])
				.map(rawText);
		}
		return grammarLines(child);
	});
}

/** A list item's text as written: without substitutions, its markup is left for `inline()`. */
function rawText(item: ItemNode): string {
	for (const substitution of [...item.getSubstitutions()]) {
		item.removeSubstitution(substitution);
	}
	return item.getText() ?? '';
}

/** List items as `* item` lines, nested items as `** item`. */
function listLines(list: ListNode, depth: number): string[] {
	const lines: string[] = [];
	const marker = list.getContext() === 'olist' ? '.'.repeat(depth) : '*'.repeat(depth);

	for (const item of list.getItems()) {
		lines.push(`${marker} ${rawText(item).replace(/\s*\n\s*/g, ' ')}`);
		for (const nested of item.getBlocks()) {
			if (nested.getContext() === 'ulist' || nested.getContext() === 'olist') {
				lines.push(...listLines(nested as ListNode, depth + 1));
			}
		}
	}

	return lines;
}

/** Table cells as text; cells spanning several rows are repeated in the rows below. */
function tableBlock(table: TableNode): Block {
	const spans: { text: string; remaining: number }[] = [];
	const rows: string[][] = [];

	for (const cells of [...table.rows.head, ...table.rows.body]) {
		const pending = [...cells];
		const row: string[] = [];

		while (pending.length || spans[row.length]?.remaining) {
			const spanned = spans[row.length];
			if (spanned?.remaining) {
				row.push(spanned.text);
				spanned.remaining--;
				continue;
			}

			const cell = pending.shift()!;
			// ` +` ends a line inside a cell.
			const text = cell.source().replace(/\s\+\n\s*/g, '<br>').replace(/\s*\n\s*/g, ' ').trim();
			spans[row.length] = { text, remaining: (cell.rowspan ?? 1) - 1 };
			row.push(text);
		}

		rows.push(row);
	}

	return { kind: 'table', rows, header: table.rows.head.length > 0 };
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
				const line = raw
					.replace(/^\s*\*\*\s+/, '  - ')
					.replace(/^\s*\*\s+/, '- ')
					.replace(/^\s*\.\.\s+/, '  1. ')
					.replace(/^\s*\.\s+/, '1. ');
				const startsItem = /^\s*(-|1\.) /.test(line);

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
			.replace(/\\\{/g, '{')
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
		.replace(/\\(?=[<*_{])/g, '');

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
 * Docs for the keywords, qualifiers and preprocessor names in src/constructs.ts, from each construct's spec section.
 * Fails when a section is missing, so spec changes surface here.
 */
function addConstructDocs(
	flavor: Flavor,
	blocks: Block[],
	attributes: Record<string, string>,
	targets: { qualifiers: Record<string, string>; keywords: Record<string, string> },
) {
	const missing: string[] = [];
	const unnamed: string[] = [];

	const constructs = constructsFor(flavor);

	// Undocumented basics also lose the one-liners from the qualifier tables (`in`, `uniform`).
	const documented = new Set(constructs.filter((construct) => construct.section).flatMap((construct) => construct.names));
	for (const construct of constructs.filter((construct) => !construct.section)) {
		for (const name of construct.names.filter((name) => !documented.has(name))) {
			delete targets.qualifiers[name];
			delete targets.keywords[name];
		}
	}

	for (const construct of constructs.filter((construct) => construct.section)) {
		const start = blocks.findIndex((block) => block.kind === 'heading' && block.id === construct.section);
		const heading = blocks[start];
		if (heading?.kind !== 'heading') {
			missing.push(`${construct.names.join(', ')} (no section ${construct.section})`);
			continue;
		}

		// The section's own text, before any subsection
		const end = blocks.findIndex((block, index) => index > start && block.kind === 'heading');
		const section = blocks.slice(start + 1, end < 0 ? undefined : end);
		const target = construct.kind === 'qualifier' || construct.kind === 'layout' ? targets.qualifiers : targets.keywords;

		for (const name of construct.names) {
			const named = sectionDoc(section, name);
			if (!named) {
				unnamed.push(name);
			}

			const doc = named ?? sectionDoc(section);
			if (doc) {
				addDoc(target, name, tidy(doc.map((block) => blockToMarkdown(block, attributes)).join('\n\n')));
			} else {
				missing.push(`${name} (section ${construct.section} has no paragraph)`);
			}
		}
	}

	if (unnamed.length) {
		console.log(`${flavor}: not named in their section, using its first paragraph: ${unnamed.join(' ')}`);
	}
	if (missing.length) {
		throw new Error(`${flavor}: no docs for ${missing.join('; ')}`);
	}
}

/**
 * Blocks documenting `name` within a section's own text:
 * - the first paragraph naming it (`*restrict*`, `+__LINE__+`)
 * - else the paragraph before code or a table naming it, or the paragraphs around a grammar block listing it
 * - without `name`, the section's first paragraph
 */
function sectionDoc(section: Block[], name?: string): Block[] | undefined {
	if (name === undefined) {
		const first = section.findIndex((block) => block.kind === 'para');
		return first < 0 ? undefined : paragraphRun(section, first);
	}

	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const emphasized = new RegExp(`(?<![\\w#])[*+]${escaped}[*+](?!\\w)`);
	const plain = new RegExp(`(?<![\\w#])${escaped}(?!\\w)`);

	// Prose only: lists like `__LINE__ __FILE__ __VERSION__` just enumerate names.
	const proseOf = (block: Block) => (block.kind === 'para' && !block.lines.every((line) => /^[*.]+ /.test(line)) ? block.lines.join('\n') : '');

	// A paragraph about it ("The *std430* qualifier ...") before one that only mentions it
	const firstNamed = (block: Block) => /(?<![\w#])[*+](#?\w+)[*+](?!\w)/.exec(proseOf(block))?.[1];
	const about = section.findIndex((block) => firstNamed(block) === name);
	const named = about >= 0 ? about : section.findIndex((block) => emphasized.test(proseOf(block)));
	if (named >= 0) {
		return paragraphRun(section, named);
	}

	const listed = section.findIndex((block) => {
		if (block.kind === 'source' || block.kind === 'grammar') {
			return plain.test(block.lines.join('\n'));
		}
		return block.kind === 'table' && emphasized.test(block.rows.flat().join('\n'));
	});
	if (listed < 0) {
		return undefined;
	}

	let before = listed - 1;
	while (before >= 0 && section[before].kind !== 'para') {
		before--;
	}
	const after = section.findIndex((block, index) => index > listed && block.kind === 'para');

	const blocks = before >= 0 ? paragraphRun(section, before) : [];
	if (section[listed].kind === 'grammar' && after >= 0 && !blocks.includes(section[after])) {
		blocks.push(...paragraphRun(section, after));
	}
	return blocks.length ? blocks : undefined;
}

/**
 * The paragraph at `index`. One continued after code ("The precision statement [code] can be used to ...")
 * starts at its first part; one ending in `:` runs on through what it introduces.
 */
function paragraphRun(section: Block[], index: number): Block[] {
	const textOf = (block: Block) => (block.kind === 'para' ? block.lines.join('\n') : '');

	let start = index;
	while (/^[a-z]/.test(textOf(section[start]))) {
		let previous = start - 1;
		while (previous >= 0 && section[previous].kind === 'source') {
			previous--;
		}
		if (previous < 0 || previous === start - 1 || section[previous].kind !== 'para') {
			break;
		}
		start = previous;
	}

	let end = index;
	if (textOf(section[index]).trimEnd().endsWith(':')) {
		for (let next = index + 1; next < section.length; next++) {
			end = next;
			if (section[next].kind === 'para') {
				break;
			}
		}
	}

	return section.slice(start, end + 1).filter((block) => block.kind !== 'grammar');
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
