// Godot-only syntax ignored, built-ins declared. Forward+ project: GLSL 460
shader_type spatial;
render_mode unshaded, cull_disabled;

#include "res://lib/util.gdshaderinc"

group_uniforms colors;
uniform vec4 tint : source_color = vec4(1.0);
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
instance uniform float fade = 1.0;
group_uniforms;

varying flat vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec4 c = texture(albedo_tex, UV) * tint;
	ALBEDO = c.rgb * twice(strength) * fade + sin(TIME * PI);

	// Godot rejects this, GLSL 460 doesn't: see the Compatibility fixture
	float loose = 1;

	ALBEDO += undefinedThing; // error `undefinedThing`: 'undefinedThing': undeclared identifier
}
