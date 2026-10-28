#version 460
// Blinn-Phong on a mesh - pick Sphere or Torus in the preview, sliders in Uniforms panel

layout(location = 0) in vec3 vPosition;
layout(location = 1) in vec3 vNormal;
layout(location = 2) in vec2 vUv;

uniform vec3 cameraPosition;
uniform vec3 lightPosition;

uniform vec3 color; // = (0.9, 0.4, 0.2)
uniform float roughness; // [0.02, 1] = 0.3
uniform float ambient; // [0, 0.5] = 0.1
uniform bool stripes; // = true
uniform sampler2D albedo;

layout(location = 0) out vec4 fragColor;

void main() {
	vec3 normal = normalize(vNormal);
	vec3 toLight = normalize(lightPosition - vPosition);
	vec3 toCamera = normalize(cameraPosition - vPosition);
	vec3 halfway = normalize(toLight + toCamera);

	vec3 base = color * texture(albedo, vUv * 4.0).rgb;
	if (stripes) {
		base *= 0.6 + 0.4 * step(0.5, fract(vUv.x * 12.0));
	}

	float diffuse = max(dot(normal, toLight), 0.0);
	float shininess = 2.0 / (roughness * roughness);
	float specular = pow(max(dot(normal, halfway), 0.0), shininess) * diffuse;

	fragColor = vec4(base * (ambient + diffuse) + vec3(specular), 1.0);
}
