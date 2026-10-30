// Serve shader preview in browser without VS Code
// Usage: node out/tools/web.js [shader file] [port]

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { INCLUDE } from '#src/diagnostics/gdshader';
import { loadGlslang } from '#src/diagnostics/glslang';
import type { Definitions } from '#src/language/types';
import { gdshaderToWebGL, toWebGL, withoutVersion } from '#src/preview/webgl';
import type { Scene, ToWebview, VertexShaders } from '#src/webview/protocol';

const [file = 'examples/lit.frag', port = '8080'] = process.argv.slice(2);

// URL folder per placeholder in preview.html
const FOLDERS: Record<string, string> = {
	assets: '/assets',
	scripts: '/out/webview',
	three: '/node_modules/three',
	codicons: '/node_modules/@vscode/codicons/dist',
};

const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.ttf': 'font/ttf',
};

const SCENE: Scene = { mesh: 'fullscreen', light: { azimuth: 45, elevation: 45 }, uniforms: {}, textures: {} };

// Stands in for the VS Code webview API
const SHIM = `
window.acquireVsCodeApi = () => ({
	postMessage(message) {
		if (message.type === 'ready') {
			new EventSource('/events').onmessage = (event) => window.postMessage(JSON.parse(event.data));
		}
	},
	setState() {},
});`;

const vertexShader = (name: string) => withoutVersion(fs.readFileSync(`assets/vertex/${name}`, 'utf8'));
const vertex: VertexShaders = {
	'300 es': { mesh: vertexShader('mesh_es300.vert'), fullscreen: vertexShader('fullscreen_es300.vert') },
	100: { mesh: vertexShader('mesh_es100.vert'), fullscreen: vertexShader('fullscreen_es100.vert') },
};

const glslang = loadGlslang();
const clients = new Set<http.ServerResponse>();

async function shaderMessage(): Promise<ToWebview> {
	const text = fs.readFileSync(file, 'utf8');
	const includes = [...text.matchAll(INCLUDE)].map(([, header]) =>
		fs.readFileSync(`${path.dirname(file)}/${header}`, 'utf8'),
	);
	const result = file.endsWith('.gdshader')
		? gdshaderToWebGL(text, require('#data/godot') as Definitions, includes)
		: await toWebGL(await glslang, text);
	return { type: 'shader', ...result };
}

function send(response: http.ServerResponse, message: ToWebview) {
	response.write(`data: ${JSON.stringify(message)}\n\n`);
}

// Drop CSP - dev page connects back for events
function html(): string {
	let text = fs
		.readFileSync('assets/preview.html', 'utf8')
		.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, '')
		.replaceAll(' nonce="{{nonce}}"', '')
		.replace('</head>', `<link rel="stylesheet" href="{{assets}}/web.css" />\n<script>${SHIM}</script>\n</head>`)
		.replace('<body>', '<body class="vscode-dark">');
	for (const [name, folder] of Object.entries(FOLDERS)) {
		text = text.replaceAll(`{{${name}}}`, folder);
	}
	return text;
}

const server = http.createServer(async (request, response) => {
	const url = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);

	if (url === '/') {
		response.writeHead(200, { 'Content-Type': 'text/html' }).end(html());
		return;
	}

	if (url === '/events') {
		response.writeHead(200, { 'Content-Type': 'text/event-stream' });
		clients.add(response);
		request.on('close', () => clients.delete(response));
		send(response, { type: 'scene', uri: file, scene: SCENE, textures: {}, vertex });
		send(response, await shaderMessage());
		return;
	}

	const normalized = path.posix.normalize(url);
	const served = Object.values(FOLDERS).some(
		(folder) => normalized === folder || normalized.startsWith(`${folder}/`),
	);
	const local = `.${normalized}`;
	if (!served || !fs.existsSync(local)) {
		response.writeHead(404).end();
		return;
	}
	response.writeHead(200, { 'Content-Type': TYPES[path.extname(local)] ?? 'application/octet-stream' });
	fs.createReadStream(local).pipe(response);
});

let timer: NodeJS.Timeout | undefined;
fs.watch(file, () => {
	clearTimeout(timer);
	timer = setTimeout(async () => {
		const message = await shaderMessage();
		clients.forEach((client) => send(client, message));
	}, 100);
});

server.listen(Number(port), '0.0.0.0', () => console.log(`Preview of ${file} at http://localhost:${port}`));
