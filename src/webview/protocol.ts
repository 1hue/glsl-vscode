// Message types shared by extension and webview builds

export type Value = number | number[] | boolean;

// Panel control for a user uniform
export interface Control {
	/** Name in WebGL source like `material.color` for block members */
	name: string;
	/** Declared name */
	label: string;
	type: string;
	min: number;
	max: number;
	/** Default from `= ...` comment */
	value?: Value;
}

export type WebGLVersion = '100' | '300 es';

export interface Shader {
	/** Without `#version` - three.js adds it */
	fragment: string;
	version: WebGLVersion;
	/** Lines before original line 1 */
	lineOffset?: number;
	controls: Control[];
	/** Built-ins under another name like `Time_.time` for `time` in a Vulkan block */
	builtins: { name: string; label: string }[];
}

export type Mesh = 'fullscreen' | 'plane' | 'box' | 'sphere' | 'torus';

export interface Scene {
	mesh: Mesh;
	camera?: { position: number[]; target: number[] };
	/** Degrees */
	light: { azimuth: number; elevation: number };
	/** Control name -> value */
	uniforms: Record<string, Value>;
	/** Control name -> image file URI */
	textures: Record<string, string>;
}

// Vertex shaders without `#version` by fragment version
export type VertexShaders = Record<WebGLVersion, Record<'mesh' | 'fullscreen', string>>;

export type ToWebview =
	| {
			type: 'scene';
			uri: string;
			scene: Scene;
			/** Control name -> webview URL */
			textures: Record<string, string>;
			vertex: VertexShaders;
	  }
	| ({ type: 'shader' } & (Shader | { errors: string }))
	| { type: 'texture'; name: string; url: string };

export type FromWebview =
	| { type: 'ready' }
	| { type: 'scene'; scene: Omit<Scene, 'textures'> }
	| { type: 'pickTexture'; name: string };
