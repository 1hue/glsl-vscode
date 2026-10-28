// Preview scene per shader file in workspace state

import * as vscode from 'vscode';
import type { Scene } from '#src/webview/protocol';

const DEFAULT: Scene = {
	mesh: 'fullscreen',
	light: { azimuth: 45, elevation: 45 },
	uniforms: {},
	textures: {},
};

const key = (uri: vscode.Uri) => `preview.scene:${uri.toString()}`;

export function loadScene(state: vscode.Memento, uri: vscode.Uri): Scene {
	return { ...DEFAULT, ...state.get<Partial<Scene>>(key(uri)) };
}

export function saveScene(state: vscode.Memento, uri: vscode.Uri, scene: Scene): Thenable<void> {
	return state.update(key(uri), scene);
}
