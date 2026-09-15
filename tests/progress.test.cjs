const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
class Element {
  constructor(tag, options = {}) { this.tag = tag; this.options = options; this.children = []; this.scrollTop = 0; }
  createEl(tag, options) { const child = new Element(tag, options); this.children.push(child); return child; }
  createDiv(options) { return this.createEl('div', options); }
  empty() { this.children = []; }
  setText(text) { this.text = text; }
}
function setup() {
  const filename = path.resolve(__dirname, '../src/plugin.js');
  const localRequire = createRequire(filename);
  const obsidian = new Proxy({ setIcon() {} }, { get: (object, key) => object[key] || class {} });
  const context = { require: name => name === 'obsidian' ? obsidian : localRequire(name), module: { exports: {} }, setTimeout, clearTimeout, navigator: { clipboard: { writeText() {} } } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.View = CompanionView;', context);
  const Plugin = context.module.exports;
  const session = { threadId: 'thread', messages: [] };
  const runtime = Object.create(Plugin.prototype);
  Object.assign(runtime, { busy: true, activeTurn: 'turn1', activeSession: session, save() {}, refresh() {}, view() { return { stream() {}, updateStatus() {} }; } });
  const emit = (method, params) => runtime.notify({ method, params: { threadId: 'thread', turnId: runtime.activeTurn, ...params } });
  const view = Object.create(Plugin.View.prototype);
  Object.defineProperty(view, 'runtime', { value: runtime });
  Object.assign(view, { list: new Element('list'), messageEls: new Map(), session: () => session, cleanRenders() {}, renderMarkdown(el, text) { el.text = text; }, leaf: {}, input: {}, renderChips() {}, renderImages() {}, renderSkillChips() {}, updateSelectors() {}, updateStatus() {}, resizeInput() {}, pinned: false });
  return { session, runtime, emit, view };
}
test('streams progress, groups by turn, then collapses while retaining final answer', () => {
  const { session, emit, view } = setup();
  emit('item/started', { item: { type: 'agentMessage', id: 'p1', phase: 'commentary', text: '' } });
  emit('item/agentMessage/delta', { itemId: 'p1', delta: 'Working' });
  assert.equal(session.messages[0].text, 'Working');
  emit('item/completed', { item: { type: 'agentMessage', id: 'p1', phase: 'commentary', text: 'Working' } });
  emit('item/completed', { item: { type: 'agentMessage', id: 'p2', phase: 'commentary', text: 'Checking' } });
  emit('item/completed', { item: { type: 'agentMessage', id: 'final', phase: 'final_answer', text: 'Done' } });
  view.refresh();
  assert.equal(view.list.children[0].tag, 'details');
  assert.equal(view.list.children[0].open, true);
  assert.equal(view.list.children[0].children.length, 3);
  assert.equal(view.list.children[1].options.cls, 'cc-message cc-assistant');
  emit('turn/completed', { turn: { id: 'turn1', status: 'completed' } });
  view.refresh();
  assert.equal(view.list.children[0].open, false);
  assert.equal(view.messageEls.get('final').text, 'Done');
});
test('keeps unknown legacy messages and errors, does not reopen previous turns', () => {
  const { session, runtime, emit, view } = setup();
  session.messages.push({ id: 'legacy', role: 'assistant', text: 'Old answer' });
  emit('item/completed', { item: { type: 'agentMessage', id: 'old-progress', phase: 'commentary', text: 'Working' } });
  runtime.activeTurn = 'turn2';
  view.refresh();
  assert(view.messageEls.has('legacy'));
  assert.equal(view.list.children[1].open, false);
  emit('item/completed', { item: { type: 'agentMessage', id: 'new-progress', phase: 'commentary', text: 'Again' } });
  emit('turn/completed', { turn: { id: 'turn2', status: 'interrupted' } });
  view.refresh();
  assert.equal(view.list.children.filter(el => el.tag === 'details').length, 2);
  assert(session.messages.some(message => message.role === 'status'));
});
test('ignores messages from another session', () => {
  const { session, emit } = setup();
  emit('item/completed', { threadId: 'other', item: { type: 'agentMessage', id: 'wrong', phase: 'final_answer', text: 'Wrong session' } });
  assert.equal(session.messages.length, 0);
});
