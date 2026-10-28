// User symbols from text scan - not a parser, good enough for typical shaders

import * as vscode from 'vscode';
import { GDSHADER_SHADER_TYPES, GLSL_TYPES } from '#src/language/keywords';

export type UserSymbolKind = 'function' | 'struct' | 'member' | 'variable' | 'parameter' | 'macro';

export interface UserSymbol {
	name: string;
	kind: UserSymbolKind;

	/** Short declaration for outline and completion */
	detail: string;

	/** Full declaration for hover e.g. struct with members */
	declaration?: string;

	/** Offsets of declaration and name */
	start: number;
	end: number;
	nameStart: number;

	/** Function body where params and locals are visible */
	scope?: { start: number; end: number };

	children?: UserSymbol[];

	/** Block without instance name - members used like globals */
	exposesMembers?: boolean;
}

export interface DocumentScan {
	/** Top level: functions, structs, globals, macros */
	globals: UserSymbol[];

	/** Params and locals each with `scope` */
	locals: UserSymbol[];

	/** Godot `shader_type` */
	shaderType?: string;
}

const QUALIFIERS = new Set([
	'const', 'uniform', 'buffer', 'shared', 'attribute', 'varying', 'in', 'out', 'inout',
	'centroid', 'flat', 'smooth', 'noperspective', 'patch', 'sample', 'invariant', 'precise',
	'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'lowp', 'mediump', 'highp',
	'global', 'instance',
]);

const NOT_A_TYPE = new Set([
	'return', 'else', 'if', 'for', 'while', 'switch', 'case', 'do', 'discard', 'struct',
	'precision', 'shader_type', 'render_mode', 'stencil_mode', 'group_uniforms',
]);

const cache = new Map<string, { version: number; scan: DocumentScan }>();

export function scanDocument(document: vscode.TextDocument): DocumentScan {
	const key = document.uri.toString();
	const cached = cache.get(key);
	if (cached && cached.version === document.version) {
		return cached.scan;
	}

	const scan = scan_(document.getText());
	cache.set(key, { version: document.version, scan });
	return scan;
}

export function forgetDocument(document: vscode.TextDocument) {
	cache.delete(document.uri.toString());
}

/** Globals plus params/locals in scope and declared before `offset` */
export function visibleSymbols(scan: DocumentScan, offset: number): UserSymbol[] {
	const locals = scan.locals.filter(
		(s) => s.scope && s.scope.start <= offset && offset <= s.scope.end && s.nameStart <= offset,
	);

	const blockMembers = scan.globals.filter((s) => s.exposesMembers).flatMap((s) => s.children ?? []);

	// Innermost first to shadow globals
	return [...locals.reverse(), ...scan.globals, ...blockMembers];
}

export function enclosingFunction(scan: DocumentScan, offset: number): UserSymbol | undefined {
	return scan.globals.find(
		(s) => s.kind === 'function' && s.scope && s.scope.start <= offset && offset <= s.scope.end,
	);
}

/** Blank comments and strings, keep offsets and newlines */
export function stripComments(text: string): string {
	const blank = (s: string) => s.replace(/[^\n]/g, ' ');
	return text.replace(/\/\*[\s\S]*?(\*\/|$)|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"/g, blank);
}

function scan_(text: string): DocumentScan {
	const code = stripComments(text);

	const macros = findMacros(code);

	// Preprocessor lines blanked
	const source = code.replace(/^[ \t]*#[^\n]*/gm, (line) => line.replace(/[^\n]/g, ' '));
	const braces = matchBraces(source);

	const structs = findStructs(source, braces);
	const blocks = findInterfaceBlocks(source, braces);
	const typeNames = new Set([...GLSL_TYPES, ...structs.map((s) => s.name)]);

	const { functions, locals } = findFunctions(source, braces, typeNames);
	const variables = findGlobals(source, braces);

	const shaderType = /^\s*shader_type\s+(\w+)\s*;/m.exec(source)?.[1];

	const globals = [...functions, ...structs, ...blocks, ...variables, ...macros].sort((a, b) => a.start - b.start);

	return {
		globals,
		locals,
		shaderType: shaderType && GDSHADER_SHADER_TYPES.includes(shaderType) ? shaderType : undefined,
	};
}

/** `{` offset -> matching `}` offset */
function matchBraces(source: string): Map<number, number> {
	const pairs = new Map<number, number>();
	const open: number[] = [];

	for (let i = 0; i < source.length; i++) {
		if (source[i] === '{') {
			open.push(i);
		} else if (source[i] === '}' && open.length) {
			pairs.set(open.pop() as number, i);
		}
	}

	// Unclosed braces (while typing) run to end of document
	for (const start of open) {
		pairs.set(start, source.length);
	}

	return pairs;
}

function depthAt(braces: Map<number, number>, offset: number): number {
	let depth = 0;
	for (const [start, end] of braces) {
		if (start < offset && offset <= end) {
			depth++;
		}
	}
	return depth;
}

function collapse(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function findMacros(code: string): UserSymbol[] {
	const macros: UserSymbol[] = [];

	for (const match of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)(\([^)]*\))?[^\n]*/gm)) {
		const start = match.index ?? 0;
		macros.push({
			name: match[1],
			kind: 'macro',
			detail: collapse(match[0]),
			start,
			end: start + match[0].length,
			nameStart: start + match[0].indexOf(match[1], match[0].indexOf('define') + 6),
		});
	}

	return macros;
}

