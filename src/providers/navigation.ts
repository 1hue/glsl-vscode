// Outline (document symbols) and go to definition

import * as vscode from 'vscode';
import { includePath } from '#src/diagnostics/diagnostics';
import { INCLUDE } from '#src/diagnostics/gdshader';
import { builtinLocation } from '#src/language/builtinsDocument';
import { flavorOf } from '#src/language/definitions';
import { UserSymbol, scanDocument, visibleSymbols } from '#src/analysis/symbols';
import { isMemberAccess, wordAt } from '#src/analysis/textContext';

const SYMBOL_KINDS: Record<UserSymbol['kind'], vscode.SymbolKind> = {
	function: vscode.SymbolKind.Function,
	struct: vscode.SymbolKind.Struct,
	member: vscode.SymbolKind.Field,
	variable: vscode.SymbolKind.Variable,
	parameter: vscode.SymbolKind.Variable,
	macro: vscode.SymbolKind.Constant,
};

function nameRange(document: vscode.TextDocument, symbol: UserSymbol): vscode.Range {
	return new vscode.Range(document.positionAt(symbol.nameStart), document.positionAt(symbol.nameStart + symbol.name.length));
}

function documentSymbol(document: vscode.TextDocument, symbol: UserSymbol): vscode.DocumentSymbol {
	const range = new vscode.Range(document.positionAt(symbol.start), document.positionAt(symbol.end));
	const selection = nameRange(document, symbol);

	const result = new vscode.DocumentSymbol(symbol.name, symbol.detail, SYMBOL_KINDS[symbol.kind], range.union(selection), selection);
	result.children = (symbol.children ?? []).map((c) => documentSymbol(document, c));
	return result;
}

export const documentSymbolProvider: vscode.DocumentSymbolProvider = {
	provideDocumentSymbols(document) {
		return scanDocument(document).globals.map((s) => documentSymbol(document, s));
	},
};

export const definitionProvider: vscode.DefinitionProvider = {
	provideDefinition(document, position) {
		const include = includeAt(document, position);
		if (include) {
			return [{ originSelectionRange: include.range, targetUri: vscode.Uri.file(include.file), targetRange: new vscode.Range(0, 0, 0, 0) }];
		}

		const found = wordAt(document, position);
		if (!found || isMemberAccess(document, found.range.start)) {
			return undefined;
		}

		const symbol = visibleSymbols(scanDocument(document), document.offsetAt(position)).find((s) => s.name === found.word);
		if (symbol) {
			return new vscode.Location(document.uri, nameRange(document, symbol));
		}

		return builtinLocation(flavorOf(document), found.word);
	},
};

export function includeAt(document: vscode.TextDocument, position: vscode.Position) {
	const line = document.lineAt(position.line).text;
	const [match] = line.matchAll(INCLUDE);
	if (!match) {
		return undefined;
	}
	const start = line.indexOf('"') + 1;
	const range = new vscode.Range(position.line, start, position.line, start + match[1].length);
	const file = range.contains(position) ? includePath(document, match[1], document.uri.fsPath) : undefined;
	return file ? { range, file } : undefined;
}
