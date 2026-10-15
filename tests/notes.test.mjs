import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks, syncBuiltinESMExports } from 'node:module';

const home = mkdtempSync(join(tmpdir(), 'ysk-test-'));
after(() => rmSync(home, { recursive: true, force: true }));
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'node:os') return { url: data(`export const homedir = () => ${JSON.stringify(home)}`), shortCircuit: true };
  if (specifier === '@earendil-works/pi-coding-agent') return { url: data('export class DynamicBorder {}; export const getMarkdownTheme = () => ({}); export const convertToLlm = (messages) => messages'), shortCircuit: true };
  if (specifier === '@earendil-works/pi-tui') return { url: data('export class Container {}; export class Markdown {}; export class Text {}; export const matchesKey = () => false'), shortCircuit: true };
  return next(specifier, context);
}});
delete process.env.PI_CODING_AGENT_DIR;
const { default: extension } = await import(process.env.YSK_TEST_SOURCE ?? '../extensions/you-should-know/index.ts');
function open(session, sessionDir = home, mode = 'rpc', options = {}) {
  const handlers = new Map();
  const registered = [];
  const notices = [];
  const widgets = [];
  let command;
  extension({ on: (event, handler) => { registered.push(event); handlers.set(event, handler); }, registerCommand: (_, value) => { command = value.handler; }, registerShortcut() {} });
  const ctx = {
    mode, hasUI: options.hasUI ?? false, isIdle: () => false,
    model: options.model,
    modelRegistry: options.modelRegistry,
    getSystemPrompt: () => 'fixture system prompt',
    sessionManager: { getSessionDir: () => sessionDir, getSessionId: () => session, buildSessionProjection: () => ({ messages: [] }) },
    ui: { notify: (message) => notices.push(message), setWidget: (name, value) => widgets.push({ name, value }) },
  };
  handlers.get('session_start')({}, ctx);
  return { registered, notices, widgets, command: (text) => command(text, ctx), input: (text) => handlers.get('input')({ source: 'rpc', text }, ctx), turnStart: (turnIndex) => handlers.get('turn_start')({ turnIndex }, ctx), close: () => handlers.get('session_shutdown')({}, ctx) };
}
const state = () => { const file = join(home, '.pi/agent/you-should-know/state.json'); return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { known: [], ignoredInARow: 0, skip: 0 }; };
const logs = () => { const file = join(home, '.pi/agent/you-should-know/checks.jsonl'); return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []; };
const notesFile = (session) => JSON.parse(readFileSync(join(home, 'artifacts', session, 'you-should-know.json'), 'utf8'));
const CONFIG_DIR = join(home, '.pi/agent/you-should-know');
const resetState = () => { mkdirSync(CONFIG_DIR, { recursive: true }); writeFileSync(join(CONFIG_DIR, 'state.json'), JSON.stringify({ enabled: true, seen: [], known: [], ignoredInARow: 0, skip: 0 })); };
const setConfig = (config) => { mkdirSync(CONFIG_DIR, { recursive: true }); if (config) writeFileSync(join(CONFIG_DIR, 'config.json'), JSON.stringify(config)); else rmSync(join(CONFIG_DIR, 'config.json'), { force: true }); };
const sideModel = (line) => ({ model: { id: 'fixture/model', api: 'openai-completions', provider: 'fixture' }, modelRegistry: { streamSimple: () => ({ result: async () => ({ content: [{ type: 'text', text: line() }], usage: {}, stopReason: 'stop' }) }) } });
const waitChecks = async (baseline, count) => {
  for (let i = 0; i < 10000; i++) {
    if (logs().filter((entry) => entry.event === 'check').length >= baseline + count) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('timed out waiting for checks');
};

describe('notes', { concurrency: false }, () => {
test('registers no boundary events: any boundary handler (turn_end, agent_before_settle) makes Pi rebuild agent.state.messages each turn and defeats cacheWarming "idle" (pi#10956)', () => {
  const client = open('boundary-events');
  try {
    assert.ok(client.registered.includes('turn_start'), 'detection must stay scheduled via turn_start');
    for (const boundary of ['turn_end', 'agent_before_settle']) {
      assert.equal(client.registered.includes(boundary), false, `must not register boundary event ${boundary}`);
    }
  } finally { client.close(); }
});

test('RPC prompts count ignored notes and back off, but ysk commands do not', async () => {
  const client = open('backoff');
  for (let i = 0; i < 3; i++) await client.command('test');
  client.input('/ysk status');
  client.input('first user prompt');
  await client.command('status');
  assert.match(client.notices.at(-1), /skip 0/);
  client.input('second user prompt');
  assert.equal(state().ignoredInARow, 3);
  assert.equal(state().skip, 1);
  client.close();
});

 test('a failed atomic replacement preserves the previous session notes', async () => {
  const client = open('interrupted-write');
  await client.command('test');
  const file = join(home, 'artifacts/interrupted-write/you-should-know.json');
  const before = readFileSync(file, 'utf8');
  const rename = fs.renameSync;
  try {
    fs.renameSync = (source, target) => { if (target === file) throw new Error('simulated interrupted replacement'); return rename(source, target); };
    syncBuiltinESMExports();
    await assert.rejects(client.command('test'), /simulated interrupted replacement/);
    assert.equal(readFileSync(file, 'utf8'), before);
    assert.equal(existsSync(file + '.tmp-' + process.pid), false);
  } finally { fs.renameSync = rename; syncBuiltinESMExports(); client.close(); }
});

test('temporary Pi discovery sessions do not create artifacts in the working directory', async () => {
  const cwd = process.cwd();
  process.chdir(home);
  try {
    const client = open('temporary-discovery', '');
    await client.command('test');
    client.close();
    assert.equal(existsSync(join(home, 'artifacts/temporary-discovery')), false);
  } finally { process.chdir(cwd); }
});

test('TUI /ysk clear dismisses every note, logs via clear, and resets backoff', async () => {
  const client = open('clear-all', home, 'tui');
  for (let i = 0; i < 3; i++) await client.command('test');
  client.input('first user prompt');
  client.input('second user prompt');
  assert.ok(state().ignoredInARow > 0);
  const before = logs().length;
  await client.command('clear');
  assert.match(client.notices.at(-1), /Dismissed 3 notes/);
  assert.equal(notesFile('clear-all').notes.length, 0);
  assert.equal(client.widgets.at(-1).name, 'you-should-know');
  assert.equal(client.widgets.at(-1).value, undefined);
  const dismissals = logs().slice(before).filter((entry) => entry.event === 'answer');
  assert.equal(dismissals.length, 3);
  for (const entry of dismissals) {
    assert.equal(entry.answer, 'dismiss');
    assert.equal(entry.via, 'clear');
    assert.equal(entry.line, 'This is a test note from /ysk test.');
  }
  assert.equal(state().ignoredInARow, 0);
  assert.equal(state().skip, 0);
  client.close();
});

test('TUI /ysk clear with no notes does not log answers or reset backoff', async () => {
  const client = open('clear-empty', home, 'tui');
  for (let i = 0; i < 3; i++) await client.command('test');
  client.input('first user prompt');
  client.input('second user prompt');
  await client.command('off');
  await client.command('on');
  const before = state();
  assert.ok(before.ignoredInARow > 0);
  const answerLogs = logs().filter((entry) => entry.event === 'answer').length;
  await client.command('clear');
  assert.match(client.notices.at(-1), /No notes to dismiss/);
  assert.equal(state().ignoredInARow, before.ignoredInARow);
  assert.equal(state().skip, before.skip);
  assert.equal(logs().filter((entry) => entry.event === 'answer').length, answerLogs);
  client.close();
});

test('RPC /ysk clear leaves notes in place', async () => {
  const client = open('clear-rpc');
  for (let i = 0; i < 2; i++) await client.command('test');
  assert.equal(notesFile('clear-rpc').notes.length, 2);
  const id = client.notices.findLast((message) => message.includes('[ysk:')).match(/\[ysk:([^\]]+)\]/)[1];
  await client.command('clear');
  assert.match(client.notices.at(-1), /Answer notes where your client shows them/);
  assert.equal(notesFile('clear-rpc').notes.length, 2);
  await client.command(`answer ${id} dismiss`);
  assert.equal(notesFile('clear-rpc').notes.length, 1);
  client.close();
});

test('unconfigured TUI cap stays 5: the sixth note drops the oldest', async () => {
  resetState();
  setConfig(undefined);
  let n = 0;
  const client = open('cap-five', home, 'tui', { hasUI: true, ...sideModel(() => `learn: cap five note ${++n}`) });
  try {
    const checkBase = logs().filter((entry) => entry.event === 'check').length;
    const logBase = logs().length;
    for (let i = 1; i <= 6; i++) { client.turnStart(i * 6); await waitChecks(checkBase, i); }
    for (const entry of logs().slice(logBase).filter((entry) => entry.event === 'check')) assert.equal(entry.outcome, 'shown');
    const drops = logs().slice(logBase).filter((entry) => entry.event === 'overflow_dropped');
    assert.equal(drops.length, 1);
    assert.equal(drops[0].line, 'cap five note 1');
    assert.deepEqual(notesFile('cap-five').notes.map((note) => note.line), ['cap five note 2', 'cap five note 3', 'cap five note 4', 'cap five note 5', 'cap five note 6']);
  } finally { client.close(); }
});

test('maxNotes 2 drops the oldest note when the third arrives in TUI', async () => {
  resetState();
  setConfig({ maxNotes: 2 });
  let n = 0;
  const client = open('cap-two', home, 'tui', { hasUI: true, ...sideModel(() => `learn: cap two note ${++n}`) });
  try {
    const checkBase = logs().filter((entry) => entry.event === 'check').length;
    const logBase = logs().length;
    for (let i = 1; i <= 3; i++) { client.turnStart(i * 6); await waitChecks(checkBase, i); }
    for (const entry of logs().slice(logBase).filter((entry) => entry.event === 'check')) assert.equal(entry.outcome, 'shown');
    const drops = logs().slice(logBase).filter((entry) => entry.event === 'overflow_dropped');
    assert.equal(drops.length, 1);
    assert.equal(drops[0].line, 'cap two note 1');
    assert.deepEqual(notesFile('cap-two').notes.map((note) => note.line), ['cap two note 2', 'cap two note 3']);
  } finally { setConfig(undefined); client.close(); }
});

test('invalid maxNotes fails the check before any fork', async () => {
  resetState();
  let n = 0;
  const client = open('cap-bad', home, 'tui', { hasUI: true, ...sideModel(() => `learn: must not show ${++n}`) });
  try {
    for (const value of [0, 'three']) {
      setConfig({ maxNotes: value });
      const logBase = logs().length;
      client.turnStart(6);
      for (let i = 0; i < 10000 && logs().length <= logBase; i++) await new Promise((resolve) => setImmediate(resolve));
      const entry = logs().slice(logBase).find((entry) => entry.event === 'check');
      assert.ok(entry, `no check logged for maxNotes ${JSON.stringify(value)}`);
      assert.equal(entry.outcome, 'error');
      assert.match(String(entry.error), /YSK maxNotes must be a positive integer/);
    }
    assert.equal(notesFile('cap-bad').notes.length, 0);
    assert.equal(n, 0);
  } finally { setConfig(undefined); client.close(); }
});
});
