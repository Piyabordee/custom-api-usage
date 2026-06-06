const vscode = require('vscode');
const path = require('node:path');
const os = require('node:os');
const providers = require('./providers');
const { fetchAndCache, extract, renderStatusBar } = require('./fetcher');

const CUSTOM_DIR = path.join(os.homedir(), '.custom-api-usage');
const PREFIX = 'customApiUsage';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Per-provider state
const state = {
  items: new Map(),   // id → StatusBarItem
  timers: new Map(),  // id → NodeJS.Timeout
  lastExtracted: new Map()  // id → {used,total,percent,resetTimeMs}
};

let mappingsWatcher = null;

async function activate(context) {
  // Inject VSCode SecretStorage into providers
  providers._setStorage(context.secrets);

  // Initial load
  await rebuildFromDisk(context);

  // Watch mappings.json for external edits
  startMappingsWatcher(context);

  // Register commands
  registerCommands(context);
}

function deactivate() {
  if (mappingsWatcher) mappingsWatcher.dispose();
  for (const t of state.timers.values()) clearInterval(t);
}

async function rebuildFromDisk(context) {
  let mappings;
  try {
    mappings = providers.load(CUSTOM_DIR);
  } catch (err) {
    vscode.window.showErrorMessage(`custom-api-usage: failed to load mappings: ${err.message}`);
    return;
  }

  // Dispose old items/timers
  for (const item of state.items.values()) item.dispose();
  for (const t of state.timers.values()) clearInterval(t);
  state.items.clear();
  state.timers.clear();
  state.lastExtracted.clear();

  // Sort by display.order
  const sorted = [...mappings.providers].sort((a, b) =>
    (a.display?.order ?? 999) - (b.display?.order ?? 999)
  );

  for (let i = 0; i < sorted.length; i++) {
    const provider = sorted[i];
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100000 - i
    );
    item.command = `${PREFIX}.showDetails`;
    state.items.set(provider.id, item);
    context.subscriptions.push(item);

    // Stagger first fetch
    setTimeout(() => refreshOne(context, provider), i * 10000);
    // Schedule periodic refresh
    const interval = (provider.refreshIntervalMinutes || 5) * 60 * 1000;
    const timer = setInterval(() => refreshOne(context, provider), interval);
    state.timers.set(provider.id, timer);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  }
}

