const assert = require('assert');

// ---- Minimal Google Apps Script runtime mocks -------------------------------
const store = {};
const cacheStore = {};
let triggers = [];
let fetchCalls = [];

global.Logger = { log: (m) => { if (String(m).includes("ERROR")) console.log(m); } };
global.PropertiesService = {
    getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; },
        getProperties: () => ({ ...store }),
    }),
};
global.CacheService = {
    getScriptCache: () => ({
        get: (k) => (k in cacheStore ? cacheStore[k] : null),
        put: (k, v) => { cacheStore[k] = String(v); },
        remove: (k) => { delete cacheStore[k]; },
        removeAll: (keys) => keys.forEach(k => delete cacheStore[k]),
    }),
};
global.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
};
global.ContentService = {
    createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
    MimeType: { JSON: 'json' },
};
global.ScriptApp = {
    newTrigger: (fn) => ({
        timeBased: () => ({ after: () => ({ create: () => { const t = { fn, id: triggers.length + 1 }; triggers.push(t); return t; } }) }),
    }),
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { triggers = triggers.filter(x => x !== t); },
    getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/X/exec' }),
};
global.UrlFetchApp = {
    fetch: (url, opts) => {
        fetchCalls.push({ url, payload: opts && opts.payload ? JSON.parse(opts.payload) : null });
        return { getContentText: () => JSON.stringify({ ok: true, result: {} }), getResponseCode: () => 200 };
    },
};

store.TELEGRAM_BOT_TOKEN = 'tok';
store.TELEGRAM_CHAT_ID = '123';

Object.assign(global, require('../src/app-script/config.js'));
const filter = require('../src/app-script/filter.js');
Object.assign(global, filter);
const tg = require('../src/app-script/telegram.js');
Object.assign(global, tg);

// AI + sheet stubs: return one matching record
global.resolveRule = () => ({ rule: { logic: 'and', filters: [] }, source: 'ai' });
global.getSheetData = () => [{ 'Số điện thoại': '0901111111', 'Giá': '500k', 'Khu Vực': 'Cầu Giấy' }];
global.getSheetName = () => 'AllData';

function makeEvent(updateId, text) {
    return {
        postData: {
            type: 'application/json',
            contents: JSON.stringify({
                update_id: updateId,
                message: { message_id: updateId * 10, chat: { id: 123, type: 'private' }, from: { first_name: 'A' }, text },
            }),
        },
    };
}

console.log('=== Testing Telegram webhook queue architecture ===');

// 1. Webhook must ACK immediately: no Telegram sendMessage, one job enqueued, one trigger scheduled
console.log('\n1. Webhook enqueues and returns OK without sending...');
const res1 = tg.handleTelegramWebhook(makeEvent(1001, 'hà nội dưới 500k'));
assert.strictEqual(res1.text, 'OK');
const sends = fetchCalls.filter(c => c.url.includes('/sendMessage'));
assert.strictEqual(sends.length, 0, 'webhook must not call sendMessage synchronously');
const jobKeys = Object.keys(store).filter(k => k.startsWith('TG_JOB_'));
assert.strictEqual(jobKeys.length, 1, 'exactly one job enqueued');
assert.strictEqual(triggers.length, 1, 'one processor trigger scheduled');
console.log('✔ ACK-first webhook works.');

// 2. Telegram retry of the same update_id must be a no-op
console.log('\n2. Retry of same update_id is skipped...');
tg.handleTelegramWebhook(makeEvent(1001, 'hà nội dưới 500k'));
tg.handleTelegramWebhook(makeEvent(1001, 'hà nội dưới 500k'));
assert.strictEqual(Object.keys(store).filter(k => k.startsWith('TG_JOB_')).length, 1, 'still one job');
assert.strictEqual(triggers.length, 1, 'still one trigger (no duplicate scheduling)');
console.log('✔ Duplicate updates deduplicated.');

// 3. A second distinct update queues a second job but reuses the pending trigger
console.log('\n3. Second update queues without extra trigger...');
tg.handleTelegramWebhook(makeEvent(1002, '/help'));
assert.strictEqual(Object.keys(store).filter(k => k.startsWith('TG_JOB_')).length, 2, 'two jobs');
assert.strictEqual(triggers.length, 1, 'still one trigger');
console.log('✔ Trigger coalescing works.');

// 4. Processor drains the queue in order, sends exactly once per job, and cleans up its triggers
console.log('\n4. Queue processor drains jobs and sends each result once...');
fetchCalls = [];
tg.processTelegramQueue();
const sent = fetchCalls.filter(c => c.url.includes('/sendMessage'));
assert.strictEqual(sent.length, 2, `expected 2 sendMessage calls, got ${sent.length}`);
assert.ok(sent[0].payload.text.includes('0901111111'), 'first job (query) result sent first');
assert.ok(sent[1].payload.text.includes('Xin chào'), 'second job (/help) sent second');
assert.strictEqual(Object.keys(store).filter(k => k.startsWith('TG_JOB_')).length, 0, 'queue empty');
assert.strictEqual(triggers.length, 0, 'processor triggers removed');
console.log('✔ Processor works.');

// 5. Re-running the processor with an empty queue sends nothing
console.log('\n5. Idle processor is a no-op...');
fetchCalls = [];
tg.processTelegramQueue();
assert.strictEqual(fetchCalls.filter(c => c.url.includes('/sendMessage')).length, 0);
console.log('✔ Idle processor is safe.');

// 6. Chat ID mismatch is rejected at webhook time and never enqueued
console.log('\n6. Unauthorized chat is not enqueued...');
fetchCalls = [];
const badEvt = makeEvent(2001, 'x');
const parsed = JSON.parse(badEvt.postData.contents);
parsed.message.chat.id = 999;
badEvt.postData.contents = JSON.stringify(parsed);
tg.handleTelegramWebhook(badEvt);
assert.strictEqual(Object.keys(store).filter(k => k.startsWith('TG_JOB_')).length, 0, 'no job for foreign chat');
console.log('✔ Auth still enforced.');

console.log('\n======================================================');
console.log('✅ ALL WEBHOOK QUEUE TESTS PASSED ✅');
console.log('======================================================');
