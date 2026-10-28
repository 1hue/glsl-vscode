// vscode API mock for diagnostics in plain Node - import first

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const ROOT = process.cwd();

export class Position {
	constructor(
		readonly line: number,
		readonly character: number,
	) {}

	translate(lines: number, characters: number) {
		return new Position(this.line + lines, this.character + characters);
	}
}

export class Range {
	readonly start: Position;
	readonly end: Position;

	constructor(start: Position | number, end: Position | number, endLine?: number, endCharacter?: number) {
		if (start instanceof Position && end instanceof Position) {
			this.start = start;
			this.end = end;
		} else {
			this.start = new Position(start as number, end as number);
			this.end = new Position(endLine!, endCharacter!);
		}
	}
}

class Diagnostic {
	source?: string;
	relatedInformation?: { location: { uri: { fsPath: string } } }[];

	constructor(
		readonly range: Range,
		readonly message: string,
		readonly severity: number,
	) {}
}

export type MockDocument = ReturnType<typeof document>;

export function document(fsPath: string, text: string, languageId = 'glsl') {
	const lines = text.split('\n');
	return {
		uri: { fsPath, scheme: 'file', toString: () => `file://${fsPath}` },
		languageId,
		version: 1,
		isClosed: false,
		lineCount: lines.length,
		getText: () => text,
		lineAt: (line: number) => ({
			lineNumber: line,
			text: lines[line],
			firstNonWhitespaceCharacterIndex: lines[line].search(/\S|$/),
		}),
		getWordRangeAtPosition: (position: Position) => {
			const line = lines[position.line];
			let start = position.character;
			let end = position.character;
			if (!/\w/.test(line[start] ?? '')) {
				return undefined;
			}
			while (start > 0 && /\w/.test(line[start - 1])) {
				start--;
			}
			while (end < line.length && /\w/.test(line[end])) {
				end++;
			}
			return new Range(position.line, start, position.line, end);
		},
	};
}

const state = {
	documents: [] as MockDocument[],
	workspaceFolder: undefined as string | undefined,
	trusted: true,
	diagnostics: new Map<string, Diagnostic[]>(),
	/** Documents checked or skipped */
	done: new Set<string>(),
};

const vscode = {
	Position,
	Range,
	Diagnostic,
	DiagnosticSeverity: { Error: 0, Warning: 1 },
	DiagnosticRelatedInformation: class {
		constructor(
			readonly location: unknown,
			readonly message: string,
		) {}
	},
	Location: class {
		constructor(
			readonly uri: unknown,
			readonly position: unknown,
		) {}
	},
	Uri: { file: (fsPath: string) => ({ fsPath }) },
	languages: {
		createDiagnosticCollection: () => ({
			set: (uri: { fsPath: string }, diagnostics: Diagnostic[]) => {
				state.diagnostics.set(uri.fsPath, diagnostics);
				state.done.add(uri.fsPath);
			},
			delete: (uri: { fsPath: string }) => {
				state.diagnostics.delete(uri.fsPath);
				state.done.add(uri.fsPath);
			},
			dispose() {},
		}),
		match: () => 0,
	},
	workspace: {
		get isTrusted() {
			return state.trusted;
		},
		get textDocuments() {
			return state.documents;
		},
		getWorkspaceFolder: () => (state.workspaceFolder ? { uri: { fsPath: state.workspaceFolder } } : undefined),
		getConfiguration: () => ({ get: <T>(_key: string, fallback: T) => fallback }),
		asRelativePath: (file: string) => (state.workspaceFolder ? path.relative(state.workspaceFolder, file) : file),
		onDidOpenTextDocument: () => ({ dispose() {} }),
		onDidChangeTextDocument: () => ({ dispose() {} }),
		onDidSaveTextDocument: () => ({ dispose() {} }),
		onDidCloseTextDocument: () => ({ dispose() {} }),
		onDidChangeConfiguration: () => ({ dispose() {} }),
		onDidGrantWorkspaceTrust: () => ({ dispose() {} }),
	},
};

const loader = require('module') as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = loader._load;
loader._load = (request, ...rest) => (request === 'vscode' ? vscode : load(request, ...rest));

/** Temp directory with files like `{ 'lib/a.glsl': '...' }` */
export function fixture(files: Record<string, string>): string {
	const directory = fs.realpathSync(fs.mkdtempSync(`${os.tmpdir()}/glsl-vscode-`));
	for (const [file, text] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(`${directory}/${file}`), { recursive: true });
		fs.writeFileSync(`${directory}/${file}`, text);
	}
	return directory;
}

export interface Result {
	/** 0-based */
	line: number;
	/** Underlined text */
	text: string;
	message: string;
	severity: 'error' | 'warning';
}

export async function diagnose(
	documents: MockDocument[],
	{ workspaceFolder, trusted = true }: { workspaceFolder?: string; trusted?: boolean } = {},
): Promise<Result[][]> {
	state.documents = documents;
	state.workspaceFolder = workspaceFolder;
	state.trusted = trusted;
	state.diagnostics.clear();
	state.done.clear();

	const { registerDiagnostics } = require('#src/diagnostics/diagnostics') as typeof import('#src/diagnostics/diagnostics');
	registerDiagnostics({ extensionPath: ROOT, subscriptions: [] } as never);

	const deadline = Date.now() + 10000;
	while (!documents.every((d) => state.done.has(d.uri.fsPath))) {
		if (Date.now() > deadline) {
			throw new Error('diagnostics timed out');
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	return documents.map((d) =>
		(state.diagnostics.get(d.uri.fsPath) ?? []).map(({ range, message, severity }) => ({
			line: range.start.line,
			text: d.lineAt(range.start.line).text.slice(range.start.character, range.end.character),
			message,
			severity: severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
		})),
	);
}
