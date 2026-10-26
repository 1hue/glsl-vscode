// Markdown for hovers and completion docs.

import * as vscode from 'vscode';
import { Context, isAvailable } from './definitions';
import { UserSymbol } from './symbols';
import { Definitions, FunctionGroup, Hint, Signature, Variable } from './types';

export function signatureLabel(name: string, signature: Signature): string {
	const params = signature.params.map((param) => {
		const text = `${param.type} ${param.name}`.trim();
		return param.optional ? `[${text}]` : text;
	});
	return `${signature.returns} ${name}(${params.join(', ')})`;
}

function codeBlock(language: string, lines: string[]): string {
	return '```' + language + '\n' + lines.join('\n') + '\n```';
}

function sourceFooter(defs: Definitions): string {
	const licenses = defs.source.licenses.map((license) => `[${license.id}](${license.url})`).join(' AND ');
	return `<small>[${defs.source.name}](${defs.source.url}) · ${licenses}</small>`;
}

function contextLabel(entry: { stage?: string; shaderType?: string }): string {
	return [entry.shaderType, entry.stage].filter(Boolean).join(' · ');
}

export function functionGroupMarkdown(name: string, group: FunctionGroup, language: string): string {
	const parts = [codeBlock(language, group.signatures.map((s) => signatureLabel(name, s)))];

	const label = contextLabel(group);
	if (label) {
		parts.push(`*${label}*`);
	}

	if (group.doc) {
		parts.push(group.doc);
	}

	if (group.params) {
		const lines = Object.entries(group.params).map(([param, doc]) => `- \`${param}\`: ${doc}`);
		parts.push('**Parameters**\n\n' + lines.join('\n'));
	}

	if (group.returns) {
		parts.push(`**Returns** ${group.returns}`);
	}

	return parts.join('\n\n');
}

/** Context-matching overload groups first, the rest after a divider. */
export function functionMarkdown(name: string, groups: FunctionGroup[], context: Context, language: string): string {
	const available = groups.filter((group) => isAvailable(group, context));
	const shown = available.length ? available : groups;

	const sections = shown.map((group) => functionGroupMarkdown(name, group, language));
	return [...sections, sourceFooter(context.defs)].join('\n\n---\n\n');
}

export function variableMarkdown(name: string, contexts: Variable[], context: Context, language: string): string {
	const available = contexts.filter((entry) => isAvailable(entry, context));
	const shown = available.length ? available : contexts;

	const sections = shown.map((entry) => {
		const parts = [codeBlock(language, [entry.decl])];
		const label = contextLabel(entry);
		if (label) {
			parts.push(`*${label}*`);
		}
		if (entry.doc) {
			parts.push(entry.doc);
		}
		return parts.join('\n\n');
	});

	// Identical docs across stages / shader types (e.g. Godot TIME) are shown once.
	const unique = [...new Set(sections)];
	return [...unique, sourceFooter(context.defs)].join('\n\n---\n\n');
}

export function namedDocMarkdown(title: string, doc: string, defs: Definitions): string {
	return [`**${title}**`, doc, sourceFooter(defs)].filter(Boolean).join('\n\n');
}

export function hintMarkdown(name: string, hint: Hint, defs: Definitions): string {
	return [codeBlock('gdshader', [hint.label]), `*${hint.types}*`, hint.doc, sourceFooter(defs)].join('\n\n');
}

export function userSymbolMarkdown(symbol: UserSymbol, language: string): string {
	return codeBlock(language, [symbol.declaration ?? symbol.detail]);
}

export function markdown(text: string): vscode.MarkdownString {
	const result = new vscode.MarkdownString(text);

	// For the <small> source footer
	result.supportHtml = true;
	return result;
}
