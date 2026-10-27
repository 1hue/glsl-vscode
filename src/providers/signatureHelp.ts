import * as vscode from 'vscode';
import { contextAt, isAvailable } from '../definitions';
import { markdown, signatureLabel } from '../format';
import { scanDocument, visibleSymbols } from '../symbols';
import { callAt } from '../textContext';
import { FunctionGroup, Signature } from '../types';

export const signatureHelpProvider: vscode.SignatureHelpProvider = {
	provideSignatureHelp(document, position) {
		const call = callAt(document, position);
		if (!call) {
			return undefined;
		}

		const signatures = userSignatures(document, position, call.name) ?? builtinSignatures(document, position, call.name);
		if (!signatures?.length) {
			return undefined;
		}

		const help = new vscode.SignatureHelp();
		help.signatures = signatures;
		help.activeParameter = call.argument;

		// First overload with enough params for current argument
		const fitting = signatures.findIndex((s) => s.parameters.length > call.argument);
		help.activeSignature = Math.max(0, fitting);

		return help;
	},
};

function signatureInformation(name: string, signature: Signature, group?: FunctionGroup): vscode.SignatureInformation {
	const label = signatureLabel(name, signature);
	const info = new vscode.SignatureInformation(label, group?.doc ? markdown(group.doc) : undefined);

	// Param ranges as label offsets - VS Code highlights the right one
	let searchFrom = label.indexOf('(') + 1;
	for (const param of signature.params) {
		const text = `${param.type} ${param.name}`.trim();
		const start = label.indexOf(text, searchFrom);
		const end = start + text.length;
		searchFrom = end;

		const doc = group?.params?.[param.name];
		info.parameters.push(new vscode.ParameterInformation([start, end], doc ? markdown(doc) : undefined));
	}

	return info;
}

function builtinSignatures(document: vscode.TextDocument, position: vscode.Position, name: string) {
	const context = contextAt(document, position);
	const groups = context.defs.functions[name];
	if (!groups) {
		return undefined;
	}

	const available = groups.filter((g) => isAvailable(g, context));
	return (available.length ? available : groups).flatMap((group) =>
		group.signatures.map((s) => signatureInformation(name, s, group)),
	);
}

/** User functions: params read from declaration text */
function userSignatures(document: vscode.TextDocument, position: vscode.Position, name: string) {
	const symbol = visibleSymbols(scanDocument(document), document.offsetAt(position)).find(
		(s) => s.name === name && s.kind === 'function',
	);
	if (!symbol) {
		return undefined;
	}

	const match = /^(.*?)\s*\b\w+\s*\((.*)\)\s*;?$/.exec(symbol.detail);
	if (!match) {
		return undefined;
	}

	const params = match[2]
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p && p !== 'void')
		.map((part) => {
			const words = part.split(/\s+/);
			const paramName = words.pop() ?? '';
			return { type: words.join(' '), name: paramName };
		});

	return [signatureInformation(name, { returns: match[1], params })];
}
