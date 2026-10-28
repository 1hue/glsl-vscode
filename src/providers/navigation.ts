// Outline (document symbols), go to definition and include links

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

export const documentLinkProvider: vscode.DocumentLinkProvider = {
	provideDocumentLinks(document) {
		return [...document.getText().matchAll(INCLUDE)].flatMap((match) => {
			const [line, header] = match;
			const file = includePath(document, header, document.uri.fsPath);
			if (!file) {
				return [];
			}
			const start = document.positionAt(match.index + line.indexOf('"') + 1);
			return [new vscode.DocumentLink(new vscode.Range(start, start.translate(0, header.length)), vscode.Uri.file(file))];
		});
	},
};
