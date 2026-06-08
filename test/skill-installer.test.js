const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Helper: isolated temp workspace with source and dest dirs
async function tempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-skill-test-'));
  const sourceDir = path.join(root, 'source');
  const destDir = path.join(root, 'dest');
  fs.mkdirSync(path.join(sourceDir, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Test Skill\n\nBody.\n');
  fs.writeFileSync(path.join(sourceDir, 'templates', 'mapping.schema.json'), '{"version": 1}\n');
  return { sourceDir, destDir, cleanup: () => fsp.rm(root, { recursive: true, force: true }) };
}

test('installSkill: copies SKILL.md and templates/ recursively into destDir', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.installed, true);
    assert.equal(result.skipped, false);
    const skillExists = await fsp.stat(path.join(destDir, 'SKILL.md')).then(() => true).catch(() => false);
    const schemaExists = await fsp.stat(path.join(destDir, 'templates', 'mapping.schema.json')).then(() => true).catch(() => false);
    assert.equal(skillExists, true, 'SKILL.md should exist in destDir');
    assert.equal(schemaExists, true, 'templates/mapping.schema.json should exist in destDir');
  } finally {
    await cleanup();
  }
});

test('installSkill: creates destDir if it does not exist', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    // destDir intentionally does not exist
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.installed, true);
    const stat = await fsp.stat(destDir);
    assert.equal(stat.isDirectory(), true);
  } finally {
    await cleanup();
  }
});

test('installSkill: with overwrite=false and existing files, returns skipped:true and does not modify', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    // Pre-populate destDir with a different SKILL.md
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.writeFile(path.join(destDir, 'SKILL.md'), '# Pre-existing — should NOT be overwritten');
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.skipped, true);
    assert.equal(result.installed, false);
    const content = await fsp.readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.match(content, /Pre-existing/);
  } finally {
    await cleanup();
  }
});

test('installSkill: with overwrite=true and existing files, replaces them', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.writeFile(path.join(destDir, 'SKILL.md'), '# Pre-existing');
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: true });
    assert.equal(result.installed, true);
    assert.equal(result.skipped, false);
    const content = await fsp.readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.match(content, /Test Skill/);
  } finally {
    await cleanup();
  }
});

test('installSkill: throws if sourceDir does not exist', async () => {
  const { destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    await assert.rejects(
      () => installSkill({ sourceDir: '/nonexistent/path/xyz', destDir, overwrite: false }),
      /sourceDir not found/
    );
  } finally {
    await cleanup();
  }
});
