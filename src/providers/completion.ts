import * as vscode from 'vscode';
import { Context, contextAt, isAvailable } from '#src/language/definitions';
import {
	functionMarkdown,
	hintMarkdown,
	markdown,
	namedDocMarkdown,
	signatureLabel,
	variableMarkdown,
} from './format';
import { DeclarationScope, constructsFor, nextQualifiers } from '#src/language/constructs';
import {
	GDSHADER_DIRECTIVES,
	GDSHADER_KEYWORDS,
	GDSHADER_QUALIFIERS,
	GDSHADER_SHADER_TYPES,
	GLSL_KEYWORDS,
	GLSL_QUALIFIERS,
	GLSL_TYPES,
	STATEMENT_KEYWORDS,
} from '#src/language/keywords';
import { UserSymbol, scanDocument, visibleSymbols } from '#src/analysis/symbols';
import {
	cursorContext,
	isMemberAccess,
	statementBefore,
	statementKind,
	wordAt,
} from '#src/analysis/textContext';

const Kind = vscode.CompletionItemKind;

// Docs are built on resolve, not up front
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
				return GDSHADER_SHADER_TYPES.map((t) => new Item(t, Kind.EnumMember));
			case 'renderMode':
			case 'stencilMode':
				return modeItems(context, kind);
			case 'hint':
				return hintItems(context);
		}

		const language = document.languageId === 'gdshader' ? 'gdshader' : 'glsl';
		const symbols = visibleSymbols(scanDocument(document), document.offsetAt(position));
		const structs = symbols.filter((s) => s.kind === 'struct');
		const isGodot = context.flavor === 'godot';

		const types = isGodot ? Object.keys(context.defs.types ?? {}) : GLSL_TYPES;
		const qualifiers = isGodot ? GDSHADER_QUALIFIERS : GLSL_QUALIFIERS;
		const cursor = cursorContext(
			document,
			position,
			new Set(qualifiers),
			new Set([...types, ...structs.map((s) => s.name)]),
		);

		switch (cursor?.kind) {
			case 'directive':
				return directiveItems(context);

			case 'layout':
				return isGodot ? undefined : layoutItems(context);

			case 'name':
				return [];

			case 'declaration':
				return [
					...keywordItems(
						context,
						declarationKeywords(context, cursor.scope, cursor.qualifiers),
					),
					...typeItems(context, types),
					...userSymbolItems(structs),
				];

			case 'statement':
				return [
					...userSymbolItems(symbols),
					...builtinFunctionItems(context, language),
					...builtinVariableItems(context, language),
					...keywordItems(context, [
						...STATEMENT_KEYWORDS,
						...declarationKeywords(context, 'local', []),
					]),
					...typeItems(context, types),
				];

			case 'expression':
				return [
					...userSymbolItems(symbols),
					...builtinFunctionItems(context, language),
					...builtinVariableItems(context, language),
					...keywordItems(context, ['true', 'false']),
					...typeItems(context, types),
				];

			default:
				return [
					...userSymbolItems(symbols),
					...builtinFunctionItems(context, language),
					...builtinVariableItems(context, language),
					...keywordItems(context, isGodot ? GDSHADER_KEYWORDS : GLSL_KEYWORDS),
					...typeItems(context, types),
				];
		}
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
		const available = groups.filter((g) => isAvailable(g, context));
		if (!available.length) {
			continue;
		}

		const item = new Item(name, Kind.Function, () =>
			functionMarkdown(name, groups, context, language),
		);
		const first = available[0].signatures[0];
		const overloads = available.reduce((count, group) => count + group.signatures.length, 0);

		item.detail =
			signatureLabel(name, first) + (overloads > 1 ? ` (+${overloads - 1} overloads)` : '');
		item.sortText = `1${name}`;
		withCallSnippet(item, name);
		items.push(item);
	}

	return items;
}

