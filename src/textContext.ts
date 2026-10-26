// What surrounds the cursor: the word under it and the statement it's in.

import * as vscode from 'vscode';
import { stripComments } from './symbols';

export type StatementKind = 'shaderType' | 'renderMode' | 'stencilMode' | 'hint' | undefined;

export function wordAt(document: vscode.TextDocument, position: vscode.Position) {
	const range = document.getWordRangeAtPosition(position, /[A-Za-z_]\w*/);
	if (!range) {
		return undefined;
	}
	return { word: document.getText(range), range };
}

/** `v.xyz` or `s.member`: built-in lookups don't apply after a dot. */
export function isMemberAccess(document: vscode.TextDocument, start: vscode.Position): boolean {
	const before = document.lineAt(start.line).text.slice(0, start.character);
	return /\.\s*$/.test(before);
}

/** Text of the current statement up to the cursor, comments removed. */
export function statementBefore(document: vscode.TextDocument, position: vscode.Position): string {
	const offset = document.offsetAt(position);
	const from = Math.max(0, offset - 2000);
	const text = stripComments(document.getText(new vscode.Range(document.positionAt(from), position)));

	const boundary = Math.max(text.lastIndexOf(';'), text.lastIndexOf('{'), text.lastIndexOf('}'));
	return text.slice(boundary + 1);
}

/** Godot statements whose words are modes, shader types or uniform hints rather than identifiers. */
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

	// `uniform vec4 color : source_color, filter_linear = ...` between the colon and `=`
	if (/^\s*(?:(?:global|instance)\s+)?uniform\b[^:=]*:[^=]*$/.test(statement)) {
		return 'hint';
	}
	return undefined;
}

/** Innermost unclosed call before the cursor: function name and active argument index. */
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
