// Shape of the generated data/*.json definition files.
// Shared by the generators (scripts/) and the extension.

export interface Param {
	type: string;
	name: string;
	optional?: boolean;
}

export interface Signature {
	returns: string;
	params: Param[];
}

export interface FunctionGroup {
	signatures: Signature[];
	doc: string;

	// Godot only
	params?: Record<string, string>;
	returns?: string;
	stage?: string;
	shaderType?: string;
}

export interface Variable {
	decl: string;
	doc: string;

	/** Khronos stage (`vertex`, `fragment`, ...) or Godot processing functions (`fragment`, `start, process`, ...) */
	stage?: string;

	/** Godot `shader_type` */
	shaderType?: string;
}

export interface License {
	/** SPDX identifier */
	id: string;
	url: string;
}

export interface SourceInfo {
	name: string;
	url: string;
	commit: string;
	copyright: string;
	licenses: License[];
	modified: string;
}

export interface Hint {
	label: string;
	types: string;
	doc: string;
}

export interface Definitions {
	source: SourceInfo;
	functions: Record<string, FunctionGroup[]>;
	variables: Record<string, Variable[]>;
	types?: Record<string, string>;
	qualifiers?: Record<string, string>;

	// Khronos only: statements, directives (`#version`), predefined macros
	keywords?: Record<string, string>;

	// Godot only
	renderModes?: Record<string, Record<string, string>>;
	stencilModes?: Record<string, Record<string, string>>;
	hints?: Record<string, Hint>;
}
