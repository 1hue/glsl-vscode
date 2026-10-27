#version 450
#include "lib/common.glsl" // error: lib/nested.glsl:3: 'undefinedThing': undeclared identifier

out vec4 color;

void main() {
	color = vec4(twice(1.0));
	color += foo; // error `foo`: 'foo': undeclared identifier
}
