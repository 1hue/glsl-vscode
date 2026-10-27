// glslang errors and warnings for GLSL and Godot shaders

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type {
	CheckOptions,
	Client,
	Diagnostic as GlslangDiagnostic,
	Glslang,
	IncludeResolver,
	Profile,
	Stage,
} from '../glslang-wasm/dist';
import { BUILTINS_SCHEME, definitionsFor } from './definitions';
import { blank, gdshaderPreamble, gdshaderToGlsl, shaderTypeOf } from './gdshaderGlsl';
import { STAGE_BY_EXTENSION } from './language';

const DEBOUNCE_MS = 300;

// STAGE_BY_EXTENSION spec names -> glslang
const GLSLANG_STAGES: Record<string, Stage> = {
	vertex: 'vertex',
	fragment: 'fragment',
	geometry: 'geometry',
	'tessellation control': 'tesscontrol',
	'tessellation evaluation': 'tesseval',
	compute: 'compute',
	mesh: 'mesh',
	task: 'task',
};

const RAY_TRACING_EXTENSIONS: Record<string, Stage> = {
	'.rgen': 'raygen',
	'.rint': 'intersect',
	'.rahit': 'anyhit',
	'.rchit': 'closesthit',
	'.rmiss': 'miss',
	'.rcall': 'callable',
};

const STAGES = new Set<string>([...Object.values(GLSLANG_STAGES), ...Object.values(RAY_TRACING_EXTENSIONS)]);

// Godot RD shader sections (RDShaderFile::parse_versions_from_text); `#[versions]` isn't shader code
const GODOT_SECTIONS: Record<string, Stage> = {
	vertex: 'vertex',
	fragment: 'fragment',
	tesselation_control: 'tesscontrol',
	tesselation_evaluation: 'tesseval',
	compute: 'compute',
	raygen: 'raygen',
	any_hit: 'anyhit',
	closest_hit: 'closesthit',
	miss: 'miss',
	intersection: 'intersect',
};

const VULKAN_ONLY =
	/\blayout\s*\([^)]*\b(set|push_constant|input_attachment_index)\b|\bsubpassInput(MS)?\b|\bgl_(VertexIndex|InstanceIndex)\b/;

/** Shader source checked as one stage. Godot RD files have several */
interface Unit {
	source: string;
	stage: Stage;
	client: Client;
	/** Document line of the unit's first line */
	lineOffset: number;
	/** Used without `#version` */
	version: number;
	profile: Profile;
	preamble?: string;
	vulkanVersion?: CheckOptions['vulkanVersion'];
	spirvVersion?: CheckOptions['spirvVersion'];
	link?: boolean;
}

const GLSL_DEFAULTS = { version: 450, profile: 'core' } as const;

// Godot's compile_glslang_shader for RD shader files
const GODOT_RD = { ...GLSL_DEFAULTS, client: 'vulkan', vulkanVersion: '1.1', spirvVersion: '1.4', link: true } as const;

/** Included file -> where it was included from */
type Includes = Map<string, { includer: string; header: string }>;

