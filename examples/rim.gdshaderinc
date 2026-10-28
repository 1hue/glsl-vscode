// Fresnel-style rim, included by rim.gdshader

float rim(vec3 normal, vec3 view, float width) {
	return pow(1.0 - max(dot(normal, view), 0.0), width);
}
