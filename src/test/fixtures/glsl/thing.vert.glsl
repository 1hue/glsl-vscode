#version 450

// Stage from double extension: vertex, so no gl_FragColor
void main() {
	gl_Position = vec4(0.0);
	// error `gl_FragColor`: 'gl_FragColor': undeclared identifier
	// error: 'assign': cannot convert from ' const 4-component vector of float' to ' temp float'
	gl_FragColor = vec4(1.0);
}
