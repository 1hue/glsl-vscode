// Shader preview fullscreen or on mesh with orbit camera and light

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildControls } from './panel.js';
import type {
	Control,
	FromWebview,
	Mesh,
	Scene,
	Shader,
	ToWebview,
	Value,
	VertexShaders,
} from './protocol.js';

interface VsCodeApi {
	postMessage(message: FromWebview): void;
	setState(state: { uri: string }): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// Stand-in outside VS Code, fed by make web
function shimVsCoveApi(): VsCodeApi {
	return {
		postMessage(message) {
			if (message.type === 'ready') {
				new EventSource('/events').onmessage = (event) =>
					window.postMessage(JSON.parse(event.data));
			}
		},
		setState() { },
	};
}

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : shimVsCoveApi();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = element<HTMLCanvasElement>('canvas');
const errors = element<HTMLPreElement>('errors');
const azimuthInput = element<HTMLInputElement>('azimuth');
const elevationInput = element<HTMLInputElement>('elevation');
const resetButton = element<HTMLButtonElement>('reset');
const controlsRoot = element('controls');
const fpsLabel = element('fps');
const meshButtons = document.querySelectorAll<HTMLButtonElement>('[data-mesh]');

const LIGHT_DISTANCE = 3;
// Mesh about half the view, seen from right and above
const CAMERA_POSITION = new THREE.Vector3()
	.setFromSphericalCoords(5, THREE.MathUtils.degToRad(90 - 22.5), THREE.MathUtils.degToRad(22.5))
	.toArray();

const GEOMETRIES: Record<Mesh, () => THREE.BufferGeometry> = {
	fullscreen: () => new THREE.PlaneGeometry(2, 2),
	plane: () => new THREE.PlaneGeometry(2, 2),
	box: () => new THREE.BoxGeometry(1.5, 1.5, 1.5),
	sphere: () => new THREE.SphereGeometry(1, 64, 32),
	torus: () => new THREE.TorusGeometry(0.8, 0.3, 48, 96),
};

// Page background shows through
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(devicePixelRatio);

const world = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
const fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;

const mesh = new THREE.Mesh(GEOMETRIES.fullscreen());
mesh.frustumCulled = false;
// Light marker
const lamp = new THREE.Mesh(
	new THREE.SphereGeometry(0.06, 16, 8),
	new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
world.add(mesh, lamp);

// Built-ins with aliases sharing one value
const time = { value: 0 };
const resolution = { value: new THREE.Vector2() };
const mouse = { value: new THREE.Vector2() };
const frame = { value: 0 };
const lightPosition = { value: new THREE.Vector3() };
const BUILTINS: Record<string, THREE.IUniform> = {
	time,
	u_time: time,
	resolution,
	u_resolution: resolution,
	mouse,
	u_mouse: mouse,
	frame,
	u_frame: frame,
	lightPosition,
};

let scene: Scene = {
	mesh: 'fullscreen',
	light: { azimuth: 45, elevation: 45 },
	uniforms: {},
	textures: {},
};
let shader: Shader | undefined;
let vertex: VertexShaders | undefined;
let lineOffset = 0;
const textures: Record<string, THREE.Texture> = {};
const checker = checkerTexture();
const timer = new THREE.Timer();

renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
	const log =
		gl.getShaderInfoLog(fragmentShader)
		|| gl.getShaderInfoLog(vertexShader)
		|| gl.getProgramInfoLog(program)
		|| 'Link failed';
	errors.textContent = shiftLines(log, lineOffset);
};

window.addEventListener('message', ({ data }: MessageEvent<ToWebview>) => {
	switch (data.type) {
		case 'scene':
			vscode.setState({ uri: data.uri });
			scene = data.scene;
			vertex = data.vertex;
			for (const [name, url] of Object.entries(data.textures)) {
				loadTexture(name, url);
			}
			applyScene();
			break;
		case 'shader':
			if ('errors' in data) {
				errors.textContent = data.errors;
				break;
			}
			shader = data;
			errors.textContent = '';
			buildMaterial();
			buildControls(controlsRoot, shader.controls, valueOf, setUniform, (name) =>
				vscode.postMessage({ type: 'pickTexture', name }),
			);
			break;
		case 'texture':
			loadTexture(data.name, data.url);
			break;
	}
});

for (const button of meshButtons) {
	button.addEventListener('click', () => {
		scene.mesh = button.dataset.mesh as Mesh;
		applyScene();
		save();
	});
}
for (const input of [azimuthInput, elevationInput]) {
	input.addEventListener('input', () => {
		scene.light = {
			azimuth: Number(azimuthInput.value),
			elevation: Number(elevationInput.value),
		};
		updateLight();
		save();
	});
}
resetButton.addEventListener('click', () => {
	delete scene.camera;
	applyCamera();
	save();
});
orbit.addEventListener('end', () => {
	scene.camera = { position: camera.position.toArray(), target: orbit.target.toArray() };
	save();
});

canvas.addEventListener('mousemove', (event) => {
	mouse.value.set(
		event.offsetX * devicePixelRatio,
		canvas.height - event.offsetY * devicePixelRatio,
	);
});

new ResizeObserver(() => {
	renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
	camera.aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
	camera.updateProjectionMatrix();
}).observe(canvas);

renderer.setAnimationLoop((timestamp) => {
	timer.update(timestamp);
	if (document.hidden || !shader) {
		return;
	}
	time.value = timer.getElapsed();
	renderer.getDrawingBufferSize(resolution.value);
	copyBuiltinMembers();
	orbit.update();
	renderer.render(world, scene.mesh === 'fullscreen' ? fullscreenCamera : camera);
	frame.value++;
	countFrame();
});

vscode.postMessage({ type: 'ready' });

// Frames in last second
let fpsFrames = 0;
let fpsStart = performance.now();
function countFrame() {
	fpsFrames++;
	const elapsed = performance.now() - fpsStart;
	if (elapsed >= 1000) {
		fpsLabel.textContent = `${Math.round((fpsFrames * 1000) / elapsed)} fps`;
		fpsFrames = 0;
		fpsStart = performance.now();
	}
}

function applyScene() {
	for (const button of meshButtons) {
		const checked = button.dataset.mesh === scene.mesh;
		button.classList.toggle('checked', checked);
		button.setAttribute('aria-pressed', String(checked));
	}
	const fullscreen = scene.mesh === 'fullscreen';
	document.body.classList.toggle('fullscreen', fullscreen);
	orbit.enabled = !fullscreen;
	lamp.visible = !fullscreen;
	mesh.geometry.dispose();
	mesh.geometry = GEOMETRIES[scene.mesh]();
	azimuthInput.value = String(scene.light.azimuth);
	elevationInput.value = String(scene.light.elevation);
	updateLight();
	applyCamera();
	buildMaterial();
}

function applyCamera() {
	camera.position.fromArray(scene.camera?.position ?? CAMERA_POSITION);
	orbit.target.fromArray(scene.camera?.target ?? [0, 0, 0]);
	orbit.update();
}

function updateLight() {
	const azimuth = THREE.MathUtils.degToRad(scene.light.azimuth);
	const elevation = THREE.MathUtils.degToRad(scene.light.elevation);
	lightPosition.value.set(
		LIGHT_DISTANCE * Math.cos(elevation) * Math.sin(azimuth),
		LIGHT_DISTANCE * Math.sin(elevation),
		LIGHT_DISTANCE * Math.cos(elevation) * Math.cos(azimuth),
	);
	lamp.position.copy(lightPosition.value);
}

function buildMaterial() {
	if (!shader || !vertex) {
		return;
	}
	lineOffset = shader.lineOffset ?? 0;
	const previous = mesh.material as THREE.Material;
	mesh.material = new THREE.RawShaderMaterial({
		vertexShader: vertex[shader.version][scene.mesh === 'fullscreen' ? 'fullscreen' : 'mesh'],
		fragmentShader: shader.fragment,
		glslVersion: shader.version === '300 es' ? THREE.GLSL3 : null,
		uniforms: { ...BUILTINS, ...userUniforms(shader) },
		side: THREE.DoubleSide,
	});
	previous.dispose();
}

/** Includes renamed built-ins */
function userUniforms({ controls, builtins }: Shader): Record<string, THREE.IUniform> {
	const uniforms: Record<string, THREE.IUniform> = {};
	const assign = (path: string, value: unknown) => {
		const [name, member] = path.split('.');
		if (member) {
			uniforms[name] ??= { value: {} };
			uniforms[name].value[member] = value;
		} else {
			uniforms[name] = { value };
		}
	};
	for (const control of controls) {
		assign(control.name, toThree(control, valueOf(control)));
	}
	for (const { name, label } of builtins) {
		// Renamed plain uniform shares the built-in, block member gets copies
		if (name.includes('.')) {
			assign(name, BUILTINS[label].value);
		} else {
			uniforms[name] = BUILTINS[label];
		}
	}
	return uniforms;
}

function copyBuiltinMembers() {
	const { uniforms } = mesh.material as THREE.RawShaderMaterial;
	for (const { name, label } of shader?.builtins ?? []) {
		const [block, member] = name.split('.');
		if (member && uniforms?.[block]) {
			uniforms[block].value[member] = BUILTINS[label].value;
		}
	}
}

/** Stored value, else annotation default, else type default */
function valueOf(control: Control): Value {
	const stored = scene.uniforms[control.name];
	if (stored !== undefined) {
		return stored;
	}
	if (control.value !== undefined) {
		return control.value;
	}
	if (control.type === 'bool') {
		return false;
	}
	const size = Number(/vec([234])$/.exec(control.type)?.[1] ?? 1);
	if (size > 1) {
		return Array<number>(size).fill(/colou?r/i.test(control.label) ? 1 : 0);
	}
	return (control.min + control.max) / 2;
}

function toThree(control: Control, value: Value): unknown {
	if (control.type === 'sampler2D') {
		return textures[control.name] ?? checker;
	}
	if (control.type.startsWith('mat')) {
		return control.type.startsWith('mat3') ? new THREE.Matrix3() : new THREE.Matrix4();
	}
	if (Array.isArray(value)) {
		const vectors = { 2: THREE.Vector2, 3: THREE.Vector3, 4: THREE.Vector4 };
		const Vector = vectors[value.length as keyof typeof vectors];
		return Vector ? new Vector().fromArray(value) : value;
	}
	return value;
}

function setUniform(name: string, value: Value) {
	scene.uniforms[name] = value;
	const control = shader?.controls.find((c) => c.name === name);
	const { uniforms } = mesh.material as THREE.RawShaderMaterial;
	if (control) {
		const [uniform, member] = name.split('.');
		const converted = toThree(control, value);
		if (member) {
			uniforms[uniform].value[member] = converted;
		} else {
			uniforms[uniform].value = converted;
		}
	}
	save();
}

function loadTexture(name: string, url: string) {
	new THREE.TextureLoader().load(url, (texture) => {
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		textures[name]?.dispose();
		textures[name] = texture;
		buildMaterial();
	});
}

function checkerTexture(): THREE.Texture {
	const size = 64;
	const data = new Uint8Array(size * size * 4);
	for (let index = 0; index < size * size; index++) {
		const shade = (((index % size) >> 3) + ((index / size) >> 3)) % 2 ? 230 : 70;
		data.set([shade, shade, shade, 255], index * 4);
	}
	const texture = new THREE.DataTexture(data, size, size);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.needsUpdate = true;
	return texture;
}

let saveTimer: number | undefined;
/** Debounced */
function save() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => vscode.postMessage({ type: 'scene', scene }), 300);
}

/** Map WebGL error lines back to original source */
function shiftLines(log: string, offset: number): string {
	return log.replace(
		/^(\w+: \d+:)(\d+)/gm,
		(_, prefix: string, line: string) => `${prefix}${Number(line) - offset}`,
	);
}
