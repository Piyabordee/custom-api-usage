const fs = require('node:fs');
const path = require('node:path');

const FILE = 'mappings.json';

// In-memory storage (default for tests). Real impl injected from extension.js.
let storage = {
  _data: new Map(),
  async get(k) { return this._data.has(k) ? this._data.get(k) : null; },
  async store(k, v) { this._data.set(k, v); },
  async delete(k) { this._data.delete(k); }
};

function _setStorage(vscodeSecrets) {
  storage = vscodeSecrets;
}

function _secretKey(id) {
  return `customApiUsage.providers.${id}.apiKey`;
}

function load(customDir) {
  const filePath = path.join(customDir, FILE);
  if (!fs.existsSync(filePath)) {
    return { version: 1, providers: [] };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`mappings.json: invalid JSON: ${err.message}`);
  }
}

function save(customDir, mappings) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(mappings, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function ensureDir(customDir) {
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }
}

function add(customDir, { id, label, url, method = 'GET', headers = {}, mapping = null, display = null, refreshIntervalMinutes = 5 }) {
  ensureDir(customDir);
  const mappings = load(customDir);
  const existing = mappings.providers.find(p => p.id === id);
  if (existing) {
    Object.assign(existing, { label, url, method, headers, refreshIntervalMinutes });
    save(customDir, mappings);
    return existing;
  }
  const provider = {
    id,
    label,
    url,
    method,
    headers,
    mapping,
    display: display || { order: mappings.providers.length + 1, showPercent: true, showTimeLeft: true },
    refreshIntervalMinutes
  };
  mappings.providers.push(provider);
  save(customDir, mappings);
  return provider;
}

function remove(customDir, id) {
  const mappings = load(customDir);
  const before = mappings.providers.length;
  mappings.providers = mappings.providers.filter(p => p.id !== id);
  if (mappings.providers.length !== before) {
    save(customDir, mappings);
  }
}

function reorder(customDir, idsInOrder) {
  const mappings = load(customDir);
  for (let i = 0; i < idsInOrder.length; i++) {
    const provider = mappings.providers.find(p => p.id === idsInOrder[i]);
    if (provider) {
      if (!provider.display) provider.display = {};
      provider.display.order = i + 1;
    }
  }
  save(customDir, mappings);
}

async function getApiKey(id) {
  return await storage.get(_secretKey(id));
}

async function setApiKey(id, key) {
  await storage.store(_secretKey(id), key);
}

async function deleteApiKey(id) {
  await storage.delete(_secretKey(id));
}

module.exports = { load, save, add, remove, reorder, getApiKey, setApiKey, deleteApiKey, _setStorage };