/** Struct/block text through closing brace and instance name without blank lines */
function fullDeclaration(source: string, start: number, close: number): string {
	const instance = /^[^;{}]*;/.exec(source.slice(close + 1))?.[0] ?? '';
	return (source.slice(start, close + 1) + instance)
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => l.trimEnd())
		.join('\n');
}

/** Member declarations in `{ ... }` body at `open` */
function findMembers(source: string, open: number, close: number): UserSymbol[] {
	const members: UserSymbol[] = [];
	const body = source.slice(open + 1, close);

	for (const member of body.matchAll(/(\w+)\s+(\w+)\s*(\[[^\]]*\])?\s*;/g)) {
		const memberStart = open + 1 + (member.index ?? 0);
		members.push({
			name: member[2],
			kind: 'member',
			detail: collapse(member[0]),
			start: memberStart,
			end: memberStart + member[0].length,
			nameStart: memberStart + member[0].indexOf(member[2], member[1].length),
		});
	}

	return members;
}

function findStructs(source: string, braces: Map<number, number>): UserSymbol[] {
	const structs: UserSymbol[] = [];

	for (const match of source.matchAll(/\bstruct\s+(\w+)\s*\{/g)) {
		const start = match.index ?? 0;
		const open = start + match[0].length - 1;
		const close = braces.get(open) ?? source.length;

		structs.push({
			name: match[1],
			kind: 'struct',
			detail: `struct ${match[1]}`,
			declaration: fullDeclaration(source, start, close),
			start,
			end: close + 1,
			nameStart: start + match[0].indexOf(match[1], 6),
			children: findMembers(source, open, close),
		});
	}

	return structs;
}

/** Top-level `uniform Params { ... };`, `buffer Data { ... } data;` */
function findInterfaceBlocks(source: string, braces: Map<number, number>): UserSymbol[] {
	const blocks: UserSymbol[] = [];

	for (const match of source.matchAll(/\b(uniform|buffer|in|out)\s+(\w+)\s*\{/g)) {
		const [whole, storage, name] = match;
		const start = match.index ?? 0;
		if (depthAt(braces, start) > 0) {
			continue;
		}

		const open = start + whole.length - 1;
		const close = braces.get(open) ?? source.length;
		const instance = /^\s*(\w+)/.exec(source.slice(close + 1))?.[1];

		blocks.push({
			name,
			kind: 'struct',
			detail: `${storage} ${name}` + (instance ? ` ${instance}` : ''),
			declaration: fullDeclaration(source, start, close),
			start,
			end: close + 1,
			nameStart: start + whole.indexOf(name, storage.length),
			children: findMembers(source, open, close),
			exposesMembers: !instance,
		});
	}

	return blocks;
}

/** Top-level function definitions and prototypes with params and locals */
function findFunctions(source: string, braces: Map<number, number>, typeNames: Set<string>) {
	const functions: UserSymbol[] = [];
	const locals: UserSymbol[] = [];

	const pattern = /\b(\w+(?:\s*\[\s*\w*\s*\])?)\s+(\w+)\s*\(([^()]*)\)\s*(\{|;)/g;

	for (const match of source.matchAll(pattern)) {
		const [whole, returnType, name, paramText, terminator] = match;
		const start = match.index ?? 0;

		if (NOT_A_TYPE.has(returnType) || depthAt(braces, start) > 0) {
			continue;
		}

		const nameStart = start + whole.indexOf(name, returnType.length);
		const paramsStart = start + whole.indexOf('(', nameStart - start) + 1;
		const signature = collapse(`${returnType} ${name}(${paramText})`);

		if (terminator === ';') {
			// Prototype listed only without definition
			const defined = new RegExp(`\\b${name}\\s*\\([^()]*\\)\\s*\\{`).test(source);
			if (!defined) {
				functions.push({ name, kind: 'function', detail: signature + ';', start, end: start + whole.length, nameStart });
			}
			continue;
		}

		const open = start + whole.length - 1;
		const close = braces.get(open) ?? source.length;
		const scope = { start: paramsStart, end: close };

		functions.push({ name, kind: 'function', detail: signature, start, end: close + 1, nameStart, scope });
		locals.push(...findParameters(paramText, paramsStart, scope));
		locals.push(...findLocals(source, open + 1, close, typeNames, braces));
	}

	return { functions, locals };
}

function findParameters(paramText: string, paramsStart: number, scope: { start: number; end: number }): UserSymbol[] {
	const params: UserSymbol[] = [];
	let offset = 0;

	for (const part of paramText.split(',')) {
		const words = part.match(/\w+/g) ?? [];
		const declaration = /(\w+)\s*(\[[^\]]*\])?\s*$/.exec(part.trim());

		if (words.length >= 2 && declaration) {
			const name = declaration[1];
			const nameOffset = part.lastIndexOf(name);
			params.push({
				name,
				kind: 'parameter',
				detail: collapse(part),
				start: paramsStart + offset,
				end: paramsStart + offset + part.length,
				nameStart: paramsStart + offset + nameOffset,
				scope,
			});
		}

		offset += part.length + 1;
	}

	return params;
}

/** Locals of built-in or struct type e.g. `vec3 n = ...` */
function findLocals(source: string, bodyStart: number, bodyEnd: number, typeNames: Set<string>, braces: Map<number, number>): UserSymbol[] {
	const locals: UserSymbol[] = [];
	const body = source.slice(bodyStart, bodyEnd);
	const pattern = /(?:^|[;{}(\s])((?:(?:const|lowp|mediump|highp)\s+)*)(\w+)(\s*\[[^\]]*\])?\s+(\w+)\s*(?=[=;,[)])/g;

	for (const match of body.matchAll(pattern)) {
		const [whole, , type, , name] = match;
		if (!typeNames.has(type)) {
			continue;
		}

		const nameStart = bodyStart + (match.index ?? 0) + whole.lastIndexOf(name);
		const statementEnd = source.indexOf(';', nameStart);

		// Visible to end of innermost block
		let scopeEnd = bodyEnd;
		for (const [open, close] of braces) {
			if (open < nameStart && nameStart < close && close < scopeEnd) {
				scopeEnd = close;
			}
		}

		// `for (int i = 0; ...) { ... }`: loop only
		const inForHeader = /\bfor\s*\([^{}]*$/.test(source.slice(bodyStart, nameStart));
		if (inForHeader) {
			const loopBody = source.indexOf('{', nameStart);
			const loopEnd = braces.get(loopBody);
			if (loopEnd !== undefined && loopEnd < scopeEnd) {
				scopeEnd = loopEnd;
			}
		}

		locals.push({
			name,
			kind: 'variable',
			detail: collapse(source.slice(bodyStart + (match.index ?? 0), statementEnd === -1 ? nameStart + name.length : statementEnd)),
			start: nameStart,
			end: nameStart + name.length,
			nameStart,
			scope: { start: nameStart, end: scopeEnd },
		});
	}

	return locals;
}

/** Top-level uniforms, ins/outs, consts, varyings, blocks */
function findGlobals(source: string, braces: Map<number, number>): UserSymbol[] {
	const globals: UserSymbol[] = [];

	for (const { text, start } of topLevelStatements(source, braces)) {
		const firstWord = /^\s*(\w+)/.exec(text)?.[1];
		const isPrototype = /^[\w\s[\]]*\b\w+\s*\([^)]*\)\s*$/.test(text);
		if (!firstWord || NOT_A_TYPE.has(firstWord) || isPrototype) {
			continue;
		}

		// Drop layout(...), Godot hints (`: source_color`), initializers
		const declaration = text
			.replace(/\blayout\s*\([^)]*\)/g, '')
			.replace(/:[^=]*/, '')
			.replace(/=[\s\S]*$/, '');

		const words = declaration.match(/\w+(?:\s*\[[^\]]*\])?|,/g) ?? [];
		const typeIndex = words.findIndex((w) => w !== ',' && !QUALIFIERS.has(w));
		if (typeIndex === -1) {
			continue;
		}

		const names = words
			.slice(typeIndex + 1)
			.filter((w) => w !== ',')
			.map((w) => /^\w+/.exec(w)?.[0] ?? '');

		for (const name of names.filter(Boolean)) {
			const nameStart = start + new RegExp(`\\b${name}\\b`).exec(text)!.index;
			globals.push({
				name,
				kind: 'variable',
				detail: collapse(text) + ';',
				start,
				end: start + text.length + 1,
				nameStart,
			});
		}
	}

	return globals;
}

/** `;`-terminated statements at depth 0, block bodies removed */
function* topLevelStatements(source: string, braces: Map<number, number>): Generator<{ text: string; start: number }> {
	let start = 0;
	let text = '';

	for (let i = 0; i < source.length; i++) {
		const char = source[i];

		if (char === '{') {
			const close = braces.get(i) ?? source.length;
			const isFunctionBody = /\)\s*$/.test(text);

			if (isFunctionBody) {
				text = '';
				start = close + 1;
			} else {
				// Keep text around struct/block body, padded to source offsets
				text += ' '.repeat(close - i + 1);
			}
			i = close;
			continue;
		}

		if (char === ';') {
			if (text.trim()) {
				const leading = text.length - text.trimStart().length;
				yield { text: text.trim(), start: start + leading };
			}
			text = '';
			start = i + 1;
			continue;
		}

		text += char;
	}
}
