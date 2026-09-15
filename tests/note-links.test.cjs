const test = require('node:test');
const assert = require('node:assert/strict');
const { noteLink } = require('../src/note-links');
const root = '/vault/notes';
test('opens absolute note links and preserves heading and Unicode', () => {
  assert.equal(noteLink('/vault/notes/*Interview/Sources/面试知识点记录.md#第五条', root), '*Interview/Sources/面试知识点记录.md#第五条');
  assert.equal(noteLink('app://obsidian.md/vault/notes/AI%20Agents/test.md', root), 'AI Agents/test.md');
  assert.equal(noteLink('file:///vault/notes/a.md#heading', root), 'a.md#heading');
});
test('preserves wiki, relative, and heading-only links', () => {
  for (const link of ['知识点', '../Sources/a.md#one', '#heading']) assert.equal(noteLink(link, root), link);
});
test('does not intercept external URLs or files outside the vault', () => {
  for (const link of ['https://example.com', 'mailto:a@example.com', 'obsidian://open?vault=other', '/vault/notes-other/private.md', '/vault/notes/../secret.md', '%ZZ']) assert.equal(noteLink(link, root), null);
});
