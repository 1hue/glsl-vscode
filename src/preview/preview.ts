import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { toWebGL } from './webgl';

const VIEW_TYPE = 'glsl.preview';
const DEBOUNCE_MS = 300;

interface State {
	uri: string;
}

export function registerPreview(context: vscode.ExtensionContext) {
	const assets = vscode.Uri.joinPath(context.extensionUri, 'assets');
	const panels = new Map<string, vscode.WebviewPanel>();

	const attach = (panel: vscode.WebviewPanel, document: vscode.TextDocument) => {
		const key = document.uri.toString();
		panels.set(key, panel);
		panel.webview.options = { enableScripts: true, localResourceRoots: [assets] };
		panel.webview.html = html(panel.webview, assets);

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

/** assets/preview.html with `{{nonce}}` and `{{script}}` filled in */
function html(webview: vscode.Webview, assets: vscode.Uri): string {
	const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
	const script = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'preview.js')).toString();

	return fs
		.readFileSync(vscode.Uri.joinPath(assets, 'preview.html').fsPath, 'utf8')
		.replaceAll('{{nonce}}', nonce)
		.replaceAll('{{script}}', script);
}
