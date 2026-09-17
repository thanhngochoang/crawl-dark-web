const assert = require('assert');

// Minimal GAS globals so helper.js can be loaded under Node
global.Logger = { log: () => {} };
global.logTrace = () => {};
let cfResponse = null; // null -> Cloudflare not configured
global.getCloudflareAccountId = () => (cfResponse === null ? '' : 'acc');
global.getCloudflareApiToken = () => (cfResponse === null ? '' : 'tok');
global.getCloudflareModel = () => 'model';
global.getGeminiApiKey = () => '';
global.UrlFetchApp = {
    fetch: () => ({
        getContentText: () => JSON.stringify({ success: true, result: { response: cfResponse } }),
    }),
};

const { resolveRule } = require('../src/app-script/helper.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.log(`  ❌ ${name}\n     ${e.message}`); }
}

console.log("=== resolveRule: AI -> local fallback ===");
test('no AI configured -> local parser result, source=local', () => {
    cfResponse = null;
    const res = resolveRule('hà nội dưới 500k', 'trace-1');
    assert.strictEqual(res.source, 'local');
    assert.strictEqual(res.rule.logic, 'and');
    assert.ok(JSON.stringify(res.rule).includes('"Giá"'));
});
test('AI returns invalid JSON -> local fallback', () => {
    cfResponse = 'sorry, I cannot help with that';
    const res = resolveRule('2k5 sài gòn', 'trace-2');
    assert.strictEqual(res.source, 'local');
    assert.ok(JSON.stringify(res.rule).includes('"Năm Sinh"'));
});
test('AI returns valid JSON -> AI rule wins, source=ai', () => {
    cfResponse = '```json\n{"logic":"and","filters":[{"field":"Giá","operator":"<","value":300}]}\n```';
    const res = resolveRule('bất kỳ', 'trace-3');
    assert.strictEqual(res.source, 'ai');
    assert.strictEqual(res.rule.filters[0].value, 300);
});
test('AI JSON without filters array is treated as unusable -> local fallback', () => {
    cfResponse = '{"answer": 42}';
    const res = resolveRule('giá 500k', 'trace-4');
    assert.strictEqual(res.source, 'local');
});
test('AI fails and local finds nothing -> null', () => {
    cfResponse = null;
    assert.strictEqual(resolveRule('xin chào', 'trace-5'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
