const test = require('node:test');
const assert = require('node:assert/strict');

const { extract, renderStatusBar } = require('../extension/fetcher');

const sampleRaw = {
  data: {
    models: [
      {
        name: 'example-model',
        usage: {
          used: 45,
          limit: 100,
          remaining_percent: 55,
          reset_at_seconds: 1717670400  // 2024-06-06 (approx)
        }
      }
    ]
  }
};

const exampleProvider = {
  id: 'example-api',
  label: 'Example API',
  url: 'https://api.example.com/v1/usage',
  method: 'GET',
  headers: { Authorization: 'Bearer ${apiKey}' },
  mapping: {
    used:      { path: '$.data.models[0].usage.used' },
    total:     { path: '$.data.models[0].usage.limit' },
    percent:   { path: '$.data.models[0].usage.remaining_percent', invert: true },
    resetTime: { path: '$.data.models[0].usage.reset_at_seconds', unit: 's' }
  },
  display: { order: 1, showPercent: true, showTimeLeft: true }
};

test('extract() resolves all 4 fields with full mapping', () => {
  const result = extract(exampleProvider, sampleRaw);
  assert.equal(result.used, 45);
  assert.equal(result.total, 100);
  // remaining_percent is 55, invert → 100 - 55 = 45
  assert.equal(result.percent, 45);
  // reset_at_seconds * 1000 (unit conversion)
  assert.equal(result.resetTimeMs, 1717670400000);
});

test('extract() returns null for fields with no matching path', () => {
  const provider = {
    ...exampleProvider,
    mapping: {
      used:      { path: '$.nonexistent.used' },
      total:     { path: '$.data.models[0].usage.limit' },
      percent:   null,
      resetTime: null
    }
  };
  const result = extract(provider, sampleRaw);
  assert.equal(result.used, null);
  assert.equal(result.total, 100);
  assert.equal(result.percent, null);
  assert.equal(result.resetTimeMs, null);
});

test('extract() takes first match when path returns multiple values', () => {
  const raw = { items: [{ count: 10 }, { count: 20 }] };
  const provider = {
    ...exampleProvider,
    mapping: { used: { path: '$.items[*].count' }, total: null, percent: null, resetTime: null }
  };
  const result = extract(provider, raw);
  assert.equal(result.used, 10);
});

test('extract() handles missing mapping object', () => {
  const result = extract({ ...exampleProvider, mapping: null }, sampleRaw);
  assert.equal(result.used, null);
  assert.equal(result.total, null);
  assert.equal(result.percent, null);
  assert.equal(result.resetTimeMs, null);
});

test('renderStatusBar() shows label, percent, and time-left when all data present', () => {
  // Future time: 1 hour from now
  const oneHourFromNow = Date.now() + 3600000;
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: oneHourFromNow };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /⚡ Example API/);
  assert.match(result.text, /45%/);
  assert.match(result.text, /\(1h\d+m\)/);
});

test('renderStatusBar() omits time-left when resetTimeMs is null', () => {
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.text.includes('('), false);
  assert.match(result.text, /45%/);
});

test('renderStatusBar() omits percent when null but shows time-left', () => {
  const oneHourFromNow = Date.now() + 3600000;
  const extracted = { used: null, total: null, percent: null, resetTimeMs: oneHourFromNow };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /⚡ Example API/);
  assert.equal(result.text.includes('%'), false);
  assert.match(result.text, /\(1h\d+m\)/);
});

test('renderStatusBar() shows (expired) for past reset time', () => {
  const past = Date.now() - 60000;  // 1 minute ago
  const extracted = { used: 100, total: 100, percent: 100, resetTimeMs: past };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /expired/);
});

test('renderStatusBar() applies red color when percent >= 90', () => {
  const extracted = { used: 95, total: 100, percent: 95, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, 'error');
  assert.equal(result.backgroundColor, 'error');
});

test('renderStatusBar() applies yellow color when 75 <= percent < 90', () => {
  const extracted = { used: 80, total: 100, percent: 80, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, 'warning');
  assert.equal(result.backgroundColor, 'warning');
});

test('renderStatusBar() applies no color when percent < 75', () => {
  const extracted = { used: 50, total: 100, percent: 50, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, undefined);
  assert.equal(result.backgroundColor, undefined);
});

test('renderStatusBar() respects showPercent: false', () => {
  const provider = { ...exampleProvider, display: { ...exampleProvider.display, showPercent: false } };
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: null };
  const result = renderStatusBar(provider, extracted);
  assert.equal(result.text.includes('%'), false);
});
