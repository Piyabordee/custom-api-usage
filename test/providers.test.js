const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Helper: isolated temp dir for each test
function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-test-'));
  const customDir = path.join(dir, '.custom-api-usage');
  fs.mkdirSync(customDir);
  return { home: dir, customDir };
}

test('load() returns empty providers when mappings.json missing', () => {
  const { customDir } = tempHome();
  const { load } = require('../extension/providers');
  const result = load(customDir);
  assert.equal(result.version, 1);
  assert.deepEqual(result.providers, []);
});

test('save() then load() round-trips a mapping', () => {
  const { customDir } = tempHome();
  const { load, save } = require('../extension/providers');
  const mappings = {
    version: 1,
    providers: [{
      id: 'example',
      label: 'Example',
      url: 'https://api.example.com/v1/usage',
      method: 'GET',
      headers: { Authorization: 'Bearer ${apiKey}' },
      mapping: {
        used:      { path: '$.data.used' },
        total:     { path: '$.data.total' },
        percent:   { path: '$.data.remaining_pct', invert: true },
        resetTime: { path: '$.data.reset_at', unit: 's' }
      },
      display: { order: 1, showPercent: true, showTimeLeft: true },
      refreshIntervalMinutes: 5
    }]
  };
  save(customDir, mappings);
  const loaded = load(customDir);
  assert.deepEqual(loaded, mappings);
});

test('save() is atomic (uses .tmp + rename)', () => {
  const { customDir } = tempHome();
  const { save } = require('../extension/providers');
  save(customDir, { version: 1, providers: [] });
  // .tmp file should NOT exist after save
  assert.equal(fs.existsSync(path.join(customDir, 'mappings.json.tmp')), false);
  // main file should exist
  assert.equal(fs.existsSync(path.join(customDir, 'mappings.json')), true);
});

test('load() throws on invalid JSON', () => {
  const { customDir } = tempHome();
  fs.writeFileSync(path.join(customDir, 'mappings.json'), '{ bad json');
  const { load } = require('../extension/providers');
  assert.throws(() => load(customDir), /invalid JSON/i);
});

test('add() appends a new provider', () => {
  const { customDir } = tempHome();
  const { load, add } = require('../extension/providers');
  const result = add(customDir, {
    id: 'first',
    label: 'First',
    url: 'https://a.example.com'
  });
  assert.equal(result.id, 'first');
  const loaded = load(customDir);
  assert.equal(loaded.providers.length, 1);
  assert.equal(loaded.providers[0].id, 'first');
});

test('add() preserves existing providers', () => {
  const { customDir } = tempHome();
  const { add } = require('../extension/providers');
  add(customDir, { id: 'first', label: 'First', url: 'https://a' });
  add(customDir, { id: 'second', label: 'Second', url: 'https://b' });
  const { load } = require('../extension/providers');
  const loaded = load(customDir);
  assert.deepEqual(loaded.providers.map(p => p.id), ['first', 'second']);
});

test('remove() deletes a provider by id', () => {
  const { customDir } = tempHome();
  const { add, remove, load } = require('../extension/providers');
  add(customDir, { id: 'first', label: 'First', url: 'https://a' });
  add(customDir, { id: 'second', label: 'Second', url: 'https://b' });
  remove(customDir, 'first');
  const loaded = load(customDir);
  assert.deepEqual(loaded.providers.map(p => p.id), ['second']);
});

test('remove() on missing id is a no-op', () => {
  const { customDir } = tempHome();
  const { remove, load } = require('../extension/providers');
  remove(customDir, 'nonexistent');
  assert.deepEqual(load(customDir).providers, []);
});

test('reorder() updates display.order to match new order', () => {
  const { customDir } = tempHome();
  const { add, reorder, load } = require('../extension/providers');
  add(customDir, { id: 'a', label: 'A', url: 'https://a' });
  add(customDir, { id: 'b', label: 'B', url: 'https://b' });
  add(customDir, { id: 'c', label: 'C', url: 'https://c' });
  reorder(customDir, ['c', 'a', 'b']);
  const loaded = load(customDir);
  const orders = Object.fromEntries(loaded.providers.map(p => [p.id, p.display.order]));
  assert.equal(orders.c, 1);
  assert.equal(orders.a, 2);
  assert.equal(orders.b, 3);
});

test('getApiKey() returns null when not set', async () => {
  const { customDir } = tempHome();
  const { getApiKey } = require('../extension/providers');
  assert.equal(await getApiKey('any'), null);
});

test('setApiKey() then getApiKey() round-trips', async () => {
  const { customDir } = tempHome();
  const { setApiKey, getApiKey } = require('../extension/providers');
  await setApiKey('my-id', 'secret-value');
  assert.equal(await getApiKey('my-id'), 'secret-value');
});

test('deleteApiKey() removes a key', async () => {
  const { customDir } = tempHome();
  const { setApiKey, getApiKey, deleteApiKey } = require('../extension/providers');
  await setApiKey('my-id', 'secret-value');
  await deleteApiKey('my-id');
  assert.equal(await getApiKey('my-id'), null);
});

test('injected storage is used instead of in-memory default', async () => {
  const store = new Map();
  const storage = {
    get: async (k) => store.has(k) ? store.get(k) : null,
    store: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); }
  };
  const { setApiKey, getApiKey, _setStorage } = require('../extension/providers');
  _setStorage(storage);
  await setApiKey('a', 'b');
  assert.equal(await getApiKey('a'), 'b');
});
