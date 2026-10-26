// Outline (document symbols) and go to definition.

import * as vscode from 'vscode';
import { builtinLocation } from '../builtinsDocument';
import { flavorOf } from '../definitions';
import { UserSymbol, scanDocument, visibleSymbols } from '../symbols';
import { isMemberAccess, wordAt } from '../textContext';

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
	result.children = (symbol.children ?? []).map((child) => documentSymbol(document, child));
	return result;
}

export const documentSymbolProvider: vscode.DocumentSymbolProvider = {
	provideDocumentSymbols(document) {
		return scanDocument(document).globals.map((symbol) => documentSymbol(document, symbol));
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
