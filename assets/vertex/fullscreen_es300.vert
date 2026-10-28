#version 300 es
// Fullscreen vertex shader for ES 3.00 fragment shaders - 2x2 plane straight to clip space

in vec3 position;
in vec2 uv;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUv;

void main() {
	vPosition = position;
	vNormal = vec3(0.0, 0.0, 1.0);
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
