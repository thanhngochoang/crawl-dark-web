const assert = require('assert');
const { filterValidPhoneData, groupByKey } = require('../src/app-script/filter.js');
const { buildResultMessages } = require('../src/app-script/telegram.js');

console.log("=== Testing Webhook & Query Result Deduplication ===");

// Test 1: filterValidPhoneData deduplication
console.log("\n1. Testing filterValidPhoneData deduplication...");
const rawDatasetWithDuplicates = [
    { "Số điện thoại": "0901111111", "Giá": "500k", "Khu Vực": "Cầu Giấy" },
    { "Số điện thoại": " '0901111111 ", "Giá": "500k", "Khu Vực": "Cầu Giấy" }, // duplicate with quotes
    { "Số điện thoại": "0901111111", "Giá": "500k", "Khu Vực": "Cầu Giấy" }, // duplicate
    { "Số điện thoại": "0902222222", "Giá": "600k", "Khu Vực": "Đống Đa" },
    { "Số điện thoại": "0902222222", "Giá": "600k", "Khu Vực": "Đống Đa" }, // duplicate
    { "Số điện thoại": "", "Giá": "400k", "Khu Vực": "Ba Đình" }, // invalid (no phone)
    { "Số điện thoại": "12345", "Giá": "400k", "Khu Vực": "Ba Đình" } // invalid (< 7 digits)
];

const deduped = filterValidPhoneData(rawDatasetWithDuplicates);
assert.strictEqual(deduped.length, 2, "Should deduplicate 7 items down to exactly 2 unique valid phone items");
assert.strictEqual(deduped[0]["Số điện thoại"], "0901111111");
assert.strictEqual(deduped[1]["Số điện thoại"], "0902222222");
console.log("✔ filterValidPhoneData correctly filtered and deduplicated items.");

// Test 2: buildResultMessages output with clean deduplicated list
console.log("\n2. Testing buildResultMessages on deduplicated data...");
global.groupByKey = groupByKey;
const msgs = buildResultMessages(deduped);
assert.strictEqual(msgs.length, 1, "Should fit cleanly in 1 message");
assert.ok(msgs[0].includes("Tìm thấy 2 kết quả"), "Header shows 2 unique results");
assert.ok(msgs[0].includes("<code>0901111111</code>"), "Includes phone 1");
assert.ok(msgs[0].includes("<code>0902222222</code>"), "Includes phone 2");
console.log("✔ buildResultMessages passed cleanly.");

console.log("\n======================================================");
console.log("✅ ALL DEDUPLICATION TESTS PASSED CLEANLY! ✅");
console.log("======================================================");
