// @ts-check
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const { LanguageClient } = require('vscode-languageclient/node');

const CLIENT_ID = 'glsl';
const CLIENT_NAME = 'GLSL Language Server';

/** @type {LanguageClient | undefined} */
let client;
/** @type {vscode.OutputChannel} */
let outputChannel;

/**
 * Resolves a configured command to an executable path, or undefined if it
 * cannot be found. Bare names are looked up on PATH.
 * @param {string} command
 * @returns {string | undefined}
 */
function resolveExecutable(command) {
	if (command.startsWith('~')) {
		command = path.join(os.homedir(), command.slice(1));
	}
	const isExecutable = (/** @type {string} */ p) => {
		try {
			fs.accessSync(p, fs.constants.X_OK);
			return fs.statSync(p).isFile();
		} catch {
			return false;
		}
	};
	if (command.includes('/') || command.includes('\\')) {
		return isExecutable(command) ? command : undefined;
	}
	const exts = process.platform === 'win32'
		? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
		: [''];
	for (const dir of (process.env.PATH || '').split(path.delimiter)) {
		if (!dir) continue;
		for (const ext of exts) {
			const candidate = path.join(dir, command + ext);
			if (isExecutable(candidate)) return candidate;
		}
	}
	return undefined;
}

async function startClient() {
	const config = vscode.workspace.getConfiguration('glsl.languageServer');
	if (!config.get('enabled', true)) {
		return;
	}

	const command = config.get('path', 'glsl_analyzer').trim();
	const executable = command && resolveExecutable(command);
	if (!executable) {
		const message = `GLSL language server '${command}' was not found. Syntax highlighting still works; set "glsl.languageServer.path" to enable language features.`;
		outputChannel.appendLine(message);
		// Not awaited, so activation doesn't block on the notification.
		vscode.window.showWarningMessage(message, 'Open Settings', 'Disable').then((choice) => {
			if (choice === 'Open Settings') {
				vscode.commands.executeCommand('workbench.action.openSettings', 'glsl.languageServer');
			} else if (choice === 'Disable') {
				config.update('enabled', false, vscode.ConfigurationTarget.Global);
			}
		});
		return;
	}

	/** @type {import('vscode-languageclient/node').Executable} */
	const serverOptions = {
		command: executable,
		args: config.get('args', []),
		options: {
			env: { ...process.env, ...config.get('env', {}) },
		},
	};

	/** @type {import('vscode-languageclient/node').LanguageClientOptions} */
	const clientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'glsl' },
			{ scheme: 'untitled', language: 'glsl' },
		],
		outputChannel,
	};

	outputChannel.appendLine(`Starting ${executable} ${serverOptions.args?.join(' ') ?? ''}`);
	client = new LanguageClient(CLIENT_ID, CLIENT_NAME, serverOptions, clientOptions);
	try {
		await client.start();
	} catch (err) {
		outputChannel.appendLine(`Failed to start language server: ${err}`);
		client = undefined;
	}
}

async function stopClient() {
	if (!client) return;
	const old = client;
	client = undefined;
	try {
		await old.stop();
	} catch (err) {
		outputChannel.appendLine(`Failed to stop language server: ${err}`);
	}
}

async function restartClient() {
	await stopClient();
	await startClient();
}

/** @param {vscode.ExtensionContext} context */
async function activate(context) {
	outputChannel = vscode.window.createOutputChannel(CLIENT_NAME);
	context.subscriptions.push(
		outputChannel,
		vscode.commands.registerCommand('glsl.restartLanguageServer', restartClient),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('glsl.languageServer')) {
				restartClient();
			}
		}),
	);
	await startClient();
}

function deactivate() {
	return stopClient();
}

module.exports = { activate, deactivate };
