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

export interface CheckOptions {
	stage: Stage;
	/** Default `none` */
	client?: Client;
	/** Used without `#version`. Default 100 */
	defaultVersion?: number;
	/** Used without `#version`. Default `none` */
	defaultProfile?: Profile;
}

export interface Diagnostic {
	severity: 'error' | 'warning';
	/** Source string index, or name from `#line` */
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
