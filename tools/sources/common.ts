import type { Definitions, Param, Signature } from '#src/types';

export type { Definitions, FunctionGroup, Hint, Param, Signature, Variable } from '#src/types';

export interface SourceConfig {
	repo: string;
	branch: string;
	commit: string;
}

export type FetchText = (url: string) => Promise<string>;

export interface Source {
	generate(config: SourceConfig, fetchText: FetchText): Promise<Record<string, Definitions>>;
}

/**
 * Parses a prototype such as
 * `genFType mix(genFType x, genFType y, float a)` or
 * `gvec4 texture(gsampler2D sampler, vec2 P [, float bias])`.
 */
export function parseSignature(text: string): (Signature & { name: string }) | undefined {
	const match = /^\s*((?:\w+\s+)*?)(\w+)\s*\((.*)\)\s*;?\s*$/.exec(text);
	if (!match) {
		return undefined;
	}

	const [, returnPart, name, paramPart] = match;
	const returns = returnPart.trim();

	// Function bodies and example statements aren't prototypes
	const isStatement = /\b(return|if|else|while|for)\b/.test(returns);
	if (!returns || isStatement || paramPart.includes('{')) {
		return undefined;
	}

	return { returns, name, params: parseParams(paramPart) };
}

export function parseParams(text: string): Param[] {
	// Optional params: `[, float bias]`
	const optionalParts: string[] = [];
	const requiredText = text.replace(/\[\s*,\s*([^\]]+)\]/g, (_, inner: string) => {
		optionalParts.push(...inner.split(','));
		return '';
	});

	const params: Param[] = [];

	for (const part of requiredText.split(',')) {
		const param = parseParam(part);
		if (param) {
			params.push(param);
		}
	}

	for (const part of optionalParts) {
		const param = parseParam(part);
		if (param) {
			params.push({ ...param, optional: true });
		}
	}

	return params;
}

function parseParam(text: string): Param | undefined {
	const words = text.trim().split(/\s+/).filter(Boolean);

	if (words.length === 0 || (words.length === 1 && words[0] === 'void')) {
		return undefined;
	}
	if (words.length === 1) {
		return { type: words[0], name: '' };
	}

	let name = words.pop() as string;
	let type = words.join(' ');

	// `ivec2 offsets[4]` -> type `ivec2[4]`, name `offsets`
	const array = /^(\w+)(\[.*\])$/.exec(name);
	if (array) {
		name = array[1];
		type += array[2];
	}

	return { type, name };
}

/** Trim trailing spaces and collapse blank lines */
export function tidy(text: string): string {
	return text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
