const fsp = require('node:fs/promises');
const path = require('node:path');

/**
 * Recursively copy a directory tree from src to dest.
 * Creates dest if it doesn't exist.
 */
async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Install the companion analyzer skill by copying SKILL.md + templates/
 * from `sourceDir` into `destDir`.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir - Absolute path to bundled skill dir (contains SKILL.md + templates/)
 * @param {string} opts.destDir   - Absolute path to Claude Code's skills slot (e.g. ~/.claude/skills/custom-api-usage-analyze)
 * @param {boolean} opts.overwrite - If true, replace existing files. If false, skip when destDir is non-empty.
 * @returns {Promise<{installed: boolean, skipped: boolean, error?: string}>}
 */
async function installSkill({ sourceDir, destDir, overwrite }) {
  try {
    await fsp.access(sourceDir);
  } catch {
    throw new Error(`sourceDir not found: ${sourceDir}`);
  }

  // If destDir exists and is non-empty and overwrite=false, skip
  let destExists = false;
  try {
    const stat = await fsp.stat(destDir);
    destExists = stat.isDirectory();
  } catch {
    destExists = false;
  }

  if (destExists && !overwrite) {
    const entries = await fsp.readdir(destDir);
    if (entries.length > 0) {
      return { installed: false, skipped: true };
    }
  }

  await copyDir(sourceDir, destDir);
  return { installed: true, skipped: false };
}

module.exports = { installSkill, copyDir };
