#version 330 core

uniform float time;
uniform vec2 resolution;

out vec4 color;

void main() {
	vec2 uv = (gl_FragCoord.xy * 2.0 - resolution) / resolution.y;
	float value = sin(uv.x * 4.0 + time)
		+ sin(uv.y * 4.0 + time * 1.3)
		+ sin(length(uv) * 6.0 - time * 2.0);
	color = vec4(0.5 + 0.5 * cos(value + vec3(0.0, 2.0, 4.0)), 1.0);
}
