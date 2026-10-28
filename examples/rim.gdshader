// Rim glow on a mesh - pick Sphere or Torus in the preview
shader_type spatial;

#include "rim.gdshaderinc"

uniform vec4 base_color : source_color = vec4(0.2, 0.4, 0.9, 1.0);
uniform vec4 rim_color : source_color = vec4(1.0, 0.6, 0.2, 1.0);
uniform float rim_width : hint_range(0.5, 8.0) = 3.0;
uniform float pulse_speed : hint_range(0.0, 5.0) = 1.5;

void fragment() {
	float pulse = 0.75 + 0.25 * sin(TIME * pulse_speed * TAU);
	ALBEDO = base_color.rgb;
	EMISSION = rim_color.rgb * rim(NORMAL, VIEW, rim_width) * pulse;
}
