import * as vscode from 'vscode';
import { contextAt } from '../definitions';
import { functionMarkdown, hintMarkdown, markdown, namedDocMarkdown, userSymbolMarkdown, variableMarkdown } from '../format';
import { scanDocument, visibleSymbols } from '../symbols';
import { isMemberAccess, statementBefore, statementKind, wordAt } from '../textContext';

export const hoverProvider: vscode.HoverProvider = {
	provideHover(document, position) {
		const found = wordAt(document, position);
		if (!found || isMemberAccess(document, found.range.start)) {
			return undefined;
		}

		const text = hoverText(document, position, found.word, found.range);
		return text ? new vscode.Hover(markdown(text), found.range) : undefined;
	},
};

function hoverText(document: vscode.TextDocument, position: vscode.Position, word: string, range: vscode.Range): string | undefined {
	const context = contextAt(document, position);
	const { defs } = context;
	const language = document.languageId === 'gdshader' ? 'gdshader' : 'glsl';

	// Godot modes and hints
	const kind = statementKind(statementBefore(document, position));

	if (kind === 'renderMode' || kind === 'stencilMode') {
		const byType = (kind === 'renderMode' ? defs.renderModes : defs.stencilModes) ?? {};
		const types = context.shaderType ? [context.shaderType] : Object.keys(byType);
		for (const shaderType of types) {
			const doc = byType[shaderType]?.[word];
			if (doc !== undefined) {
				return namedDocMarkdown(`${kind === 'renderMode' ? 'render_mode' : 'stencil_mode'} ${word}`, doc, defs);
			}
		}
	}

	const hint = defs.hints?.[word];
	if (hint) {
		return hintMarkdown(word, hint, defs);
	}

	// User symbols shadow built-ins
	const offset = document.offsetAt(position);
	const symbol = visibleSymbols(scanDocument(document), offset).find((s) => s.name === word);
	if (symbol) {
		return userSymbolMarkdown(symbol, language);
	}

	const functions = defs.functions[word];
	if (functions) {
		return functionMarkdown(word, functions, context, language);
	}

	const variables = defs.variables[word];
	if (variables) {
		return variableMarkdown(word, variables, context, language);
	}

	const typeDoc = defs.types?.[word] ?? defs.qualifiers?.[word];
	if (typeDoc) {
		return namedDocMarkdown(word, typeDoc, defs);
	}

	// Directives stored with `#`
	const before = document.lineAt(range.start.line).text.slice(0, range.start.character);
	const keyword = /^\s*#\s*$/.test(before) ? `#${word}` : word;
	const keywordDoc = defs.keywords?.[keyword];
	if (keywordDoc) {
		return namedDocMarkdown(keyword, keywordDoc, defs);
	}

	return undefined;
}
