const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { CodexClient } = require('../src/client');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(responses, selected = 'chosen-model') {
  const filename = path.resolve(__dirname, '../src/plugin.js');
  const localRequire = createRequire(filename);
  const clients = [];
  let now = 1000000;
  class FakeClient extends EventEmitter {
    constructor(executable, cwd) {
      super();
      Object.assign(this, { executable, cwd, closed: false, calls: 0, response: responses.shift() });
      clients.push(this);
    }
    async start() { if (this.response?.startError) throw this.response.startError; this.ready = true; }
    async request() { return { data: [] }; }
    async listModels() {
      this.calls++;
      if (this.response instanceof Error) throw this.response;
      return await this.response;
    }
    close() { this.closed = true; }
  }
  const obsidian = new Proxy({}, { get: (object, key) => object[key] || class {} });
  const context = {
    require: name => name === 'obsidian' ? obsidian : name === './client' ? { CodexClient: FakeClient } : localRequire(name),
    module: { exports: {} }, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    Option: class { constructor(text, value) { Object.assign(this, { text, value }); } }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports.View = CompanionView;', context);
  const Plugin = context.module.exports;
  const plugin = Object.create(Plugin.prototype);
  const views = [{ updates: 0, updateSelectors() { this.updates++; } }];
  Object.assign(plugin, {
    settings: { codexPath: '/codex/current', model: selected, effort: 'medium', sessions: [] },
    models: [], runtimes: new Map(), modals: new Set(),
    app: { vault: { adapter: { getBasePath: () => '/vault' } } },
    saveCalls: 0, async save() { this.saveCalls++; }, views: () => views
  });
  return { plugin, clients, views, Plugin, advance: ms => { now += ms; } };
}

test('reads every model page, hides hidden entries, deduplicates model IDs, and accepts new IDs', async () => {
  const client = new CodexClient('unused', '/vault');
  const calls = [];
  const pages = [
    { data: [{ model: 'old', displayName: 'Old' }, { model: 'hidden', hidden: true }], nextCursor: 'page-2' },
    { data: [{ model: 'future-model', displayName: 'Future model' }, { model: 'old', displayName: 'Updated' }], nextCursor: null }
  ];
  client.request = async (method, params) => { calls.push({ method, params }); return pages.shift(); };
  assert.deepEqual(await client.listModels(), [
    { model: 'old', displayName: 'Updated' }, { model: 'future-model', displayName: 'Future model' }
  ]);
  assert.deepEqual(calls, [
    { method: 'model/list', params: {} }, { method: 'model/list', params: { cursor: 'page-2' } }
  ]);
});

test('rejects repeated pagination cursors instead of looping forever', async () => {
  const client = new CodexClient('unused', '/vault');
  let calls = 0;
  client.request = async () => { calls++; return { data: [], nextCursor: 'same' }; };
  await assert.rejects(client.listModels(), /repeated model-list cursor/);
  assert.equal(calls, 2);
});

test('caches models briefly, refreshes when stale, and permits an immediate forced refresh', async () => {
  const first = [{ model: 'first' }], second = [{ model: 'second' }], third = [{ model: 'third' }];
  const { plugin, clients, views, advance } = setup([first, second, third]);
  await plugin.refreshModels();
  await plugin.refreshModels();
  advance(5 * 60 * 1000 - 1);
  await plugin.refreshModels();
  assert.equal(clients.length, 1);
  assert.equal(plugin.models, first);
  advance(1);
  await plugin.refreshModels();
  assert.equal(plugin.models, second);
  await plugin.refreshModels(true);
  assert.equal(plugin.models, third);
  assert.equal(clients.length, 3);
  assert(clients.every(client => client.closed && client.calls === 1));
  assert.equal(views[0].updates, 3);
  assert.equal(plugin.settings.model, 'chosen-model');
  assert.equal(plugin.saveCalls, 0);
  assert.equal(plugin.catalogClient, null);
  assert.equal(plugin.modelsRefresh, null);
});

test('uses the server default only when no model has been selected', async () => {
  const { plugin } = setup([[{ model: 'first' }, { model: 'server-default', isDefault: true }]], '');
  await plugin.refreshModels();
  assert.equal(plugin.settings.model, 'server-default');
  assert.equal(plugin.saveCalls, 1);
});

test('failed or empty refresh preserves the last catalog, closes its process, and allows retry', async () => {
  const prior = [{ model: 'prior' }], fresh = [{ model: 'fresh' }];
  const { plugin, clients, views } = setup([prior, new Error('catalog unavailable'), [], fresh]);
  await plugin.refreshModels();
  const lastSuccess = plugin.modelsRefreshedAt;
  for (const error of [/catalog unavailable/, /no visible models/]) {
    await assert.rejects(plugin.refreshModels(true), error);
    assert.equal(plugin.models, prior);
    assert.equal(plugin.modelsRefreshedAt, lastSuccess);
    assert.equal(plugin.modelsRefresh, null);
    assert.equal(plugin.catalogClient, null);
    assert.equal(clients.at(-1).closed, true);
    assert.equal(views[0].updates, 1);
  }
  await plugin.refreshModels(true);
  assert.equal(plugin.models, fresh);
});

test('startup failure also closes the metadata client and releases refresh state', async () => {
  const { plugin, clients } = setup([{ startError: new Error('executable missing') }]);
  await assert.rejects(plugin.refreshModels(), /executable missing/);
  assert.equal(clients[0].closed, true);
  assert.equal(clients[0].calls, 0);
  assert.equal(plugin.modelsRefresh, null);
  assert.equal(plugin.catalogClient, null);
});

test('concurrent refresh callers share one metadata request', async () => {
  const result = deferred();
  const { plugin, clients, views } = setup([result.promise]);
  const first = plugin.refreshModels();
  const second = plugin.refreshModels(true);
  await new Promise(setImmediate);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].calls, 1);
  result.resolve([{ model: 'fresh' }]);
  await Promise.all([first, second]);
  assert.equal(views[0].updates, 1);
  assert.equal(clients[0].closed, true);
});

