// Emscripten output of check.cpp

export interface GlslangModule {
	_initialize(): number;
	_finalize(): void;
	/** Returns pointer to info log */
	_check(source: number, stage: number, client: number, defaultVersion: number, defaultProfile: number): number;
	_free(pointer: number): void;
	stringToNewUTF8(text: string): number;
	UTF8ToString(pointer: number): string;
}

declare function createModule(options?: {
	wasmBinary?: Uint8Array;
	print?(text: string): void;
	printErr?(text: string): void;
}): Promise<GlslangModule>;

export = createModule;
