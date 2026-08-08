const assert = require('assert');
const path = require('path');
const { makeTheRule, buildPrompt } = require('../src/app-script/helper.js');

console.log('=== Task 3: Gemini Prompt Confluence Verification ===\n');

// 1. Verify function exports
assert.strictEqual(typeof makeTheRule, 'function', 'makeTheRule must be exported as a function');
assert.strictEqual(typeof buildPrompt, 'function', 'buildPrompt must be exported as a function');
console.log('✔ exports check passed');

// 2. Generate prompt for a sample query
const testQuery = 'Giá dưới 1 triệu, cao 1m65, nặng 50kg, ở HN, vòng 1 trên 90';
const prompt = makeTheRule(testQuery, true);

// 3. Perform assertions on prompt contents
const checks = [
    {
        name: 'Price conversion rules',
        patterns: ['500k', '500.000', '500 nghìn', '1 triệu', '1tr', '1000', '1.5 triệu', '1tr5', '1500']
    },
    {
        name: 'Height/Weight conversion rules',
        patterns: ['1m65', '165cm', '165', '50kg', '50']
    },
    {
        name: 'Age to birth year mapping with reference year 2026',
        patterns: ['2026', 'dưới 25 tuổi', '2001', 'trên 20 tuổi', '2006', 'từ 20 đến 25 tuổi', 'sinh năm 2000']
    },
    {
        name: '3-Sizes sub-fields mapping',
        patterns: ['vòng 1', 'Số đồ 3 vòng.bust', 'vòng 3', 'Số đồ 3 vòng.hip']
    },
    {
        name: 'Location normalization',
        patterns: ['HN', 'Hà Nội', 'SG', 'HCM', 'Hồ Chí Minh', 'ĐN', 'Đà Nẵng']
    },
    {
        name: 'Input query interpolation',
        patterns: [testQuery]
    }
];

let failed = 0;
for (const check of checks) {
    console.log(`Checking ${check.name}...`);
    for (const pattern of check.patterns) {
        if (prompt.includes(pattern)) {
            console.log(`  [PASS] Contains: "${pattern}"`);
        } else {
            console.error(`  [FAIL] Missing pattern: "${pattern}"`);
            failed++;
        }
    }
}

if (failed > 0) {
    console.error(`\n❌ Verification failed with ${failed} missing pattern(s).`);
    process.exit(1);
} else {
    console.log('\n✅ All Task 3 prompt confluence checks passed successfully!');
}
