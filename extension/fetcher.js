const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const RAW_DIR = 'raw';

const { JSONPath } = require('jsonpath-plus');

/**
 * Evaluate JSONPath for each fixed field. Apply invert / unit transforms.
 * Returns { used, total, percent, resetTimeMs } — any may be null.
 */
function extract(provider, raw) {
  const mapping = provider.mapping || {};
  const result = { used: null, total: null, percent: null, resetTimeMs: null };

  if (mapping.used) {
    result.used = resolveNumber(mapping.used.path, raw);
  }
  if (mapping.total) {
    result.total = resolveNumber(mapping.total.path, raw);
  }
  if (mapping.percent) {
    let pct = resolveNumber(mapping.percent.path, raw);
    if (pct !== null) {
      if (mapping.percent.invert) pct = 100 - pct;
      result.percent = Math.max(0, Math.min(100, Math.round(pct)));
    }
  }
  if (mapping.resetTime) {
    const raw_val = resolveNumber(mapping.resetTime.path, raw);
    if (raw_val !== null) {
      const unit = mapping.resetTime.unit || (raw_val > 1e12 ? 'ms' : 's');
      result.resetTimeMs = unit === 's' ? raw_val * 1000 : raw_val;
    }
  }

  return result;
}

function resolveNumber(path, raw) {
  if (!path) return null;
  try {
    const matches = JSONPath({ path, json: raw });
    if (!matches || matches.length === 0) return null;
    const v = matches[0];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

function renderStatusBar(provider, extracted) {
  const showPct = provider.display?.showPercent !== false;
  const showTime = provider.display?.showTimeLeft !== false;
  const label = provider.label || provider.id || 'Provider';
  const pct = extracted.percent;
  const resetTimeMs = extracted.resetTimeMs;

  const parts = [`⚡ ${label}`];
  if (showPct && pct !== null) {
    parts.push(`${pct}%`);
  }
  if (showTime && resetTimeMs !== null) {
    if (resetTimeMs > Date.now()) {
      const remaining = resetTimeMs - Date.now();
      parts.push(formatDuration(remaining));
    } else {
      parts.push('(expired)');
    }
  }

  const text = parts.join(' ');
  const color = pct === null ? undefined : pct >= 90 ? 'error' : pct >= 75 ? 'warning' : undefined;
  const backgroundColor = color;

  return { text, color, backgroundColor };
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  let inner;
  if (hours > 0) {
    inner = `${hours}h${mins}m`;
  } else if (mins > 0) {
    inner = `${mins}m`;
  } else {
    inner = '<1m';
  }
  return `(${inner})`;
}

/**
 * Fetch URL, save raw to <customDir>/raw/<id>.json, return parsed JSON.
 * `getApiKey` is an async function (id) => string | null for resolving ${apiKey}.
 * Throws on non-2xx, non-JSON, or network error. Does NOT write raw on error.
 *
 * `customDir` is the full path to the user's config dir
 * (e.g. `~/.custom-api-usage`), matching `providers.load()` / `providers.save()`.
 */
function fetchAndCache(provider, customDir, getApiKey) {
  return new Promise(async (resolve, reject) => {
    let url;
    try {
      url = new URL(provider.url);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${provider.url}`));
    }
    const lib = url.protocol === 'https:' ? https : http;

    // Resolve ${apiKey} in headers
    let resolvedHeaders = {};
    for (const [k, v] of Object.entries(provider.headers || {})) {
      if (typeof v === 'string' && v.includes('${apiKey}')) {
        const key = await getApiKey(provider.id);
        resolvedHeaders[k] = v.replace('${apiKey}', key || '');
      } else {
        resolvedHeaders[k] = v;
      }
    }

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: provider.method || 'GET',
      headers: resolvedHeaders
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return reject(new Error(`Invalid JSON: ${body.slice(0, 80)}`));
        }
        // Only write on success
        try {
          const rawDir = path.join(customDir, RAW_DIR);
          fs.mkdirSync(rawDir, { recursive: true });
          fs.writeFileSync(path.join(rawDir, `${provider.id}.json`), JSON.stringify(parsed, null, 2));
        } catch (err) {
          // Cache write failure is non-fatal; we still return parsed data
          console.error(`[fetcher] failed to cache raw: ${err.message}`);
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout after 10s'));
    });
    req.end();
  });
}

module.exports = { extract, renderStatusBar, fetchAndCache };
