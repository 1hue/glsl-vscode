#version 100
// Mesh vertex shader for ES 1.00 fragment shaders, see mesh_es300.vert

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vPosition = world.xyz;
	vNormal = normalize(mat3(modelMatrix) * normal);
	vUv = uv;
	gl_Position = projectionMatrix * viewMatrix * world;
}