test('refresh from an already connected runtime updates the shared catalog without interrupting chat', async () => {
  const result = deferred(), models = [{ model: 'new-from-server' }];
  const { plugin, clients, views } = setup([result.promise]);
  const runtime = plugin.runtime('chat');
  let starts = 0, closes = 0;
  const activeClient = { ready: true, executable: plugin.settings.codexPath, async start() { starts++; }, close() { closes++; } };
  runtime.client = activeClient;
  runtime.busy = true;
  runtime.activeTurn = 'running-turn';
  const refresh = runtime.connect();
  await Promise.resolve();
  result.resolve(models);
  await refresh;
  assert.equal(plugin.models, models);
  assert.equal(runtime.models, models);
  assert.equal(Object.hasOwn(runtime, 'models'), false);
  assert.equal(runtime.client, activeClient);
  assert.equal(runtime.busy, true);
  assert.equal(runtime.activeTurn, 'running-turn');
  assert.equal(starts, 1);
  assert.equal(closes, 0);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].closed, true);
  assert.equal(views[0].updates, 1);
});

test('changing executable invalidates cache and refreshes a new caller after the obsolete request ends', async () => {
  const result = deferred(), next = [{ model: 'new-executable-model' }], final = [{ model: 'newest' }];
  const { plugin, clients, views } = setup([result.promise, next, final]);
  const prior = plugin.models;
  const pending = plugin.refreshModels();
  plugin.settings.codexPath = '/codex/new';
  const newRequest = plugin.refreshModels();
  result.resolve([{ model: 'stale-executable-model' }]);
  await pending;
  assert.equal(plugin.models, prior);
  assert.equal(views[0].updates, 0);
  await newRequest;
  assert.equal(clients[1].executable, '/codex/new');
  assert.equal(plugin.models, next);
  plugin.settings.codexPath = '/codex/newer';
  await plugin.refreshModels();
  assert.equal(clients.length, 3);
  assert.equal(plugin.models, final);
});

