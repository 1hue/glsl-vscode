#[vertex]
#version 450

void main() {
	gl_Position = vec4(0.0);
}

// error: Linking fragment stage: Missing entry point: Each stage requires one entry point
#[fragment]
#version 450

layout(location = 0) out vec4 color;

void helper() {
	color = vec4(1.0);
}
