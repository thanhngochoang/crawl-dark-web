const assert = require('assert');
const { parseRuleLocal } = require('../src/app-script/rule-parser.js');
const { applyFilters } = require('../src/app-script/filter.js');

const YEAR = new Date().getFullYear();
let passed = 0;
let failed = 0;

function flat(rule) {
    // Flatten nested groups into a list of leaf filters for easy assertions
    if (!rule) return [];
    if (rule.field) return [rule];
    return (rule.filters || []).flatMap(flat);
}

function leaf(rule, field, operator) {
    return flat(rule).find(f => f.field === field && (!operator || f.operator === operator));
}

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ❌ ${name}\n     ${e.message}`);
    }
}

console.log("=== rule-parser: price ===");
test('gia duoi 500k -> Gia <= 500', () => {
    const r = parseRuleLocal('giá dưới 500k');
    assert.deepStrictEqual(leaf(r, 'Giá'), { field: 'Giá', operator: '<=', value: 500 });
});
test('tren 1tr5 -> Gia >= 1500', () => {
    const r = parseRuleLocal('trên 1tr5');
    assert.deepStrictEqual(leaf(r, 'Giá'), { field: 'Giá', operator: '>=', value: 1500 });
});
test('1.5 trieu -> 1500, 2 củ -> 2000', () => {
    assert.strictEqual(leaf(parseRuleLocal('giá 1.5 triệu'), 'Giá').value, 1500);
    assert.strictEqual(leaf(parseRuleLocal('giá 2 củ'), 'Giá').value, 2000);
});
test('500.000 / 500000 -> 500', () => {
    assert.strictEqual(leaf(parseRuleLocal('giá 500.000'), 'Giá').value, 500);
    assert.strictEqual(leaf(parseRuleLocal('giá 500000'), 'Giá').value, 500);
});
test('tu 500k den 1tr -> range', () => {
    const r = parseRuleLocal('từ 500k đến 1tr');
    assert.deepStrictEqual(leaf(r, 'Giá', '>='), { field: 'Giá', operator: '>=', value: 500 });
    assert.deepStrictEqual(leaf(r, 'Giá', '<='), { field: 'Giá', operator: '<=', value: 1000 });
});
test('500-800k -> range with shared unit', () => {
    const r = parseRuleLocal('500-800k');
    assert.strictEqual(leaf(r, 'Giá', '>=').value, 500);
    assert.strictEqual(leaf(r, 'Giá', '<=').value, 800);
});
test('bare 500k -> Gia == 500', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('500k'), 'Giá'), { field: 'Giá', operator: '==', value: 500 });
});

console.log("\n=== rule-parser: age / birth year ===");
test('2k5 -> Nam Sinh == 2005', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('2k5'), 'Năm Sinh'), { field: 'Năm Sinh', operator: '==', value: 2005 });
});
test('2k5 is not parsed as price', () => {
    assert.strictEqual(leaf(parseRuleLocal('2k5'), 'Giá'), undefined);
});
test('sinh nam 2000 -> ==', () => {
    assert.strictEqual(leaf(parseRuleLocal('sinh năm 2000'), 'Năm Sinh').value, 2000);
});
test('duoi 25 tuoi -> Nam Sinh >= YEAR-25', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('dưới 25 tuổi'), 'Năm Sinh'), { field: 'Năm Sinh', operator: '>=', value: YEAR - 25 });
});
test('tren 20 tuoi -> Nam Sinh <= YEAR-20', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('trên 20 tuổi'), 'Năm Sinh'), { field: 'Năm Sinh', operator: '<=', value: YEAR - 20 });
});
test('tu 20 den 25 tuoi -> range', () => {
    const r = parseRuleLocal('từ 20 đến 25 tuổi');
    assert.strictEqual(leaf(r, 'Năm Sinh', '>=').value, YEAR - 25);
    assert.strictEqual(leaf(r, 'Năm Sinh', '<=').value, YEAR - 20);
});
test('9x -> 1990..1999', () => {
    const r = parseRuleLocal('gái 9x');
    assert.strictEqual(leaf(r, 'Năm Sinh', '>=').value, 1990);
    assert.strictEqual(leaf(r, 'Năm Sinh', '<=').value, 1999);
});

console.log("\n=== rule-parser: height / weight / measurements ===");
test('1m65 -> Chieu Cao == 165, 165cm, cao tren 1m6 -> >= 160', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('1m65'), 'Chiều Cao'), { field: 'Chiều Cao', operator: '==', value: 165 });
    assert.strictEqual(leaf(parseRuleLocal('165cm'), 'Chiều Cao').value, 165);
    assert.deepStrictEqual(leaf(parseRuleLocal('cao trên 1m6'), 'Chiều Cao'), { field: 'Chiều Cao', operator: '>=', value: 160 });
});
test('50kg -> Can Nang == 50, nang duoi 48 -> <= 48', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('50kg'), 'Cân Nặng'), { field: 'Cân Nặng', operator: '==', value: 50 });
    assert.deepStrictEqual(leaf(parseRuleLocal('nặng dưới 48'), 'Cân Nặng'), { field: 'Cân Nặng', operator: '<=', value: 48 });
});
test('vong 1 tren 90 -> bust >=, vong 3 duoi 95 -> hip <=', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('vòng 1 trên 90'), 'Số đồ 3 vòng.bust'), { field: 'Số đồ 3 vòng.bust', operator: '>=', value: 90 });
    assert.deepStrictEqual(leaf(parseRuleLocal('vòng 3 dưới 95'), 'Số đồ 3 vòng.hip'), { field: 'Số đồ 3 vòng.hip', operator: '<=', value: 95 });
});
test('v1 90 -> bust == 90 and not price/year', () => {
    const r = parseRuleLocal('v1 90');
    assert.strictEqual(leaf(r, 'Số đồ 3 vòng.bust').value, 90);
    assert.strictEqual(flat(r).length, 1);
});

console.log("\n=== rule-parser: location ===");
test('HN -> Khu Vuc/Dia chi contains Ha Noi', () => {
    const r = parseRuleLocal('ở HN');
    assert.deepStrictEqual(leaf(r, 'Khu Vực'), { field: 'Khu Vực', operator: 'contains', value: 'Hà Nội' });
    assert.deepStrictEqual(leaf(r, 'Địa chỉ'), { field: 'Địa chỉ', operator: 'contains', value: 'Hà Nội' });
});
test('SG / HCM / sai gon -> Ho Chi Minh', () => {
    for (const q of ['sg', 'hcm', 'sài gòn', 'tphcm']) {
        assert.strictEqual(leaf(parseRuleLocal(q), 'Khu Vực').value, 'Hồ Chí Minh', q);
    }
});
test('HN hoac HCM -> or group of two cities', () => {
    const r = parseRuleLocal('HN hoặc HCM');
    const cities = flat(r).filter(f => f.field === 'Khu Vực').map(f => f.value);
    assert.deepStrictEqual(cities.sort(), ['Hà Nội', 'Hồ Chí Minh']);
    const group = r.filters.find(f => f.logic === 'or');
    assert.ok(group, 'cities must be grouped under an or');
});
test('quanh Cau Giay -> contains cau giay (district alias)', () => {
    assert.strictEqual(leaf(parseRuleLocal('tìm bài quanh Cầu Giấy'), 'Khu Vực').value, 'Cầu Giấy');
});
test('unknown place after keyword "o": o Linh Dam -> contains linh dam', () => {
    assert.strictEqual(leaf(parseRuleLocal('ở Linh Đàm'), 'Khu Vực').value, 'linh dam');
});

console.log("\n=== rule-parser: status / views ===");
test('active -> Trang thai == active; inactive -> == inactive', () => {
    assert.deepStrictEqual(leaf(parseRuleLocal('bài active'), 'Trạng thái'), { field: 'Trạng thái', operator: '==', value: 'active' });
    assert.strictEqual(leaf(parseRuleLocal('inactive'), 'Trạng thái').value, 'inactive');
    assert.strictEqual(leaf(parseRuleLocal('còn hoạt động'), 'Trạng thái').value, 'active');
});
test('luot xem tren 1000 -> Luot Xem >= 1000 (not a price)', () => {
    const r = parseRuleLocal('lượt xem trên 1000');
    assert.deepStrictEqual(leaf(r, 'Lượt Xem'), { field: 'Lượt Xem', operator: '>=', value: 1000 });
    assert.strictEqual(leaf(r, 'Giá'), undefined);
});

console.log("\n=== rule-parser: combined sentences + end-to-end with applyFilters ===");
test('"hà nội dưới 500k 2k5" -> 3 conditions', () => {
    const r = parseRuleLocal('hà nội dưới 500k 2k5');
    assert.strictEqual(leaf(r, 'Khu Vực').value, 'Hà Nội');
    assert.deepStrictEqual(leaf(r, 'Giá'), { field: 'Giá', operator: '<=', value: 500 });
    assert.strictEqual(leaf(r, 'Năm Sinh').value, 2005);
});
test('"Giá từ 500k đến 1.5 triệu và Khu Vực ở HN hoặc HCM" matches prompt example', () => {
    const r = parseRuleLocal('Giá từ 500k đến 1.5 triệu và Khu Vực ở HN hoặc HCM');
    assert.strictEqual(leaf(r, 'Giá', '>=').value, 500);
    assert.strictEqual(leaf(r, 'Giá', '<=').value, 1500);
    assert.deepStrictEqual(flat(r).filter(f => f.field === 'Khu Vực').map(f => f.value).sort(), ['Hà Nội', 'Hồ Chí Minh']);
});
test('"Chiều Cao 1m65, Cân Nặng 50kg, dưới 25 tuổi và vòng 1 trên 90"', () => {
    const r = parseRuleLocal('Chiều Cao 1m65, Cân Nặng 50kg, dưới 25 tuổi và vòng 1 trên 90');
    assert.strictEqual(leaf(r, 'Chiều Cao').value, 165);
    assert.strictEqual(leaf(r, 'Cân Nặng').value, 50);
    assert.strictEqual(leaf(r, 'Năm Sinh').value, YEAR - 25);
    assert.strictEqual(leaf(r, 'Số đồ 3 vòng.bust').value, 90);
    assert.strictEqual(flat(r).length, 4);
});
test('rule from parser works with applyFilters on sheet-shaped items', () => {
    const r = parseRuleLocal('hà nội dưới 500k 2k5 vòng 1 trên 90');
    const ok = { 'Khu Vực': 'Cầu Giấy, Hà Nội', 'Giá': 400, 'Năm Sinh': 2005, 'Số đồ 3 vòng': { bust: 92 } };
    const tooPricey = { ...ok, 'Giá': 600 };
    const wrongCity = { ...ok, 'Khu Vực': 'Đà Nẵng', 'Địa chỉ': 'Hải Châu' };
    assert.strictEqual(applyFilters(ok, r), true);
    assert.strictEqual(applyFilters(tooPricey, r), false);
    assert.strictEqual(applyFilters(wrongCity, r), false);
});
test('nothing recognised -> null', () => {
    assert.strictEqual(parseRuleLocal('xin chào bạn'), null);
    assert.strictEqual(parseRuleLocal(''), null);
    assert.strictEqual(parseRuleLocal(null), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