export function registerDiagnostics(context: vscode.ExtensionContext) {
	const collection = vscode.languages.createDiagnosticCollection('glslang');
	const timers = new Map<string, NodeJS.Timeout>();

	// Document -> files it includes, to recheck when one changes
	const dependencies = new Map<string, Set<string>>();

	let glslang: Promise<Glslang> | undefined;
	const load = () =>
		(glslang ??= (
			require(path.join(context.extensionPath, 'glslang-wasm', 'dist')) as typeof import('../glslang-wasm/dist')
		).createGlslang());

	const check = async (document: vscode.TextDocument) => {
		const key = document.uri.toString();
		const version = document.version;
		const units = enabled(document) ? unitsOf(document) : [];
		if (!units.length) {
			collection.delete(document.uri);
			dependencies.delete(key);
			return;
		}

		const name = document.uri.fsPath;
		const includes: Includes = new Map();
		const include: IncludeResolver = (header, { includer }) => {
			// Restricted Mode: don't read other files
			if (!vscode.workspace.isTrusted) {
				return undefined;
			}
			const file = includePath(document, header, includer);
			const source = file && readSource(file);
			if (file && source !== undefined) {
				includes.set(file, { includer, header });
				return { name: file, source: document.languageId === 'gdshader' ? gdshaderToGlsl(source) : source };
			}
			return undefined;
		};

		const diagnostics: vscode.Diagnostic[] = [];
		try {
			const instance = await load();
			for (const { source, lineOffset, version, profile, ...options } of units) {
				const result = await instance.check(source, {
					...options,
					name,
					include,
					defaultVersion: version,
					defaultProfile: profile,
				});
				for (const diagnostic of result.diagnostics) {
					diagnostics.push(toDiagnostic(document, diagnostic, lineOffset, includes));
				}
			}
		} catch {
			// Stack overflow on huge expressions etc.: nothing to report
		}

		if (document.isClosed || document.version !== version) {
			return;
		}
		dependencies.set(key, new Set(includes.keys()));
		collection.set(document.uri, unique(diagnostics));
	};

	const schedule = (document: vscode.TextDocument) => {
		const checked = document.languageId === 'glsl' || document.languageId === 'gdshader';
		if (!checked || document.uri.scheme === BUILTINS_SCHEME) {
			return;
		}
		const key = document.uri.toString();
		clearTimeout(timers.get(key));
		timers.set(
			key,
			setTimeout(() => {
				timers.delete(key);
				void check(document);
			}, DEBOUNCE_MS),
		);
	};

	const scheduleDependents = (file: string) => {
		for (const document of vscode.workspace.textDocuments) {
			if (dependencies.get(document.uri.toString())?.has(file)) {
				schedule(document);
			}
		}
	};

	context.subscriptions.push(
		collection,
		vscode.workspace.onDidOpenTextDocument(schedule),
		vscode.workspace.onDidChangeTextDocument(({ document }) => {
			schedule(document);
			scheduleDependents(document.uri.fsPath);
		}),
		vscode.workspace.onDidSaveTextDocument((document) => scheduleDependents(document.uri.fsPath)),
		vscode.workspace.onDidCloseTextDocument((document) => {
			const key = document.uri.toString();
			clearTimeout(timers.get(key));
			timers.delete(key);
			dependencies.delete(key);
			collection.delete(document.uri);
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('glsl.diagnostics')) {
				vscode.workspace.textDocuments.forEach(schedule);
			}
		}),
		vscode.workspace.onDidGrantWorkspaceTrust(() => vscode.workspace.textDocuments.forEach(schedule)),
		{ dispose: () => timers.forEach(clearTimeout) },
	);

	vscode.workspace.textDocuments.forEach(schedule);
}

function enabled(document: vscode.TextDocument): boolean {
	return vscode.workspace.getConfiguration('glsl.diagnostics', document).get('enable', true);
}

