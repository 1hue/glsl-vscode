// Word and statement around cursor

import * as vscode from 'vscode';
import { DeclarationScope } from '#src/language/constructs';
import { stripComments } from './symbols';

export type StatementKind = 'shaderType' | 'renderMode' | 'stencilMode' | 'hint' | undefined;

export function wordAt(document: vscode.TextDocument, position: vscode.Position) {
	const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
	if (!range) {
		return undefined;
	}
	return { word: document.getText(range), range };
}

export function isMemberAccess(document: vscode.TextDocument, start: vscode.Position): boolean {
	const before = document.lineAt(start.line).text.slice(0, start.character);
	return /\.\s*$/.test(before);
}

/** Comments removed */
export function statementBefore(document: vscode.TextDocument, position: vscode.Position): string {
	const offset = document.offsetAt(position);
	const from = Math.max(0, offset - 2000);
	const text = stripComments(document.getText(new vscode.Range(document.positionAt(from), position)));

	const boundary = Math.max(text.lastIndexOf(';'), text.lastIndexOf('{'), text.lastIndexOf('}'));
	return text.slice(boundary + 1);
}

export function statementKind(statement: string): StatementKind {
	if (/^\s*shader_type\b/.test(statement)) {
		return 'shaderType';
	}
	if (/^\s*render_mode\b/.test(statement)) {
		return 'renderMode';
	}
	if (/^\s*stencil_mode\b/.test(statement)) {
		return 'stencilMode';
	}

	// Between `:` and `=` like `uniform vec4 color : source_color, filter_linear = ...`
	if (/^\s*(?:(?:global|instance)\s+)?uniform\b[^:=]*:[^=]*$/.test(statement)) {
		return 'hint';
	}
	return undefined;
}

export type CursorContext =
	| { kind: 'directive' } // e.g. `#ver|`
	| { kind: 'layout' } // e.g. `layout(std|`
	| { kind: 'declaration'; scope: DeclarationScope; qualifiers: string[] } // e.g. `uniform |`: more qualifiers or a type
	| { kind: 'statement' } // Statement start in function body
	| { kind: 'expression' } // e.g. `x = |`, `f(|`
	| { kind: 'name' }; // e.g. `vec4 |`: name follows

export function cursorContext(
	document: vscode.TextDocument,
	position: vscode.Position,
	qualifierNames: Set<string>,
	typeNames: Set<string>,
): CursorContext | undefined {
	const line = document.lineAt(position.line).text.slice(0, position.character).replace(/\w*$/, '');
	if (/^\s*#\s*$/.test(line)) {
		return { kind: 'directive' };
	}
	if (/^\s*#/.test(line)) {
		return undefined;
	}

	// Text before word being typed minus comments and preprocessor lines
	const before = document.getText(new vscode.Range(new vscode.Position(0, 0), position)).replace(/\w*$/, '');
	const text = stripComments(before).replace(/^[ \t]*#.*$/gm, '');

	const scope = braceScope(text);
	const statement = text.slice(Math.max(text.lastIndexOf(';'), text.lastIndexOf('{'), text.lastIndexOf('}')) + 1);

	if (/\blayout\s*\([^()]*$/.test(statement)) {
		return { kind: 'layout' };
	}

	const openParens = (statement.match(/\(/g)?.length ?? 0) - (statement.match(/\)/g)?.length ?? 0);
	if (openParens > 0) {
		// `vec4 shade(in |` at global scope is params, other parens an expression
		if (scope !== 'global' || statement.includes('=')) {
			return { kind: 'expression' };
		}
		const parameter = statement.slice(Math.max(statement.lastIndexOf('('), statement.lastIndexOf(',')) + 1);
		return declarationContext(parameter, 'parameter', qualifierNames, typeNames, line);
	}

	if (/[=+\-*/%<>!&|^?:[]\s*$/.test(statement) || /^\s*return\b/.test(statement)) {
		return { kind: 'expression' };
	}
	if (/[=+\-*/%<>!&|^?:[]/.test(statement)) {
		return undefined;
	}

	return declarationContext(statement, scope, qualifierNames, typeNames, line);
}

function declarationContext(
	text: string,
	scope: DeclarationScope,
	qualifierNames: Set<string>,
	typeNames: Set<string>,
	line: string,
): CursorContext | undefined {
	const words = text.replace(/\blayout\s*\([^()]*\)/g, ' layout ').match(/\w+/g) ?? [];

	if (!words.length) {
		return scope === 'local' ? { kind: 'statement' } : { kind: 'declaration', scope, qualifiers: [] };
	}
	if (words.every((w) => qualifierNames.has(w))) {
		return { kind: 'declaration', scope, qualifiers: words };
	}

	// `uniform vec4 |`: name follows type and space
	const last = words[words.length - 1];
	const restAreQualifiers = words.slice(0, -1).every((w) => qualifierNames.has(w));
	if (typeNames.has(last) && restAreQualifiers && /\s$/.test(line)) {
		return { kind: 'name' };
	}
	return undefined;
}

function braceScope(text: string): 'global' | 'member' | 'local' {
	const open: ('member' | 'local')[] = [];

	for (let i = 0; i < text.length; i++) {
		if (text[i] === '{') {
			// Brace after `)` or inside code opens code, else a struct or block
			const previous = /\S(?=\s*$)/.exec(text.slice(Math.max(0, i - 200), i))?.[0];
			open.push(open.includes('local') || previous === ')' ? 'local' : 'member');
		} else if (text[i] === '}') {
			open.pop();
		}
	}

	return open.length ? open[open.length - 1] : 'global';
}

/** Innermost unclosed call */
export function callAt(document: vscode.TextDocument, position: vscode.Position): { name: string; argument: number } | undefined {
	const offset = document.offsetAt(position);
	const from = Math.max(0, offset - 4000);
	const text = stripComments(document.getText(new vscode.Range(document.positionAt(from), position)));

	let depth = 0;
	let argument = 0;

	for (let i = text.length - 1; i >= 0; i--) {
		const char = text[i];

		if (char === ')' || char === ']') {
			depth++;
		} else if (char === '[') {
			depth--;
		} else if (char === '(') {
			if (depth > 0) {
				depth--;
				continue;
			}

			const name = /(\w+)\s*$/.exec(text.slice(0, i))?.[1];
			return name ? { name, argument } : undefined;
		} else if (char === ',' && depth === 0) {
			argument++;
		} else if ((char === ';' || char === '{' || char === '}') && depth === 0) {
			return undefined;
		}
	}

	return undefined;
}
