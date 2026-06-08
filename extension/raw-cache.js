/**
 * Prime the raw-response cache for a newly-added provider.
 * Best-effort: never throws, returns { ok, error? } so the caller can
 * decide whether to surface a warning toast to the user.
 *
 * @param {object} args
 * @param {object} args.provider       - The provider object (needs id, url, method, headers)
 * @param {string} args.customDir      - Path to ~/.custom-api-usage
 * @param {(id: string) => Promise<string|undefined>} args.getApiKey
 * @param {(provider: object, customDir: string, getApiKey: Function) => Promise<object>} args.fetchAndCache
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function primeRawCache({ provider, customDir, getApiKey, fetchAndCache }) {
  try {
    await fetchAndCache(provider, customDir, getApiKey);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { primeRawCache };
