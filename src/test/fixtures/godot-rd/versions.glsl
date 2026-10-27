#[versions]

base = "";
lod = "#define USE_LOD\n#define LOD_LEVEL 2";

#[compute]
#version 450

#VERSION_DEFINES

layout(local_size_x = 8) in;

void main() {
#ifdef USE_LOD
	lodOnly = LOD_LEVEL; // error: 'lodOnly': undeclared identifier
#endif
	both; // error: 'both': undeclared identifier
}
