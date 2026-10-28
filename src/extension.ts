import * as vscode from 'vscode';
import { builtinsContentProvider } from '#src/language/builtinsDocument';
import { BUILTINS_SCHEME } from '#src/language/definitions';
import { registerDiagnostics } from '#src/diagnostics/diagnostics';
import { registerPreview } from '#src/preview/preview';
import { completionProvider } from './providers/completion';
import { hoverProvider } from './providers/hover';
import { definitionProvider, documentSymbolProvider } from './providers/navigation';
import { signatureHelpProvider } from './providers/signatureHelp';
import { forgetDocument } from '#src/analysis/symbols';

const SELECTOR: vscode.DocumentSelector = [{ language: 'glsl' }, { language: 'gdshader' }];

export function activate(context: vscode.ExtensionContext) {
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
