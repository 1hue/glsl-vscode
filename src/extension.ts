import * as vscode from 'vscode';
import { builtinsContentProvider } from './builtinsDocument';
import { BUILTINS_SCHEME, initDefinitions } from './definitions';
import { registerDiagnostics } from './diagnostics';
import { registerPreview } from './preview';
import { completionProvider } from './providers/completion';
import { hoverProvider } from './providers/hover';
import { definitionProvider, documentSymbolProvider } from './providers/navigation';
import { signatureHelpProvider } from './providers/signatureHelp';
import { forgetDocument } from './symbols';

const SELECTOR: vscode.DocumentSelector = [{ language: 'glsl' }, { language: 'gdshader' }];

export function activate(context: vscode.ExtensionContext) {
	initDefinitions(context.extensionPath);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(BUILTINS_SCHEME, builtinsContentProvider),
		vscode.languages.registerHoverProvider(SELECTOR, hoverProvider),
		vscode.languages.registerCompletionItemProvider(SELECTOR, completionProvider),
		vscode.languages.registerSignatureHelpProvider(SELECTOR, signatureHelpProvider, '(', ','),
		vscode.languages.registerDocumentSymbolProvider(SELECTOR, documentSymbolProvider),
		vscode.languages.registerDefinitionProvider(SELECTOR, definitionProvider),
		vscode.workspace.onDidCloseTextDocument(forgetDocument),
	);

	registerDiagnostics(context);
	registerPreview(context);
}

export function deactivate() {}
