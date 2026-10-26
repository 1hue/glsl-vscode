import * as vscode from 'vscode';
import { Context, contextAt, isAvailable } from '../definitions';
import { functionMarkdown, hintMarkdown, markdown, namedDocMarkdown, signatureLabel, variableMarkdown } from '../format';
import { GDSHADER_KEYWORDS, GDSHADER_SHADER_TYPES, GLSL_KEYWORDS, GLSL_TYPES } from '../language';
import { UserSymbol, scanDocument, visibleSymbols } from '../symbols';
import { isMemberAccess, statementBefore, statementKind, wordAt } from '../textContext';

const Kind = vscode.CompletionItemKind;

/** Docs are built on resolve, not for every item up front. */
class Item extends vscode.CompletionItem {
	constructor(
		label: string,
		kind: vscode.CompletionItemKind,
		readonly resolveDoc?: () => string,
	) {
		super(label, kind);
	}
}

export const completionProvider: vscode.CompletionItemProvider<Item> = {
	provideCompletionItems(document, position) {
		const word = wordAt(document, position);
		const start = word?.range.start ?? position;
		if (isMemberAccess(document, start)) {
			return undefined;
		}

		const context = contextAt(document, position);
		const kind = statementKind(statementBefore(document, position));

		switch (kind) {
			case 'shaderType':
				return GDSHADER_SHADER_TYPES.map((type) => new Item(type, Kind.EnumMember));
			case 'renderMode':
			case 'stencilMode':
				return modeItems(context, kind);
			case 'hint':
				return hintItems(context);
		}

		const language = document.languageId === 'gdshader' ? 'gdshader' : 'glsl';
		const symbols = visibleSymbols(scanDocument(document), document.offsetAt(position));

		return [
			...userSymbolItems(symbols),
			...builtinFunctionItems(context, language),
			...builtinVariableItems(context, language),
			...keywordAndTypeItems(context),
		];
	},

	resolveCompletionItem(item) {
		if (item.resolveDoc && !item.documentation) {
			item.documentation = markdown(item.resolveDoc());
		}
		return item;
	},
};

function userSymbolItems(symbols: UserSymbol[]): Item[] {
	const kinds: Record<UserSymbol['kind'], vscode.CompletionItemKind> = {
		function: Kind.Function,
		struct: Kind.Struct,
		member: Kind.Field,
		variable: Kind.Variable,
		parameter: Kind.Variable,
		macro: Kind.Constant,
	};

	const seen = new Set<string>();
	const items: Item[] = [];

	for (const symbol of symbols) {
		if (seen.has(symbol.name)) {
			continue;
		}
		seen.add(symbol.name);

		const item = new Item(symbol.name, kinds[symbol.kind]);
		item.detail = symbol.detail;
		item.sortText = `0${symbol.name}`;

		if (symbol.kind === 'function') {
			withCallSnippet(item, symbol.name);
		}
		items.push(item);
	}

	return items;
}

function withCallSnippet(item: Item, name: string) {
	item.insertText = new vscode.SnippetString(`${name}($0)`);
	item.command = { title: 'Signature help', command: 'editor.action.triggerParameterHints' };
}

function builtinFunctionItems(context: Context, language: string): Item[] {
	const items: Item[] = [];

	for (const [name, groups] of Object.entries(context.defs.functions)) {
		const available = groups.filter((group) => isAvailable(group, context));
		if (!available.length) {
			continue;
		}

		const item = new Item(name, Kind.Function, () => functionMarkdown(name, groups, context, language));
		const first = available[0].signatures[0];
		const overloads = available.reduce((count, group) => count + group.signatures.length, 0);

		item.detail = signatureLabel(name, first) + (overloads > 1 ? ` (+${overloads - 1} overloads)` : '');
		item.sortText = `1${name}`;
		withCallSnippet(item, name);
		items.push(item);
	}

	return items;
}

function builtinVariableItems(context: Context, language: string): Item[] {
	const items: Item[] = [];

	for (const [name, entries] of Object.entries(context.defs.variables)) {
		const available = entries.filter((entry) => isAvailable(entry, context));
		if (!available.length) {
			continue;
		}

		const isConstant = /^const\b/.test(available[0].decl);
		const item = new Item(name, isConstant ? Kind.Constant : Kind.Variable, () => variableMarkdown(name, entries, context, language));
		item.detail = available[0].decl.split('\n')[0];
		item.sortText = `1${name}`;
		items.push(item);
	}

	return items;
}

function keywordAndTypeItems(context: Context): Item[] {
	const { defs } = context;
	const isGodot = context.flavor === 'godot';

	const keywords = isGodot ? GDSHADER_KEYWORDS : GLSL_KEYWORDS;
	const types = isGodot ? Object.keys(defs.types ?? {}) : GLSL_TYPES;

	return [
		...keywords.map((keyword) => {
			const item = new Item(keyword, Kind.Keyword);
			const doc = defs.qualifiers?.[keyword];
			if (doc) {
				item.documentation = markdown(namedDocMarkdown(keyword, doc, defs));
			}
			item.sortText = `2${keyword}`;
			return item;
		}),
		...types.map((type) => {
			const doc = defs.types?.[type];
			const item = new Item(type, Kind.TypeParameter, doc ? () => namedDocMarkdown(type, doc, defs) : undefined);
			item.sortText = `2${type}`;
			return item;
		}),
	];
}

function modeItems(context: Context, kind: 'renderMode' | 'stencilMode'): Item[] {
	const byType = (kind === 'renderMode' ? context.defs.renderModes : context.defs.stencilModes) ?? {};
	const types = context.shaderType ? [context.shaderType] : Object.keys(byType);
	const keyword = kind === 'renderMode' ? 'render_mode' : 'stencil_mode';

	const items = new Map<string, Item>();
	for (const shaderType of types) {
		for (const [name, doc] of Object.entries(byType[shaderType] ?? {})) {
			if (!items.has(name)) {
				items.set(name, new Item(name, Kind.EnumMember, () => namedDocMarkdown(`${keyword} ${name}`, doc, context.defs)));
			}
		}
	}

	return [...items.values()];
}

function hintItems(context: Context): Item[] {
	return Object.entries(context.defs.hints ?? {}).map(([name, hint]) => {
		const item = new Item(name, Kind.EnumMember, () => hintMarkdown(name, hint, context.defs));
		item.detail = hint.types;

		// `hint_range(min, max[, step])`: insert with placeholders.
		const args = /\((.*)\)/.exec(hint.label)?.[1];
		if (args) {
			const placeholders = args
				.replace(/\[|\]/g, '')
				.split(',')
				.map((arg, i) => `\${${i + 1}:${arg.trim()}}`);
			item.insertText = new vscode.SnippetString(`${name}(${placeholders.join(', ')})`);
		}
		return item;
	});
}
