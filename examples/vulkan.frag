#version 460

layout(location = 0) in vec2 vUv;
layout(location = 0) out vec4 fragColor;

layout(set = 0, binding = 0) uniform Waves {
	vec3 tint; // = (0.2, 0.6, 1)
	float frequency; // [1, 40] = 12
} waves;

layout(push_constant) uniform Push {
	float speed; // [0, 5] = 1
} push;

layout(set = 0, binding = 1) uniform Time {
	float time;
};

void main() {
	vec2 center = vUv - 0.5;
	float ring = sin(length(center) * waves.frequency - time * push.speed);
	fragColor = vec4(waves.tint * (0.5 + 0.5 * ring), 1.0);
}
