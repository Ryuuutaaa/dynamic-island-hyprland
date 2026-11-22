#!/usr/bin/env node
// Evaluasi ekspresi di renderer Electron lewat Chrome DevTools Protocol.
// Dipakai untuk verifikasi UI tanpa klik koordinat (deterministik).
//
//   node tools/cdp-eval.mjs "expression"
//   node tools/cdp-eval.mjs --port 9222 "expression"

const args = process.argv.slice(2);
let port = 9222;
let expression = '';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') { port = Number(args[++i]); continue; }
    expression = args[i];
}

if (!expression) {
    console.error('usage: cdp-eval.mjs [--port 9222] "<javascript>"');
    process.exit(2);
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
if (!page) {
    console.error('tidak ada target page di port', port);
    process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;

const send = (method, params) => new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
});

socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error.message));
    else entry.resolve(data.result);
});

await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));

const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
});

if (result.exceptionDetails) {
    console.error('exception:', result.exceptionDetails.text,
        result.exceptionDetails.exception?.description ?? '');
    socket.close();
    process.exit(1);
}

const value = result.result?.value;
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
socket.close();
