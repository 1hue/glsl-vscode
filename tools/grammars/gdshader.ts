// TextMate grammar for GDShaders on top of GLSL
// Built-in names from generated Godot definitions - keeps both in sync

import { Definitions } from '#src/language/types';

function wordsPattern(words: Iterable<string>): string {
	const sorted = [...new Set(words)].sort((a, b) => b.length - a.length || a.localeCompare(b));
	return `\\b(${sorted.join('|')})\\b`;
}

export function gdshaderGrammar(godot: Definitions): object {
	const modes = [
		...Object.values(godot.renderModes ?? {}).flatMap(Object.keys),
		...Object.values(godot.stencilModes ?? {}).flatMap(Object.keys),
	];

	return {
		$schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
		name: 'Godot Shader',
		scopeName: 'source.gdshader',
		patterns: [
			// Before GLSL rules - they'd read `//` in `res://` as comment
			{
				match: '^\\s*(#\\s*include)\\s+("[^"]*")',
				captures: {
					1: { name: 'keyword.directive.preprocessor.gdshader' },
					2: { name: 'string.quoted.double.include.gdshader' },
				},
			},
			{
				match: '\\b(shader_type)\\s+(\\w+)',
				captures: {
					1: { name: 'keyword.other.shader-type.gdshader' },
					2: { name: 'entity.name.type.shader-type.gdshader' },
				},
			},
			{
				begin: '\\b(render_mode|stencil_mode)\\b',
				beginCaptures: { 1: { name: 'keyword.other.mode.gdshader' } },
				end: ';',
				patterns: [
					{ match: wordsPattern(modes), name: 'support.constant.mode.gdshader' },
					{ match: '\\b\\d+\\b', name: 'constant.numeric.gdshader' },
				],
			},
			{
				match: '\\b(group_uniforms|global|instance)\\b',
				name: 'storage.modifier.gdshader',
			},
			{
				match: wordsPattern([...Object.keys(godot.hints ?? {}), 'hint_range', 'hint_enum']),
				name: 'support.constant.hint.gdshader',
			},
			{
				match: wordsPattern(Object.keys(godot.variables)),
				name: 'support.variable.gdshader',
			},
			{
				match: wordsPattern(Object.keys(godot.functions)),
				name: 'support.function.gdshader',
			},
			{ include: 'source.glsl' },
		],
	};
}
