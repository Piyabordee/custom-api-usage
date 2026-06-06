const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function tempCustomDir() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-http-'));
  const customDir = path.join(home, '.custom-api-usage');
  fs.mkdirSync(customDir, { recursive: true });
  return customDir;
}

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('fetchAndCache() GETs the URL and saves raw to disk', async () => {
  const customDir = tempCustomDir();
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { used: 42 } }));
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    const raw = await fetchAndCache(provider, customDir, async () => 'fake-key');
    assert.equal(raw.data.used, 42);
    const rawFile = path.join(customDir, 'raw', 'mock.json');
    assert.equal(fs.existsSync(rawFile), true);
    const cached = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    assert.equal(cached.data.used, 42);
  } finally {
    server.close();
  }
});

test('fetchAndCache() resolves ${apiKey} in headers', async () => {
  let receivedAuth = null;
  const { server, url } = await startMockServer((req, res) => {
    receivedAuth = req.headers.authorization;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: { Authorization: 'Bearer ${apiKey}' } };
    await fetchAndCache(provider, tempCustomDir(), async () => 'the-secret');
    assert.equal(receivedAuth, 'Bearer the-secret');
  } finally {
    server.close();
  }
});

test('fetchAndCache() throws on 4xx/5xx with status code in message', async () => {
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"message": "unauthorized"}');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await assert.rejects(
      fetchAndCache(provider, tempCustomDir(), async () => null),
      /401/
    );
  } finally {
    server.close();
  }
});

test('fetchAndCache() throws on non-JSON response', async () => {
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>not json</html>');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await assert.rejects(
      fetchAndCache(provider, tempCustomDir(), async () => null),
      /Invalid JSON/
    );
  } finally {
    server.close();
  }
});

test('fetchAndCache() does not write raw file on error', async () => {
  const customDir = tempCustomDir();
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(500);
    res.end('oops');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await fetchAndCache(provider, customDir, async () => null).catch(() => {});
    const rawFile = path.join(customDir, 'raw', 'mock.json');
    assert.equal(fs.existsSync(rawFile), false);
  } finally {
    server.close();
  }
});
