#version 300 es
// Raymarched sphere, mouse moves the light
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

out vec4 fragColor;

const float FAR = 10.0;

float scene(vec3 point) {
	vec3 center = vec3(sin(u_time) * 0.5, 0.0, 0.0);
	return length(point - center) - 0.6;
}

vec3 normalAt(vec3 point) {
	vec2 offset = vec2(0.001, 0.0);
	return normalize(vec3(
		scene(point + offset.xyy) - scene(point - offset.xyy),
		scene(point + offset.yxy) - scene(point - offset.yxy),
		scene(point + offset.yyx) - scene(point - offset.yyx)));
}

void main() {
	vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;
	vec3 origin = vec3(0.0, 0.0, 2.5);
	vec3 direction = normalize(vec3(uv, -1.5));
	vec3 light = normalize(vec3(u_mouse / u_resolution * 2.0 - 1.0, 1.0));

	float travelled = 0.0;
	for (int i = 0; i < 64; i++) {
		float gap = scene(origin + direction * travelled);
		if (gap < 0.001 || travelled > FAR) {
			break;
		}
		travelled += gap;
	}

	vec3 color = vec3(0.1, 0.12, 0.15);
	if (travelled <= FAR) {
		vec3 normal = normalAt(origin + direction * travelled);
		color = vec3(0.9, 0.5, 0.3) * max(dot(normal, light), 0.05);
	}
	fragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}
