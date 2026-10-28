#version 300 es
// Mesh vertex shader for ES 3.00 fragment shaders - world-space position and normal, uv

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vUv;

void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vPosition = world.xyz;
	vNormal = normalize(mat3(modelMatrix) * normal);
	vUv = uv;
	gl_Position = projectionMatrix * viewMatrix * world;
}
