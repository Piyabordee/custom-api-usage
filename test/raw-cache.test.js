const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-raw-test-'));
  const customDir = path.join(dir, '.custom-api-usage');
  fs.mkdirSync(path.join(customDir, 'raw'), { recursive: true });
  return { home: dir, customDir };
}

test('primeRawCache: writes raw/<id>.json when fetch succeeds', async () => {
  const { customDir } = tempHome();
  const { primeRawCache } = require('../extension/raw-cache');
  const fakeRaw = { data: { usage: { used: 5 } } };
  // Mimic real fetchAndCache side effect: also write the raw file to disk.
  const fakeFetch = async (provider, customDir) => {
    const rawDir = path.join(customDir, 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, `${provider.id}.json`), JSON.stringify(fakeRaw, null, 2));
    return fakeRaw;
  };
  const provider = { id: 'demo', url: 'https://api.example.com', method: 'GET', headers: { Authorization: 'Bearer x' } };
  const result = await primeRawCache({
    provider,
    customDir,
    getApiKey: async () => 'test-key',
    fetchAndCache: fakeFetch
  });
  assert.equal(result.ok, true);
  const written = JSON.parse(fs.readFileSync(path.join(customDir, 'raw', 'demo.json'), 'utf8'));
  assert.deepEqual(written, fakeRaw);
});

test('primeRawCache: returns ok:false when fetch throws, does not write raw', async () => {
  const { customDir } = tempHome();
  const { primeRawCache } = require('../extension/raw-cache');
  const fakeFetch = async () => { throw new Error('network down'); };
  const provider = { id: 'demo', url: 'https://api.example.com', method: 'GET', headers: {} };
  const result = await primeRawCache({
    provider,
    customDir,
    getApiKey: async () => 'test-key',
    fetchAndCache: fakeFetch
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /network down/);
  const rawExists = fs.existsSync(path.join(customDir, 'raw', 'demo.json'));
  assert.equal(rawExists, false, 'raw should not be written on fetch failure');
});
