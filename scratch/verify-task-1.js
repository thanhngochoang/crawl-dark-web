const assert = require('assert');
const path = require('path');

const {
    removeUnicode,
    normalizeText,
    coerceNumber,
    getFieldValue,
    OPERATORS,
    matchFilter,
    applyFilters,
} = require(path.resolve(__dirname, '../src/app-script/filter.js'));

console.log('--- Starting Task 1 Verification Tests ---');

// 1. removeUnicode
console.log('Testing removeUnicode...');
assert.strictEqual(removeUnicode('Tiếng Việt có dấu: đ/Đ'), 'Tieng Viet co dau: d/D');
assert.strictEqual(removeUnicode('Đà Nẵng'), 'Da Nang');
assert.strictEqual(removeUnicode(''), '');
assert.strictEqual(removeUnicode(null), '');
assert.strictEqual(removeUnicode(undefined), '');

// 2. normalizeText
console.log('Testing normalizeText...');
assert.strictEqual(normalizeText('  Đà Nẵng  '), 'da nang');
assert.strictEqual(normalizeText('HÀ NỘI'), 'ha noi');
assert.strictEqual(normalizeText(null), '');
assert.strictEqual(normalizeText(123), '123');

// 3. coerceNumber
console.log('Testing coerceNumber...');
assert.strictEqual(coerceNumber('500k'), 500);
assert.strictEqual(coerceNumber('1.5 triệu'), 1500);
assert.strictEqual(coerceNumber('1tr'), 1000);
assert.strictEqual(coerceNumber('1m65'), 165);
assert.strictEqual(coerceNumber('50kg'), 50);
assert.strictEqual(coerceNumber('165cm'), 165);
assert.strictEqual(coerceNumber(500), 500);
assert.ok(Number.isNaN(coerceNumber('invalid')));
assert.ok(Number.isNaN(coerceNumber('')));
assert.ok(Number.isNaN(coerceNumber(null)));
assert.ok(Number.isNaN(coerceNumber(undefined)));

// 4. getFieldValue
console.log('Testing getFieldValue...');
assert.strictEqual(getFieldValue({ 'Giá': 500 }, 'Giá'), 500);
assert.strictEqual(getFieldValue({ 'Số đồ 3 vòng': { bust: 90 } }, 'Số đồ 3 vòng.bust'), 90);
assert.strictEqual(getFieldValue({ 'Số đồ 3 vòng.bust': 95, 'Số đồ 3 vòng': { bust: 90 } }, 'Số đồ 3 vòng.bust'), 95);
assert.strictEqual(getFieldValue({ a: null }, 'a.b'), undefined);
assert.strictEqual(getFieldValue(null, 'Giá'), undefined);

// 5. OPERATORS
console.log('Testing OPERATORS...');
// ==
assert.strictEqual(OPERATORS['==']('Hà Nội', 'ha noi'), true);
assert.strictEqual(OPERATORS['==']('500k', 500), true);
assert.strictEqual(OPERATORS['==']('Hà Nội', 'Sài Gòn'), false);
// !=
assert.strictEqual(OPERATORS['!=']('500k', 500), false);
assert.strictEqual(OPERATORS['!=']('Hà Nội', 'Sài Gòn'), true);
// >
assert.strictEqual(OPERATORS['>']('600k', '500k'), true);
assert.strictEqual(OPERATORS['>'](new Date('2026-02-01'), new Date('2026-01-01')), true);
assert.strictEqual(OPERATORS['>']('b', 'a'), true);
// <
assert.strictEqual(OPERATORS['<']('1.5 triệu', '2tr'), true);
assert.strictEqual(OPERATORS['<'](new Date('2026-01-01'), new Date('2026-02-01')), true);
// >=
assert.strictEqual(OPERATORS['>=']('500k', 500), true);
assert.strictEqual(OPERATORS['>=']('1tr', '500k'), true);
assert.strictEqual(OPERATORS['>=']('100k', '500k'), false);
// <=
assert.strictEqual(OPERATORS['<=']('500k', 500), true);
assert.strictEqual(OPERATORS['<=']('100k', '500k'), true);
// contains
assert.strictEqual(OPERATORS['contains']('Khu vực Hà Nội', 'ha noi'), true);
assert.strictEqual(OPERATORS['contains']('TP.HCM', 'ha noi'), false);
// in
assert.strictEqual(OPERATORS['in']('Hà Nội', ['ha noi', 'ho chi minh']), true);
assert.strictEqual(OPERATORS['in']('Đà Nẵng', ['ha noi', 'ho chi minh']), false);
assert.strictEqual(OPERATORS['in']('Hà Nội', 'not an array'), false);

// 6. applyFilters
console.log('Testing applyFilters...');
// Simple rule
const simpleRule = { field: 'Giá', operator: '>=', value: '500k' };
assert.strictEqual(applyFilters({ 'Giá': 600 }, simpleRule), true);
assert.strictEqual(applyFilters({ 'Giá': 400 }, simpleRule), false);

// Dot-notation rule
const dotRule = { field: 'Số đồ 3 vòng.bust', operator: '>=', value: 85 };
assert.strictEqual(applyFilters({ 'Số đồ 3 vòng': { bust: 90 } }, dotRule), true);

// Complex nested AND/OR rule
const nestedRule = {
    logic: 'and',
    filters: [
        { field: 'Khu Vực', operator: 'contains', value: 'ha noi' },
        {
            logic: 'or',
            filters: [
                { field: 'Giá', operator: '<=', value: '1tr' },
                { field: 'Chiều Cao', operator: '>=', value: '1m70' },
            ],
        },
    ],
};

assert.strictEqual(applyFilters({ 'Khu Vực': 'Hà Nội', 'Giá': '800k', 'Chiều Cao': '1m65' }, nestedRule), true);
assert.strictEqual(applyFilters({ 'Khu Vực': 'Sài Gòn', 'Giá': '800k', 'Chiều Cao': '1m65' }, nestedRule), false);
assert.strictEqual(applyFilters({ 'Khu Vực': 'Hà Nội', 'Giá': '1.5tr', 'Chiều Cao': '1m65' }, nestedRule), false);
assert.strictEqual(applyFilters({ 'Khu Vực': 'Hà Nội', 'Giá': '1.5tr', 'Chiều Cao': '1m75' }, nestedRule), true);

console.log('✅ ALL TESTS PASSED CLEANLY!');
