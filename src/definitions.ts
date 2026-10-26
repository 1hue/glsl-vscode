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

	/** GLSL: stage from file extension. Godot: enclosing processing function */
	stage?: string;

	/** Godot `shader_type` */
	shaderType?: string;

	/** GLSL compatibility profile: `#version 450 compatibility`, or pre-profile version (< 150) */
	compatibility?: boolean;
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

	// `#version 300 es` or ES-only `#version 100`: GLSL ES
	const version = versionOf(document);
	if (version && (version.profile === 'es' || version.number === 100)) {
		return 'essl';
	}
	return 'glsl';
}

/** `#version 450 core` near top of file */
function versionOf(document: vscode.TextDocument): { number: number; profile?: string } | undefined {
	const head = document.getText(new vscode.Range(0, 0, 50, 0));
	const version = /^\s*#\s*version\s+(\d+)(?:[ \t]+(\w+))?/m.exec(head);
	return version ? { number: Number(version[1]), profile: version[2] } : undefined;
}

export function contextAt(document: vscode.TextDocument, position: vscode.Position): Context {
	const flavor = flavorOf(document);
	const defs = definitionsFor(flavor);

	if (flavor !== 'godot') {
		const stage = STAGE_BY_EXTENSION[path.extname(document.uri.path).toLowerCase()];
		const version = versionOf(document);
		const compatibility = flavor === 'glsl' && (!version || version.number < 150 || version.profile === 'compatibility');
		return { flavor, defs, stage, compatibility };
	}

	const scan = scanDocument(document);
	const enclosing = enclosingFunction(scan, document.offsetAt(position));
	const stage = enclosing && GDSHADER_STAGE_FUNCTIONS.includes(enclosing.name) ? enclosing.name : undefined;

	return { flavor, defs, stage, shaderType: scan.shaderType };
}

/** Built-in available for file's stage/shader type (unknown context allows all) */
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

	if (entry.stage?.includes('(compatibility profile)') && !context.compatibility) {
		return false;
	}

	// Constants, uniform state etc. available everywhere
	const stage = entry.stage?.replace(' (compatibility profile)', '');
	if (context.stage && stage && PIPELINE_STAGES.has(stage)) {
		return stage === context.stage;
	}
	return true;
}