test('an obsolete request failure does not prevent refresh for a newly configured executable', async () => {
  const result = deferred(), next = [{ model: 'new-executable-model' }];
  const { plugin, clients } = setup([result.promise, next]);
  const pending = plugin.refreshModels();
  const rejected = assert.rejects(pending, /old executable failed/);
  plugin.settings.codexPath = '/codex/new';
  const newRequest = plugin.refreshModels();
  result.reject(new Error('old executable failed'));
  await rejected;
  await newRequest;
  assert.equal(clients.length, 2);
  assert.equal(plugin.models, next);
});

test('chat continues with a cached catalog when only its refresh fails', async () => {
  const prior = [{ model: 'prior' }];
  const { plugin, advance } = setup([prior, new Error('offline')]);
  await plugin.refreshModels();
  advance(5 * 60 * 1000);
  const runtime = plugin.runtime('chat');
  runtime.client = { ready: true, executable: plugin.settings.codexPath, async start() {} };
  await runtime.connect();
  assert.equal(plugin.models, prior);
});

test('chat reports catalog failure if no usable catalog exists for the configured executable', async () => {
  const { plugin } = setup([new Error('first load failed'), [{ model: 'prior' }], new Error('new executable failed')]);
  await assert.rejects(plugin.refreshModelsForChat(), /first load failed/);
  await plugin.refreshModels();
  plugin.settings.codexPath = '/codex/new';
  await assert.rejects(plugin.refreshModelsForChat(), /new executable failed/);
});

test('late disconnect from a replaced conversation client cannot stop the new conversation', async () => {
  const { plugin } = setup([undefined, [{ model: 'first' }], undefined, [{ model: 'second' }]]);
  const runtime = plugin.runtime('chat');
  await runtime.connect();
  const oldClient = runtime.client;
  plugin.settings.codexPath = '/codex/new';
  await runtime.connect();
  const newClient = runtime.client;
  let finishes = 0;
  runtime.finish = () => { finishes++; };
  runtime.busy = true;
  runtime.resumed.add('current-thread');
  oldClient.emit('disconnect', new Error('old process exited'));
  assert.equal(runtime.client, newClient);
  assert.equal(runtime.status, 'Connected to Codex');
  assert.equal(runtime.resumed.has('current-thread'), true);
  assert.equal(finishes, 0);
  newClient.emit('disconnect', new Error('current process exited'));
  assert.equal(runtime.resumed.size, 0);
  assert.equal(finishes, 1);
});

test('unloading during refresh closes the client and prevents late UI updates', async () => {
  const result = deferred();
  const { plugin, clients, views } = setup([result.promise]);
  const prior = plugin.models;
  const pending = plugin.refreshModels();
  plugin.onunload();
  assert.equal(clients[0].closed, true);
  result.resolve([{ model: 'too-late' }]);
  await pending;
  assert.equal(plugin.models, prior);
  assert.equal(views[0].updates, 0);
});

test('model picker retains the user selection even when a refreshed catalog omits it', () => {
  const { plugin, Plugin } = setup([]);
  plugin.models = [{ model: 'future-model', displayName: 'Future model' }];
  const select = () => ({ options: [], empty() { this.options = []; }, add(option) { this.options.push(option); } });
  const view = Object.create(Plugin.View.prototype);
  Object.defineProperty(view, 'runtime', { value: { busy: false } });
  Object.assign(view, { plugin, model: select(), effort: select(), historyBtn: {} });
  view.updateSelectors();
  assert.equal(view.model.value, 'chosen-model');
  assert.deepEqual(view.model.options.map(option => option.value), ['future-model', 'chosen-model']);
});
