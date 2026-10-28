// Built-ins from data/*.json that apply at document position

import * as path from 'path';
import * as vscode from 'vscode';
import { GDSHADER_STAGE_FUNCTIONS, STAGE_BY_EXTENSION } from './keywords';
import { enclosingFunction, scanDocument } from '#src/analysis/symbols';
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
	/** `#version 450 compatibility` or older than 150 */
	compatibility?: boolean;
}

const PIPELINE_STAGES = new Set(Object.values(STAGE_BY_EXTENSION));

export function definitionsFor(flavor: Flavor): Definitions {
	return require(`#data/${flavor}`) as Definitions;
}

export function flavorOf(document: vscode.TextDocument): Flavor {
	if (document.uri.scheme === BUILTINS_SCHEME) {
		return path.posix.basename(document.uri.path).split('.')[0] as Flavor;
	}
	if (document.languageId === 'gdshader') {
		return 'godot';
	}

	const version = versionOf(document);
	if (version && (version.profile === 'es' || version.number === 100)) {
		return 'essl';
	}
	return 'glsl';
}

interface Version { // e.g. #version 450 core
	number: number;
	profile?: 'core' | 'compatibility' | 'es';
}

function versionOf(document: vscode.TextDocument): Version | undefined {
	const head = document.getText(new vscode.Range(0, 0, 50, 0));
	const version = /^\s*#\s*version\s+(\d+)(?:[ \t]+(core|compatibility|es))?/m.exec(head);
	return version ? { number: Number(version[1]), profile: version[2] as Version['profile'] } : undefined;
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

	// Constants and uniform state are available everywhere
	const stage = entry.stage?.replace(' (compatibility profile)', '');
	if (context.stage && stage && PIPELINE_STAGES.has(stage)) {
		return stage === context.stage;
	}
	return true;
}
