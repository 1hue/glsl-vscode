// Built-in declarations document for go to definition

import * as vscode from 'vscode';
import { BUILTINS_SCHEME, Flavor, definitionsFor } from './definitions';
import { signatureLabel } from '#src/providers/format';

interface BuiltinsDocument {
	text: string;
	lines: Map<string, number>;
}

const FILE_NAMES: Record<Flavor, string> = {
	glsl: 'glsl.glsl',
	essl: 'essl.glsl',
	godot: 'godot.gdshader',
};

const built = new Map<Flavor, BuiltinsDocument>();

export function builtinsUri(flavor: Flavor): vscode.Uri {
	return vscode.Uri.from({ scheme: BUILTINS_SCHEME, path: `/${FILE_NAMES[flavor]}` });
}

export function builtinLocation(flavor: Flavor, name: string): vscode.Location | undefined {
	const line = documentFor(flavor).lines.get(name);
	if (line === undefined) {
		return undefined;
	}
	return new vscode.Location(builtinsUri(flavor), new vscode.Position(line, 0));
}

export const builtinsContentProvider: vscode.TextDocumentContentProvider = {
	provideTextDocumentContent(uri) {
		const flavor = (Object.keys(FILE_NAMES) as Flavor[]).find((f) => uri.path === `/${FILE_NAMES[f]}`);
		return flavor ? documentFor(flavor).text : '';
	},
};

function comment(text: string): string[] {
	return text.split('\n').map((l) => `// ${l}`.trimEnd());
}

function documentFor(flavor: Flavor): BuiltinsDocument {
	const cached = built.get(flavor);
	if (cached) {
		return cached;
	}

	const defs = definitionsFor(flavor);
	const out: string[] = [];
	const lines = new Map<string, number>();

	out.push(
		...comment(defs.source.name),
		...comment(`${defs.source.copyright}.`),
		...defs.source.licenses.flatMap((l) => comment(`License: ${l.id}, ${l.url}`)),
		...comment(`Source: ${defs.source.url}`),
		...comment(defs.source.modified),
		'',
	);

	out.push('// Functions', '');
	for (const name of Object.keys(defs.functions).sort()) {
		for (const group of defs.functions[name]) {
			if (group.doc) {
				out.push(...comment(group.doc));
			}
			if (!lines.has(name)) {
				lines.set(name, out.length);
			}
			out.push(...group.signatures.map((s) => signatureLabel(name, s) + ';'), '');
		}
	}

	out.push('// Variables', '');
	for (const name of Object.keys(defs.variables).sort()) {
		for (const variable of defs.variables[name]) {
			const where = [variable.shaderType, variable.stage].filter(Boolean).join(', ');
			if (where) {
				out.push(`// [${where}]`);
			}
			if (variable.doc) {
				out.push(...comment(variable.doc));
			}
			if (!lines.has(name)) {
				lines.set(name, out.length);
			}
			const decl = /[;}]\s*$/.test(variable.decl) || variable.decl.includes('//') ? variable.decl : variable.decl + ';';
			out.push(decl, '');
		}
	}

	const result = { text: out.join('\n'), lines };
	built.set(flavor, result);
	return result;
}
