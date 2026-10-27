// Sections checked as Vulkan GLSL, res:// from the folder with project.godot
#[compute]
#version 450

#include "res://lib/common.glsl"

layout(local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

layout(set = 0, binding = 0, rgba8) uniform restrict image2D trailmap;

layout(push_constant, std430) uniform Params {
	ivec2 origin;
	float margin;
};

void main() {
	ivec2 texel = ivec2(gl_GlobalInvocationID.xy) + origin;
	imageStore(trailmap, texel, vec4(twice(margin)));
	oops; // error `oops`: 'oops': undeclared identifier
}