function builtinVariableItems(context: Context, language: string): Item[] {
	const items: Item[] = [];

	for (const [name, entries] of Object.entries(context.defs.variables)) {
		const available = entries.filter((e) => isAvailable(e, context));
		if (!available.length) {
			continue;
		}

		const isConstant = /^const\b/.test(available[0].decl);
		const item = new Item(name, isConstant ? Kind.Constant : Kind.Variable, () =>
			variableMarkdown(name, entries, context, language),
		);
		item.detail = available[0].decl.split('\n')[0];
		item.sortText = `1${name}`;
		if (available.every((e) => e.removed)) {
			item.tags = [vscode.CompletionItemTag.Deprecated];
		}
		items.push(item);
	}

	return items;
}

function keywordItems(context: Context, keywords: string[]): Item[] {
	const { defs } = context;

	return keywords.map((keyword) => {
		const doc = defs.qualifiers?.[keyword] ?? defs.keywords?.[keyword];
		const item = new Item(
			keyword,
			Kind.Keyword,
			doc ? () => namedDocMarkdown(keyword, doc, defs) : undefined,
		);
		item.sortText = `2${keyword}`;
		return item;
	});
}

function typeItems(context: Context, types: string[]): Item[] {
	const { defs } = context;

	return types.map((type) => {
		const doc = defs.types?.[type];
		const item = new Item(
			type,
			Kind.TypeParameter,
			doc ? () => namedDocMarkdown(type, doc, defs) : undefined,
		);
		item.sortText = `2${type}`;
		return item;
	});
}

/** Suggest next qualifiers and `struct` at statement start */
function declarationKeywords(
	context: Context,
	scope: DeclarationScope,
	present: string[],
): string[] {
	const starts = !present.length && (scope === 'global' || scope === 'local');

	if (context.flavor === 'godot') {
		// `shader_type`, `render_mode` etc. only start a statement
		const godot =
			scope === 'global' && starts
				? GDSHADER_KEYWORDS.filter((k) => !STATEMENT_KEYWORDS.includes(k))
				: GDSHADER_QUALIFIERS;
		return [...godot.filter((k) => !present.includes(k)), ...(starts ? ['struct'] : [])];
	}

	return [...nextQualifiers(context.flavor, scope, present), ...(starts ? ['struct'] : [])];
}

function directiveItems(context: Context): Item[] {
	const directives =
		context.flavor === 'godot'
			? GDSHADER_DIRECTIVES
			: constructsFor(context.flavor)
					.filter((c) => c.kind === 'directive')
					.flatMap((c) => c.names);

	return [...new Set(directives)].map((directive) => {
		const doc = context.defs.keywords?.[directive];
		return new Item(
			directive.slice(1),
			Kind.Keyword,
			doc ? () => namedDocMarkdown(directive, doc, context.defs) : undefined,
		);
	});
}

/** Suggest layout ids for current stage */
function layoutItems(context: Context): Item[] {
	if (context.flavor === 'godot') {
		return [];
	}
	const { stage, defs } = context;

	const names = constructsFor(context.flavor)
		.filter((c) => c.kind === 'layout')
		.filter((c) => !stage || !c.stages || c.stages.includes(stage))
		.flatMap((c) => c.names);

	return [...new Set(names)].map((name) => {
		const doc = defs.qualifiers?.[name];
		return new Item(
			name,
			Kind.Property,
			doc ? () => namedDocMarkdown(name, doc, defs) : undefined,
		);
	});
}

function modeItems(context: Context, kind: 'renderMode' | 'stencilMode'): Item[] {
	const byType =
		(kind === 'renderMode' ? context.defs.renderModes : context.defs.stencilModes) ?? {};
	const types = context.shaderType ? [context.shaderType] : Object.keys(byType);
	const keyword = kind === 'renderMode' ? 'render_mode' : 'stencil_mode';

	const items = new Map<string, Item>();
	for (const shaderType of types) {
		for (const [name, doc] of Object.entries(byType[shaderType] ?? {})) {
			if (!items.has(name)) {
				items.set(
					name,
					new Item(name, Kind.EnumMember, () =>
						namedDocMarkdown(`${keyword} ${name}`, doc, context.defs),
					),
				);
			}
		}
	}

	return [...items.values()];
}

function hintItems(context: Context): Item[] {
	return Object.entries(context.defs.hints ?? {}).map(([name, hint]) => {
		const item = new Item(name, Kind.EnumMember, () => hintMarkdown(name, hint, context.defs));
		item.detail = hint.types;

		// Insert hint arguments as placeholders
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
