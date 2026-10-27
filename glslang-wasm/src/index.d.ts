export type Stage =
	| 'vertex'
	| 'tesscontrol'
	| 'tesseval'
	| 'geometry'
	| 'fragment'
	| 'compute'
	| 'raygen'
	| 'intersect'
	| 'anyhit'
	| 'closesthit'
	| 'miss'
	| 'callable'
	| 'task'
	| 'mesh';

/** `none`: plain GLSL, `opengl`/`vulkan`: SPIR-V rules for that client */
export type Client = 'none' | 'opengl' | 'vulkan';

export type Profile = 'none' | 'core' | 'compatibility' | 'es';

export interface Include {
	/** Resolved name, used as `includer` for nested includes and in diagnostics */
	name: string;
	source: string;
}

export interface IncludeContext {
	/** Name of the including source */
	includer: string;
	/** `<...>` rather than `"..."`. A failed `"..."` is retried as system */
	system: boolean;
	depth: number;
}

/** Synchronous; undefined when not found */
export type IncludeResolver = (header: string, context: IncludeContext) => Include | undefined;

export interface CheckOptions {
	stage: Stage;
	/** Source name in diagnostics and `includer` for its includes. Default: string index `0` */
	name?: string;
	/** Enables `#include` (GL_GOOGLE_include_directive, no `#extension` needed) */
	include?: IncludeResolver;
	/** Default `none` */
	client?: Client;
	/** Used without `#version`. Default 100 */
	defaultVersion?: number;
	/** Used without `#version`. Default `none` */
	defaultProfile?: Profile;
}

export interface Diagnostic {
	severity: 'error' | 'warning';
	/** Source name, include name, string index or name from `#line` */
	source: string;
	/** 1-based */
	line: number;
	/** 1-based, when glslang reports one */
	column?: number;
	message: string;
}

export interface CheckResult {
	/** Raw glslang info log */
	log: string;
	diagnostics: Diagnostic[];
}

export interface Glslang {
	/**
	 * Blocks while glslang runs; use a worker for a hard timeout.
	 * Rejects on a WASM trap or stack overflow, then later calls use a fresh instance
	 */
	check(source: string, options: CheckOptions): Promise<CheckResult>;
	dispose(): Promise<void>;
}

/** `wasmBinary`: bytes of glslang.wasm, otherwise loaded next to glslang.js */
export function createGlslang(options?: { wasmBinary?: Uint8Array }): Promise<Glslang>;

export function parseLog(log: string): Diagnostic[];
