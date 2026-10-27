// No #version - GLSL 1.10, gl_FragColor and texture2D valid
uniform sampler2D image;
varying vec2 uv;

void main() {
	gl_FragColor = texture2D(image, uv);
}
