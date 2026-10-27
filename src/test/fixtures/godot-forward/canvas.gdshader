// Godot-only function (texture_sdf) and desktop-only one (dFdxCoarse)
shader_type canvas_item;

void fragment() {
	COLOR = texture(TEXTURE, UV) * vec4(texture_sdf(SCREEN_UV));
	COLOR.a = dFdxCoarse(UV.x);
}
