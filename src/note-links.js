'use strict';
const path = require('node:path');

// Convert links emitted by Codex to Obsidian vault-relative link text.
function noteLink(href, vaultRoot) {
  if (!href) return null;
  let value = href.replace(/^app:\/\/obsidian\.md\//, '/');
  if (value.startsWith('file://')) {
    try { value = new URL(value).pathname + new URL(value).hash; } catch { return null; }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
    return null;
  }
  try { value = decodeURIComponent(value); } catch { return null; }
  const hash = value.indexOf('#');
  const filename = hash < 0 ? value : value.slice(0, hash);
  const anchor = hash < 0 ? '' : value.slice(hash);
  if (!path.isAbsolute(filename)) return value;
  const relative = path.relative(vaultRoot, filename);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/') + anchor;
}
module.exports = { noteLink };
