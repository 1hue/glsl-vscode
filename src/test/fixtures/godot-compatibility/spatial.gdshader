// Compatibility renderer project: GLSL ES 3.0, which rejects implicit int to float like Godot
shader_type spatial;

void fragment() {
	float loose = 1; // error `=`: '=': cannot convert from ' const int' to ' temp highp float'
	ALBEDO = vec3(loose);
}
