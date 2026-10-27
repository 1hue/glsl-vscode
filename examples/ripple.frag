// No #version - runs as GLSL ES 1.00. Move the mouse over the preview

uniform vec2 resolution;
uniform vec2 mouse;
uniform float time;

void main() {
	vec2 uv = gl_FragCoord.xy / resolution;
	float fromMouse = length(gl_FragCoord.xy - mouse) / resolution.y;
	float ring = 0.5 + 0.5 * sin(fromMouse * 60.0 - time * 6.0);
	gl_FragColor = vec4(uv * ring, ring, 1.0);
}
