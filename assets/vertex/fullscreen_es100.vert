#version 100
// Fullscreen vertex shader for ES 1.00 fragment shaders

attribute vec3 position;
attribute vec2 uv;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
	vPosition = position;
	vNormal = vec3(0.0, 0.0, 1.0);
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
