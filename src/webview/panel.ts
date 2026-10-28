// Uniform controls: slider, color, checkbox, texture picker

import type { Control, Value } from './protocol.js';

const SCALARS = new Set(['float', 'int', 'uint']);
const VECTOR = /^([iu]?)vec([234])$/;

export function buildControls(
	root: HTMLElement,
	controls: Control[],
	valueOf: (control: Control) => Value,
	onChange: (name: string, value: Value) => void,
	onPickTexture: (name: string) => void,
) {
	const elements = controls.flatMap((control) => {
		const set = (value: Value) => onChange(control.name, value);
		const editor = editorOf(control, valueOf(control), set, () => onPickTexture(control.name));
		if (!editor) {
			return [];
		}
		const container = document.createElement('div');
		container.className = 'control';
		const label = document.createElement('label');
		label.textContent = control.label;
		label.title = `${control.type} ${control.name}`;
		container.append(label, ...editor);
		return [container];
	});
	root.replaceChildren(...elements);
}

/** Inputs for control, undefined for types without input (matrices, other samplers) */
function editorOf(control: Control, value: Value, set: (value: Value) => void, pick: () => void): HTMLElement[] | undefined {
	const { type, label } = control;

	if (type === 'bool') {
		const checkbox = input('checkbox');
		checkbox.checked = Boolean(value);
		checkbox.addEventListener('input', () => set(checkbox.checked));
		return [checkbox];
	}

	if (SCALARS.has(type)) {
		return [slider(control, Number(value), type !== 'float', set)];
	}

	const vector = VECTOR.exec(type);
	if (vector && Array.isArray(value)) {
		const integer = vector[1] !== '';
		if (!integer && /colou?r/i.test(label) && value.length >= 3) {
			return [colorRow(value, set)];
		}
		return value.map((component, index) =>
			slider(control, component, integer, (next) => {
				value[index] = Number(next);
				set([...value]);
			}),
		);
	}

	if (type === 'sampler2D') {
		const button = document.createElement('button');
		button.textContent = 'Choose image…';
		button.addEventListener('click', pick);
		return [button];
	}

	return undefined;
}

/** Range and number field kept in sync */
function slider(control: Control, value: number, integer: boolean, set: (value: Value) => void): HTMLElement {
	const row = document.createElement('div');
	row.className = 'row';
	const range = input('range');
	const number = input('number');
	for (const field of [range, number]) {
		field.min = String(control.min);
		field.max = String(control.max);
		field.step = integer ? '1' : String((control.max - control.min) / 1000);
		field.value = String(value);
	}
	// Number field may go past range
	number.removeAttribute('min');
	number.removeAttribute('max');

	range.addEventListener('input', () => {
		number.value = range.value;
		set(Number(range.value));
	});
	number.addEventListener('input', () => {
		range.value = number.value;
		set(Number(number.value));
	});
	row.append(range, number);
	return row;
}

/** Native color picker, alpha slider for vec4 */
function colorRow(values: number[], set: (value: Value) => void): HTMLElement {
	const row = document.createElement('div');
	row.className = 'row';
	const picker = input('color');
	picker.value = `#${values
		.slice(0, 3)
		.map((component) => Math.round(Math.min(Math.max(component, 0), 1) * 255).toString(16).padStart(2, '0'))
		.join('')}`;
	picker.addEventListener('input', () => {
		const rgb = [1, 3, 5].map((start) => parseInt(picker.value.slice(start, start + 2), 16) / 255);
		values.splice(0, 3, ...rgb);
		set([...values]);
	});
	row.append(picker);

	if (values.length === 4) {
		const alpha = input('range');
		alpha.min = '0';
		alpha.max = '1';
		alpha.step = '0.001';
		alpha.value = String(values[3]);
		alpha.title = 'Alpha';
		alpha.addEventListener('input', () => {
			values[3] = Number(alpha.value);
			set([...values]);
		});
		row.append(alpha);
	}
	return row;
}

function input(type: string): HTMLInputElement {
	const element = document.createElement('input');
	element.type = type;
	return element;
}
