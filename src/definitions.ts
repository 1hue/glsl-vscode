// Loads data/*.json and works out which built-ins apply at a position in a document.

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { GDSHADER_STAGE_FUNCTIONS, STAGE_BY_EXTENSION } from './language';
import { enclosingFunction, scanDocument } from './symbols';
import { Definitions, FunctionGroup, Variable } from './types';

export type Flavor = 'glsl' | 'essl' | 'godot';

export const BUILTINS_SCHEME = 'glsl-defs';

export interface Context {
	flavor: Flavor;
	defs: Definitions;

	/** GLSL: stage from the file extension. Godot: enclosing processing function. */
	stage?: string;

	/** Godot `shader_type` */
	shaderType?: string;
}

const PIPELINE_STAGES = new Set(Object.values(STAGE_BY_EXTENSION));

let dataDirectory = '';
const loaded = new Map<Flavor, Definitions>();

export function initDefinitions(extensionPath: string) {
	dataDirectory = path.join(extensionPath, 'data');
}

export function definitionsFor(flavor: Flavor): Definitions {
	let defs = loaded.get(flavor);
	if (!defs) {
		defs = JSON.parse(fs.readFileSync(path.join(dataDirectory, `${flavor}.json`), 'utf8')) as Definitions;
		loaded.set(flavor, defs);
	}
	return defs;
}

export function flavorOf(document: vscode.TextDocument): Flavor {
	if (document.uri.scheme === BUILTINS_SCHEME) {
		return path.posix.basename(document.uri.path).split('.')[0] as Flavor;
	}
	if (document.languageId === 'gdshader') {
		return 'godot';
	}

	// `#version 300 es` or the ES-only `#version 100` mean GLSL ES.
	const head = document.getText(new vscode.Range(0, 0, 50, 0));
	const version = /^\s*#\s*version\s+(\d+)(\s+es\b)?/m.exec(head);
	if (version && (version[2] || version[1] === '100')) {
		return 'essl';
	}
	return 'glsl';
}

export function contextAt(document: vscode.TextDocument, position: vscode.Position): Context {
	const flavor = flavorOf(document);
	const defs = definitionsFor(flavor);

	if (flavor !== 'godot') {
		const stage = STAGE_BY_EXTENSION[path.extname(document.uri.path).toLowerCase()];
		return { flavor, defs, stage };
	}

	const scan = scanDocument(document);
	const enclosing = enclosingFunction(scan, document.offsetAt(position));
	const stage = enclosing && GDSHADER_STAGE_FUNCTIONS.includes(enclosing.name) ? enclosing.name : undefined;

	return { flavor, defs, stage, shaderType: scan.shaderType };
}

/** Whether a built-in is available given the file's stage / shader type. Unknown context allows everything. */
export function isAvailable(entry: Variable | FunctionGroup, context: Context): boolean {
	if (context.flavor === 'godot') {
		if (context.shaderType && entry.shaderType && entry.shaderType !== context.shaderType) {
			return false;
		}
		if (context.stage && entry.stage && entry.stage !== 'global') {
			return entry.stage.split(', ').includes(context.stage);
		}
		return true;
	}

	// Constants, uniform state etc. are available everywhere.
	const stage = entry.stage?.replace(' (compatibility profile)', '');
	if (context.stage && stage && PIPELINE_STAGES.has(stage)) {
		return stage === context.stage;
	}
	return true;
}
