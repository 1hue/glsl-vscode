// Emscripten output of check.cpp

export interface GlslangModule {
	_initialize(): number;
	_finalize(): void;
	/** Returns pointer to info log */
	_check(
		source: number,
		name: number,
		stage: number,
		client: number,
		defaultVersion: number,
		defaultProfile: number,
		includes: number,
	): number;
	_free(pointer: number): void;
	stringToNewUTF8(text: string): number;
	UTF8ToString(pointer: number): string;
	/** Set by index.js, called by check.cpp per `#include`. Returns malloc'd `name\0source` or 0 */
	resolveInclude?(system: number, header: string, includer: string, depth: number): number;
}

declare function createModule(options?: {
	wasmBinary?: Uint8Array;
	print?(text: string): void;
	printErr?(text: string): void;
}): Promise<GlslangModule>;

export = createModule;
