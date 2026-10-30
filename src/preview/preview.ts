import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { includePath, readSource } from '#src/diagnostics/diagnostics';
import { INCLUDE } from '#src/diagnostics/gdshader';
import { sharedGlslang } from '#src/diagnostics/glslang';
import { definitionsFor } from '#src/language/definitions';
import type { FromWebview, ToWebview, VertexShaders } from '#src/webview/protocol';
import { loadScene, saveScene } from './scene';
import { gdshaderToWebGL, toWebGL, withoutVersion } from './webgl';

const VIEW_TYPE = 'glsl.preview';
const DEBOUNCE_MS = 300;

interface State {
	uri: string;
}

export function registerPreview(context: vscode.ExtensionContext) {
	const assets = vscode.Uri.joinPath(context.extensionUri, 'assets');
	const scripts = vscode.Uri.joinPath(context.extensionUri, 'out/webview');
	const three = vscode.Uri.joinPath(context.extensionUri, 'node_modules/three');
	const codicons = vscode.Uri.joinPath(
		context.extensionUri,
		'node_modules/@vscode/codicons/dist',
	);
	const panels = new Map<string, vscode.WebviewPanel>();

	const vertexShader = (name: string) =>
		withoutVersion(
			fs.readFileSync(vscode.Uri.joinPath(assets, `vertex/${name}`).fsPath, 'utf8'),
		);
	const vertex: VertexShaders = {
		'300 es': {
			mesh: vertexShader('mesh_es300.vert'),
			fullscreen: vertexShader('fullscreen_es300.vert'),
		},
		100: {
			mesh: vertexShader('mesh_es100.vert'),
			fullscreen: vertexShader('fullscreen_es100.vert'),
		},
	};

	const attach = (panel: vscode.WebviewPanel, document: vscode.TextDocument) => {
		const key = document.uri.toString();
		panels.set(key, panel);
		const post = (message: ToWebview) => panel.webview.postMessage(message);

		// Workspace and folders of picked textures
		const roots = [
			assets,
			scripts,
			three,
			codicons,
			...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
		];
		const allow = (file: vscode.Uri) => {
			if (!roots.some((root) => file.fsPath.startsWith(root.fsPath + path.sep))) {
				roots.push(vscode.Uri.file(path.dirname(file.fsPath)));
				panel.webview.options = { enableScripts: true, localResourceRoots: roots };
			}
		};
		const scene = loadScene(context.workspaceState, document.uri);
		Object.values(scene.textures).forEach((file) => allow(vscode.Uri.parse(file)));
		panel.webview.options = { enableScripts: true, localResourceRoots: roots };
		panel.webview.html = html(panel.webview, { assets, scripts, three, codicons });

		const textureUrl = (file: string) =>
			panel.webview.asWebviewUri(vscode.Uri.parse(file)).toString();

		let text = document.getText();
		let latest = 0;
		const postShader = async () => {
			const request = ++latest;
			const result =
				document.languageId === 'gdshader'
					? gdshaderToWebGL(
							text,
							definitionsFor('godot'),
							gdshaderIncludes(document, text),
						)
					: await toWebGL(await sharedGlslang(), text);
			// Drop results of outdated edits
			if (request === latest) {
				post({ type: 'shader', ...result });
			}
		};
		let timer: NodeJS.Timeout | undefined;

		const messages = panel.webview.onDidReceiveMessage(async (message: FromWebview) => {
			switch (message.type) {
				// Sent on every webview load - hidden panels lose their content
				case 'ready': {
					const current = loadScene(context.workspaceState, document.uri);
					const textures = Object.fromEntries(
						Object.entries(current.textures).map(([name, file]) => [
							name,
							textureUrl(file),
						]),
					);
					post({ type: 'scene', uri: key, scene: current, textures, vertex });
					postShader();
					break;
				}
				// Textures only change through pickTexture
				case 'scene': {
					const { textures } = loadScene(context.workspaceState, document.uri);
					saveScene(context.workspaceState, document.uri, { ...message.scene, textures });
					break;
				}
				case 'pickTexture': {
					const [file] =
						(await vscode.window.showOpenDialog({
							defaultUri: vscode.workspace.getWorkspaceFolder(document.uri)?.uri,
							filters: { Images: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
						})) ?? [];
					if (file) {
						allow(file);
						const current = loadScene(context.workspaceState, document.uri);
						current.textures[message.name] = file.toString();
						await saveScene(context.workspaceState, document.uri, current);
						post({
							type: 'texture',
							name: message.name,
							url: textureUrl(file.toString()),
						});
					}
					break;
				}
			}
		});

		const changes = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() !== key) {
				return;
			}
			clearTimeout(timer);
			timer = setTimeout(() => {
				text = event.document.getText();
				postShader();
			}, DEBOUNCE_MS);
		});

		panel.onDidDispose(() => {
			clearTimeout(timer);
			changes.dispose();
			messages.dispose();
			panels.delete(key);
		});
	};

	// Open in group right after the shader's - Beside can pick another group
	const show = (editor: vscode.TextEditor) => {
		const column = (editor.viewColumn ?? vscode.ViewColumn.One) + 1;
		const existing = panels.get(editor.document.uri.toString());
		if (existing) {
			existing.reveal(column, true);
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			`Preview ${path.basename(editor.document.fileName)}`,
			{ viewColumn: column, preserveFocus: true },
		);
		attach(panel, editor.document);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('glsl.showPreviewToSide', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				show(editor);
			}
		}),
		vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
			async deserializeWebviewPanel(panel, state: State | undefined) {
				if (!state) {
					panel.dispose();
					return;
				}
				attach(panel, await vscode.workspace.openTextDocument(vscode.Uri.parse(state.uri)));
			},
		}),
	);
}

/** Fill placeholders in preview.html */
function html(webview: vscode.Webview, folders: Record<string, vscode.Uri>): string {
	const nonce = Array.from({ length: 32 }, () =>
		Math.floor(Math.random() * 36).toString(36),
	).join('');
	let text = fs
		.readFileSync(vscode.Uri.joinPath(folders.assets, 'preview.html').fsPath, 'utf8')
		.replace('{{head}}', '')
		.replaceAll('{{nonce}}', nonce)
		.replaceAll('{{csp}}', webview.cspSource);
	for (const [name, folder] of Object.entries(folders)) {
		text = text.replaceAll(`{{${name}}}`, webview.asWebviewUri(folder).toString());
	}
	return text;
}

/** Nested includes come first, each once. Restricted Mode reads none */
function gdshaderIncludes(
	document: vscode.TextDocument,
	text: string,
	includer = document.uri.fsPath,
	seen = new Set<string>(),
): string[] {
	if (!vscode.workspace.isTrusted) {
		return [];
	}
	return [...text.matchAll(INCLUDE)].flatMap(([, header]) => {
		const file = includePath(document, header, includer);
		const source = file && !seen.has(file) ? readSource(file) : undefined;
		if (!file || source === undefined) {
			return [];
		}
		seen.add(file);
		return [...gdshaderIncludes(document, source, file, seen), source];
	});
}
