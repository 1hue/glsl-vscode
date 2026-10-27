// @ts-check
// Render fragment shader from extension on fullscreen triangle

/** @typedef {{ uri: string, fragment: string, version: '100' | '300 es', lineOffset: number }} Message */

const vscode = /** @type {any} */ (globalThis).acquireVsCodeApi();
const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('canvas'));
const errors = /** @type {HTMLPreElement} */ (document.querySelector('pre'));
const gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2'));

const VERTEX = {
	'100': '#version 100\nattribute vec2 position;\nvoid main() { gl_Position = vec4(position, 0.0, 1.0); }',
	'300 es': '#version 300 es\nin vec2 position;\nvoid main() { gl_Position = vec4(position, 0.0, 1.0); }',
};

// Uniform name aliases
const UNIFORMS = {
	time: ['time', 'u_time'],
	resolution: ['resolution', 'u_resolution'],
	mouse: ['mouse', 'u_mouse'],
	frame: ['frame', 'u_frame'],
};

// One triangle covering clip space
gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

/** @type {{ program: WebGLProgram, uniforms: Record<string, WebGLUniformLocation[]> } | undefined} */
let current;
const start = performance.now();
let frame = 0;
const mouse = [0, 0];

window.addEventListener('message', (/** @type {MessageEvent<Message>} */ event) => {
	vscode.setState({ uri: event.data.uri });
	load(event.data);
});

canvas.addEventListener('mousemove', (event) => {
	mouse[0] = event.offsetX * devicePixelRatio;
	mouse[1] = canvas.height - event.offsetY * devicePixelRatio;
});

new ResizeObserver(() => {
	canvas.width = canvas.clientWidth * devicePixelRatio;
	canvas.height = canvas.clientHeight * devicePixelRatio;
}).observe(canvas);

requestAnimationFrame(draw);
vscode.postMessage('ready');

/** @param {Message} message */
function load({ fragment, version, lineOffset }) {
	const program = gl.createProgram();
	const shaders = [
		compile(gl.VERTEX_SHADER, VERTEX[version]),
		compile(gl.FRAGMENT_SHADER, fragment),
	];
	shaders.forEach((shader) => gl.attachShader(program, shader));
	gl.bindAttribLocation(program, 0, 'position');
	gl.linkProgram(program);
	const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
	const log = gl.getShaderInfoLog(shaders[1]) || gl.getProgramInfoLog(program) || 'Link failed';
	shaders.forEach((shader) => gl.deleteShader(shader));

	if (!linked) {
		errors.textContent = shiftLines(log, lineOffset);
		gl.deleteProgram(program);
		return;
	}

	errors.textContent = '';
	if (current) {
		gl.deleteProgram(current.program);
	}
	const uniforms = Object.fromEntries(
		Object.entries(UNIFORMS).map(([key, names]) => [
			key,
			names.map((name) => gl.getUniformLocation(program, name)).filter((location) => location !== null),
		]),
	);
	current = { program, uniforms };
}

/**
 * @param {number} type
 * @param {string} source
 */
function compile(type, source) {
	const shader = /** @type {WebGLShader} */ (gl.createShader(type));
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	return shader;
}

/**
 * `ERROR: 0:12: ...` -> line in original source
 * @param {string} log
 * @param {number} offset
 */
function shiftLines(log, offset) {
	return log.replace(/^(\w+: \d+:)(\d+)/gm, (_, prefix, line) => `${prefix}${Number(line) - offset}`);
}

function draw() {
	requestAnimationFrame(draw);
	if (!current || document.hidden) {
		return;
	}

	gl.viewport(0, 0, canvas.width, canvas.height);
	gl.useProgram(current.program);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	const { uniforms } = current;
	uniforms.time.forEach((location) => gl.uniform1f(location, (performance.now() - start) / 1000));
	uniforms.resolution.forEach((location) => gl.uniform2f(location, canvas.width, canvas.height));
	uniforms.mouse.forEach((location) => gl.uniform2f(location, mouse[0], mouse[1]));
	uniforms.frame.forEach((location) => gl.uniform1i(location, frame));

	gl.drawArrays(gl.TRIANGLES, 0, 3);
	frame++;
}