function unitsOf(document: vscode.TextDocument): Unit[] {
	const text = document.getText();

	if (document.languageId === 'gdshader') {
		return gdshaderUnits(document, text);
	}

	const sections = [...text.matchAll(/^#\[(\w+)\][ \t]*$/gm)];
	if (sections.length) {
		return godotUnits(text, sections);
	}

	// Neither `#version` nor `main`: include file, checked through its includers
	if (!/^\s*#\s*version\b/m.test(text) && !/\bmain\s*\(/.test(text)) {
		return [];
	}

	return [{ source: text, stage: stageOf(document, text), client: clientOf(text), lineOffset: 0, ...GLSL_DEFAULTS }];
}

/**
 * One unit for all processing functions (`vertex()`, `fragment()`, ...) with built-ins of all of them.
 * Compatibility renderer targets GLSL ES 3.0, others Vulkan GLSL 450
 */
function gdshaderUnits(document: vscode.TextDocument, text: string): Unit[] {
	// No `shader_type` (.gdshaderinc): checked through its includers
	const shaderType = shaderTypeOf(text);
	if (!shaderType) {
		return [];
	}

	const es = compatibilityRenderer(document);
	const glslFunctions = new Set(Object.keys(definitionsFor(es ? 'essl' : 'glsl').functions));

	return [
		{
			source: gdshaderToGlsl(text),
			stage: 'fragment',
			client: 'none',
			lineOffset: 0,
			version: es ? 300 : 460,
			profile: es ? 'es' : 'core',
			preamble: gdshaderPreamble(definitionsFor('godot'), glslFunctions, shaderType, es),
		},
	];
}

function compatibilityRenderer(document: vscode.TextDocument): boolean {
	const root = godotRoot(document);
	const project = root && readSource(path.join(root, 'project.godot'));
	return !!project && /^renderer\/rendering_method="gl_compatibility"/m.test(project);
}

/**
 * Godot RD shader, compiled like RDShaderFile::parse_versions_from_text:
 * #[versions]
 * lod = "#define USE_LOD";
 * #[vertex]
 * #version 450
 * #VERSION_DEFINES
 * ...
 * #[fragment]
 * ...
 * One unit per stage and version, version defines in the preamble
 */
function godotUnits(text: string, sections: RegExpMatchArray[]): Unit[] {
	const body = (i: number) => {
		const start = (sections[i].index ?? 0) + sections[i][0].length + 1;
		return { start, text: text.slice(start, sections[i + 1]?.index ?? text.length) };
	};

	const versionsIndex = sections.findIndex((s) => s[1] === 'versions');
	const versions =
		versionsIndex < 0
			? ['']
			: [...body(versionsIndex).text.matchAll(/^\s*\w+\s*=\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => unescape(m[1]) + '\n');

	const units: Unit[] = [];
	sections.forEach((section, i) => {
		const stage = GODOT_SECTIONS[section[1]];
		if (!stage) {
			return;
		}
		const { start, text: code } = body(i);

		// Godot replaces the token with the defines; `#` alone left is a null directive
		const source = code.replace(/VERSION_DEFINES/g, blank);
		const lineOffset = text.slice(0, start).split('\n').length - 1;

		for (const preamble of versions) {
			units.push({ source, stage, lineOffset, preamble, ...GODOT_RD });
		}
	});

	return units;
}

/** Godot's C-style escapes in version defines */
function unescape(text: string): string {
	return text.replace(/\\(.)/g, (_match, char: string) => ({ n: '\n', t: '\t' })[char] ?? char);
}

/** Setting glob, `#pragma shader_stage`, file extension, else fragment */
function stageOf(document: vscode.TextDocument, text: string): Stage {
	const globs = vscode.workspace.getConfiguration('glsl.diagnostics', document).get<Record<string, string>>('stages', {});
	for (const [pattern, stage] of Object.entries(globs)) {
		if (STAGES.has(stage) && vscode.languages.match({ pattern }, document)) {
			return stage as Stage;
		}
	}

	const pragma = /^\s*#\s*pragma\s+shader_stage\s*\(\s*(\w+)\s*\)/m.exec(text)?.[1];
	if (pragma && STAGES.has(pragma)) {
		return pragma as Stage;
	}

	// `.frag` or `.frag.glsl`
	const base = path.basename(document.uri.fsPath).toLowerCase();
	const extensions = [path.extname(base), path.extname(path.basename(base, path.extname(base)))];
	for (const extension of extensions) {
		const stage = RAY_TRACING_EXTENSIONS[extension] ?? GLSLANG_STAGES[STAGE_BY_EXTENSION[extension]];
		if (stage) {
			return stage;
		}
	}

	return 'fragment';
}

function clientOf(text: string): Client {
	return VULKAN_ONLY.test(text) ? 'vulkan' : 'none';
}

/** Includes and `project.godot` never resolve outside this: workspace folder, else document's directory */
function includeRoot(document: vscode.TextDocument): string {
	return vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? path.dirname(document.uri.fsPath);
}

/** `res://` from Godot project root, else relative to includer. Undefined outside includeRoot */
function includePath(document: vscode.TextDocument, header: string, includer: string): string | undefined {
	const root = includeRoot(document);

	let file: string | undefined;
	if (header.startsWith('res://')) {
		const project = godotRoot(document, root);
		file = project && path.join(project, header.slice('res://'.length));
	} else {
		file = path.resolve(path.dirname(includer), header);
	}

	return file && isInside(root, file) ? file : undefined;
}

/** Real paths - symlinks can't escape. False for missing files */
function isInside(root: string, file: string): boolean {
	try {
		const relative = path.relative(fs.realpathSync(root), fs.realpathSync(file));
		return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
	} catch {
		return false;
	}
}

/** Nearest `project.godot` up from document, not above root */
function godotRoot(document: vscode.TextDocument, root = includeRoot(document)): string | undefined {
	for (let current = path.dirname(document.uri.fsPath); isInside(root, current); current = path.dirname(current)) {
		if (fs.existsSync(path.join(current, 'project.godot'))) {
			return current;
		}
		if (current === path.dirname(current)) {
			return undefined;
		}
	}
	return undefined;
}

/** Unsaved editor contents first */
function readSource(file: string): string | undefined {
	const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
	if (open) {
		return open.getText();
	}
	try {
		return fs.readFileSync(file, 'utf8');
	} catch {
		return undefined;
	}
}

/** Errors inside includes go on the document's top-level `#include` line */
function toDiagnostic(
	document: vscode.TextDocument,
	diagnostic: GlslangDiagnostic,
	lineOffset: number,
	includes: Includes,
): vscode.Diagnostic {
	const message = cleanMessage(diagnostic.message);
	const severity = diagnostic.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;

	if (!includes.has(diagnostic.source)) {
		const token = /^'([^']+)'/.exec(diagnostic.message)?.[1];
		// Link errors have no line: unit's first line, Godot's section header
		const line = diagnostic.line === undefined ? lineOffset - 1 : diagnostic.line - 1 + lineOffset;
		const range = rangeAt(document, line, diagnostic.column, token);
		return withSource(new vscode.Diagnostic(range, message, severity));
	}

	let file = diagnostic.source;
	while (includes.has(includes.get(file)!.includer)) {
		file = includes.get(file)!.includer;
	}
	const header = includes.get(file)!.header;
	const line = findIncludeLine(document, header);

	const location = vscode.workspace.asRelativePath(diagnostic.source);
	const result = new vscode.Diagnostic(rangeAt(document, line), `${location}:${diagnostic.line}: ${message}`, severity);
	result.relatedInformation = [
		new vscode.DiagnosticRelatedInformation(
			new vscode.Location(
				vscode.Uri.file(diagnostic.source),
				new vscode.Position((diagnostic.line ?? 1) - 1, Math.max((diagnostic.column ?? 1) - 1, 0)),
			),
			message,
		),
	];
	return withSource(result);
}

function withSource(diagnostic: vscode.Diagnostic): vscode.Diagnostic {
	diagnostic.source = 'glslang';
	return diagnostic;
}

/** `'foo' : undeclared identifier ` -> `'foo': undeclared identifier` */
function cleanMessage(message: string): string {
	return message
		.replace(/^'' : +/, '')
		.replace(/ +: +/, ': ')
		.trim();
}

function findIncludeLine(document: vscode.TextDocument, header: string): number {
	for (let line = 0; line < document.lineCount; line++) {
		const text = document.lineAt(line).text;
		if (/^\s*#\s*include\b/.test(text) && text.includes(header)) {
			return line;
		}
	}
	return 0;
}

/**
 * Token named in the message (`'iveca2': no matching overloaded function`), else word at 1-based column,
 * else whole line. glslang puts some errors elsewhere, e.g. failed calls at their closing `)`
 */
function rangeAt(document: vscode.TextDocument, line: number, column?: number, token?: string): vscode.Range {
	const textLine = document.lineAt(Math.min(Math.max(line, 0), document.lineCount - 1));

	const start = token === undefined ? undefined : tokenIndex(textLine.text, token, (column ?? 1) - 1);
	if (start !== undefined) {
		return new vscode.Range(textLine.lineNumber, start, textLine.lineNumber, start + token!.length);
	}

	if (column) {
		const position = new vscode.Position(textLine.lineNumber, Math.min(column - 1, textLine.text.length));
		return document.getWordRangeAtPosition(position) ?? new vscode.Range(position, position.translate(0, 1));
	}

	return new vscode.Range(textLine.lineNumber, textLine.firstNonWhitespaceCharacterIndex, textLine.lineNumber, textLine.text.length);
}

/** Last occurrence at or before index, else first. Whole words for identifiers */
function tokenIndex(text: string, token: string, index: number): number | undefined {
	const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(/^\w+$/.test(token) ? `\\b${escaped}\\b` : escaped, 'g');

	let found: number | undefined;
	for (const match of text.matchAll(pattern)) {
		if (found === undefined || match.index <= index) {
			found = match.index;
		}
	}
	return found;
}

/** Same error from several Godot versions once */
function unique(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
	const seen = new Set<string>();
	return diagnostics.filter((d) => {
		const key = `${d.range.start.line}:${d.range.start.character}:${d.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
