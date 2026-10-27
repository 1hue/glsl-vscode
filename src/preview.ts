import * as path from 'path';
import * as vscode from 'vscode';
import { toWebGL } from './previewSource';

const VIEW_TYPE = 'glsl.preview';
const DEBOUNCE_MS = 300;

interface State {
	uri: string;
}

export function registerPreview(context: vscode.ExtensionContext) {
	const media = vscode.Uri.joinPath(context.extensionUri, 'media');
	const panels = new Map<string, vscode.WebviewPanel>();

	const attach = (panel: vscode.WebviewPanel, document: vscode.TextDocument) => {
		const key = document.uri.toString();
		panels.set(key, panel);
		panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
		panel.webview.html = html(panel.webview, media);

		let text = document.getText();
		const post = () => panel.webview.postMessage({ uri: key, ...toWebGL(text) });
		let timer: NodeJS.Timeout | undefined;

		// Sent on every webview load - hidden panels lose their content
		const ready = panel.webview.onDidReceiveMessage(post);

		const changes = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() !== key) {
				return;
			}
			clearTimeout(timer);
			timer = setTimeout(() => {
				text = event.document.getText();
				post();
			}, DEBOUNCE_MS);
		});

		panel.onDidDispose(() => {
			clearTimeout(timer);
			changes.dispose();
			ready.dispose();
			panels.delete(key);
		});
	};

	const show = (document: vscode.TextDocument) => {
		const existing = panels.get(document.uri.toString());
		if (existing) {
			existing.reveal(vscode.ViewColumn.Beside, true);
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			`Preview ${path.basename(document.fileName)}`,
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
		);
		attach(panel, document);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('glsl.showPreviewToSide', () => {
			const document = vscode.window.activeTextEditor?.document;
			if (document) {
				show(document);
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

function html(webview: vscode.Webview, media: vscode.Uri): string {
	const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
	const script = webview.asWebviewUri(vscode.Uri.joinPath(media, 'preview.js'));

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'">
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--vscode-editor-background); }
canvas { display: block; width: 100%; height: 100%; }
pre {
	position: absolute; inset: auto 0 0 0; margin: 0; padding: 8px; max-height: 50%; overflow: auto;
	white-space: pre-wrap; font: var(--vscode-editor-font-size) var(--vscode-editor-font-family);
	color: var(--vscode-errorForeground); background: var(--vscode-editorWidget-background);
}
pre:empty { display: none; }
</style>
</head>
<body>
<canvas></canvas>
<pre></pre>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