async function refreshOne(context, provider) {
  const item = state.items.get(provider.id);
  if (!item) return;

  // Show loading state
  item.text = `$(sync~spin) ${provider.label || provider.id}...`;
  item.color = undefined;
  item.backgroundColor = undefined;
  item.tooltip = `Refreshing ${provider.label || provider.id}...`;
  item.show();

  // Check if mapping exists
  if (!provider.mapping || !provider.mapping.used) {
    item.text = `$(warning) ${provider.label || provider.id}: Needs analyze`;
    item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.tooltip = `Run /custom-api-usage-analyze ${provider.id} in Claude Code to generate mapping.`;
    item.show();
    return;
  }

  // Check API key
  const apiKey = await providers.getApiKey(provider.id);
  if (!apiKey) {
    item.text = `$(key) ${provider.label || provider.id}: Set API Key`;
    item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.command = `${PREFIX}.setApiKey`;
    item.tooltip = `Click to set API key for ${provider.label || provider.id}`;
    item.show();
    return;
  }

  // Fetch + extract
  try {
    const raw = await fetchAndCache(provider, CUSTOM_DIR, (id) => providers.getApiKey(id));
    const extracted = extract(provider, raw);
    state.lastExtracted.set(provider.id, extracted);
    const rendered = renderStatusBar(provider, extracted);
    item.text = rendered.text;
    if (rendered.color === 'error') {
      item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (rendered.color === 'warning') {
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      item.color = undefined;
      item.backgroundColor = undefined;
    }
    item.command = `${PREFIX}.showDetails`;
    const mins = provider.refreshIntervalMinutes || 5;
    item.tooltip = `${provider.label || provider.id}\nRefreshes every ${mins} min — click for details`;
    item.show();
  } catch (err) {
    item.text = `$(warning) ${provider.label || provider.id}: Error`;
    item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.command = `${PREFIX}.refresh`;
    item.tooltip = `Error: ${err.message} — click to retry`;
    item.show();
  }
}

function startMappingsWatcher(context) {
  if (mappingsWatcher) mappingsWatcher.dispose();
  const pattern = new vscode.RelativePattern(path.dirname(CUSTOM_DIR), path.basename(CUSTOM_DIR) + '/mappings.json');
  mappingsWatcher = vscode.workspace.createFileSystemWatcher(pattern);
  mappingsWatcher.onDidChange(() => rebuildFromDisk(context));
  mappingsWatcher.onDidCreate(() => rebuildFromDisk(context));
  context.subscriptions.push(mappingsWatcher);
}

function registerCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(`${PREFIX}.showDetails`, () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers configured.');
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        'customApiUsageDetails',
        'Custom API Usage',
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      const cards = mappings.providers
        .sort((a, b) => (a.display?.order ?? 999) - (b.display?.order ?? 999))
        .map(p => {
          const ex = state.lastExtracted.get(p.id) || { used: null, total: null, percent: null, resetTimeMs: null };
          const rendered = renderStatusBar(p, ex);
          const pct = ex.percent;
          const barColor = pct === null ? '#888' : pct >= 90 ? '#e05c5c' : pct >= 75 ? '#e0a85c' : '#4f98a3';
          const barWidth = pct === null ? 0 : pct;
          return `
            <div style="margin-bottom: 24px; padding: 12px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 8px;">
              <h2 style="margin: 0 0 8px 0; font-size: 1.1em;">${escapeHtml(p.label)}</h2>
              <div style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">
                <code>${escapeHtml(p.method || 'GET')} ${escapeHtml(p.url)}</code>
              </div>
              <div style="margin-bottom: 8px; font-size: 0.9em;">${escapeHtml(rendered.text || '—')}</div>
              ${pct !== null ? `<div style="background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 999px; height: 8px; margin-bottom: 4px;"><div style="width: ${barWidth}%; background: ${barColor}; height: 100%; border-radius: 999px;"></div></div><div style="font-size: 0.75em; color: var(--vscode-descriptionForeground);">${pct}% used</div>` : ''}
              ${ex.used !== null || ex.total !== null ? `<div style="margin-top: 8px; font-size: 0.8em;">Used: ${ex.used ?? '—'} / Total: ${ex.total ?? '—'}</div>` : ''}
            </div>`;
        })
        .join('');

      panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.25em; margin-bottom: 16px; }
</style>
</head><body>
<h1>Custom API Usage — ${mappings.providers.length} provider(s)</h1>
${cards}
</body></html>`;
    }),

    vscode.commands.registerCommand(`${PREFIX}.refresh`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      for (const p of mappings.providers) {
        await refreshOne(context, p);
      }
    }),

    vscode.commands.registerCommand(`${PREFIX}.addProvider`, async () => {
      const label = await vscode.window.showInputBox({
        prompt: 'Provider label (e.g. "Example API")',
        placeHolder: 'Example API',
        ignoreFocusOut: true
      });
      if (!label?.trim()) return;

      const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const url = await vscode.window.showInputBox({
        prompt: 'API URL',
        placeHolder: 'https://api.example.com/v1/usage',
        ignoreFocusOut: true
      });
      if (!url?.trim()) return;

      const key = await vscode.window.showInputBox({
        prompt: `API key for "${label}"`,
        password: true,
        placeHolder: 'Paste API key...',
        ignoreFocusOut: true
      });
      if (!key?.trim()) return;

      // Save provider (no mapping yet) + secret
      providers.add(CUSTOM_DIR, { id, label: label.trim(), url: url.trim() });
      await providers.setApiKey(id, key.trim());

      // Try to fetch raw so the skill has something to analyze
      vscode.window.showInformationMessage(
        `custom-api-usage: provider "${label}" added. ` +
        `Now run /custom-api-usage-analyze ${id} in Claude Code to generate the mapping.`
      );

      await rebuildFromDisk(context);
    }),

    vscode.commands.registerCommand(`${PREFIX}.setApiKey`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers configured. Use "Add Provider" first.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        mappings.providers.map(p => ({ label: p.label, id: p.id })),
        { placeHolder: 'Select provider to update API key' }
      );
      if (!picked) return;

      const key = await vscode.window.showInputBox({
        prompt: `New API key for "${picked.label}"`,
        password: true,
        placeHolder: 'Paste new API key...',
        ignoreFocusOut: true
      });
      if (!key?.trim()) return;

      await providers.setApiKey(picked.id, key.trim());
      vscode.window.showInformationMessage(`custom-api-usage: API key updated for "${picked.label}".`);
      await rebuildFromDisk(context);
    }),

    vscode.commands.registerCommand(`${PREFIX}.reorderProviders`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length < 2) {
        vscode.window.showInformationMessage('Need at least 2 providers to reorder.');
        return;
      }
      const sorted = [...mappings.providers].sort((a, b) =>
        (a.display?.order ?? 999) - (b.display?.order ?? 999)
      );
      const picked = await vscode.window.showQuickPick(
        sorted.map((p, i) => ({ label: `${i + 1}. ${p.label}`, id: p.id })),
        { placeHolder: 'Select the new FIRST provider (rest will follow in current order)' }
      );
      if (!picked) return;
      const idx = sorted.findIndex(p => p.id === picked.id);
      const reordered = [...sorted.slice(idx), ...sorted.slice(0, idx)].map(p => p.id);
      providers.reorder(CUSTOM_DIR, reordered);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage('custom-api-usage: providers reordered.');
    }),

    vscode.commands.registerCommand(`${PREFIX}.removeProvider`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers to remove.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        mappings.providers.map(p => ({ label: p.label, id: p.id, description: p.url })),
        { placeHolder: 'Select provider to remove' }
      );
      if (!picked) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove "${picked.label}" and delete its API key?`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;
      providers.remove(CUSTOM_DIR, picked.id);
      await providers.deleteApiKey(picked.id);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage(`custom-api-usage: "${picked.label}" removed.`);
    }),

    vscode.commands.registerCommand(`${PREFIX}.exportMappings`, async () => {
      try {
        const mappings = providers.load(CUSTOM_DIR);
        await vscode.env.clipboard.writeText(JSON.stringify(mappings, null, 2));
        vscode.window.showInformationMessage(
          `custom-api-usage: mappings.json copied to clipboard (${mappings.providers.length} provider(s)).`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand(`${PREFIX}.importMappings`, async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text?.trim()) {
        vscode.window.showInformationMessage('Clipboard is empty.');
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        vscode.window.showErrorMessage(`Clipboard is not valid JSON: ${err.message}`);
        return;
      }
      if (!parsed.version || !Array.isArray(parsed.providers)) {
        vscode.window.showErrorMessage('Clipboard JSON does not look like a mappings file (missing version or providers).');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Import ${parsed.providers.length} provider(s)? This will REPLACE your current mappings.json.`,
        { modal: true },
        'Replace'
      );
      if (confirm !== 'Replace') return;
      providers.save(CUSTOM_DIR, parsed);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage(`custom-api-usage: ${parsed.providers.length} provider(s) imported. Re-enter API keys for each.`);
    })
  );
}

module.exports = { activate, deactivate };
