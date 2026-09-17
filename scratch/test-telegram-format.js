const assert = require('assert');
const { groupByKey, filterValidPhoneData } = require('../src/app-script/filter.js');
global.groupByKey = groupByKey;
global.filterValidPhoneData = filterValidPhoneData;

const {
    escapeHtml,
    cleanPhoneNumber,
    formatResultItem,
    buildResultMessages
} = require('../src/app-script/telegram.js');

console.log("=== Testing Telegram Message Formatting & Batching ===");

// Test 1: cleanPhoneNumber
console.log("\n1. Testing cleanPhoneNumber...");
assert.strictEqual(cleanPhoneNumber(" '0901234567 "), "0901234567");
assert.strictEqual(cleanPhoneNumber("+84901234567"), "+84901234567");
assert.strictEqual(cleanPhoneNumber("090-123-4567"), "0901234567");
assert.strictEqual(cleanPhoneNumber(""), "");
console.log("✔ cleanPhoneNumber passed.");

// Test 2: formatResultItem
console.log("\n2. Testing formatResultItem (tap-to-copy code chip)...");
const sampleItem = {
    "Số điện thoại": " '0901234567 ",
    "Giá": "500k",
    "Năm Sinh": 2002,
    "Chiều Cao": "1m65",
    "Cân Nặng": "48kg",
    "Số đồ 3 vòng": { bust: 92, waist: 60, hip: 90 }
};
const formatted = formatResultItem(sampleItem);
console.log("Formatted item:\n", formatted);

assert.ok(formatted.includes("<code>0901234567</code>"), "Phone must be in <code>...</code> for one-tap copy");
assert.ok(formatted.includes("500k"), "Includes price");
assert.ok(formatted.includes("NS: 2002"), "Includes birth year");
assert.ok(formatted.includes("1m65, 48kg"), "Includes height/weight");
assert.ok(!formatted.includes("V1"), "Bust size must not be shown");
assert.ok(!formatted.includes("92"), "No measurement value leaks into the line");
console.log("✔ formatResultItem passed.");

// Test 3: buildResultMessages with 50 items across multiple areas
console.log("\n3. Testing consolidated buildResultMessages (preventing message flood)...");
const manyItems = [];
const areas = ["Cầu Giấy", "Đống Đa", "Ba Đình", "Hai Bà Trưng", "Hoàn Kiếm", "Tây Hồ"];
for (let i = 1; i <= 50; i++) {
    manyItems.push({
        "Số điện thoại": `09010000${String(i).padStart(2, '0')}`,
        "Giá": `${400 + (i % 5) * 100}k`,
        "Năm Sinh": 1998 + (i % 8),
        "Khu Vực": areas[i % areas.length],
        "Chiều Cao": "1m65",
        "Cân Nặng": "48kg",
        "Số đồ 3 vòng": { bust: 90 + (i % 5) }
    });
}

const messages = buildResultMessages(manyItems, 30);
console.log(`Generated ${messages.length} Telegram message(s) for 50 items (maxDisplay: 30)`);
console.log("\n--- Message 1 Preview ---:\n" + messages[0]);

// Assertions
assert.ok(messages.length <= 2, `Should be consolidated into 1 or 2 messages max, got ${messages.length}`);
assert.ok(messages[0].includes("Tìm thấy 50 kết quả (hiển thị 30 đầu)"), "Summary count header present");
assert.ok(messages[messages.length - 1].includes("Nhấn vào số điện thoại để sao chép nhanh"), "Copy tip present");
assert.ok(messages[messages.length - 1].includes("Còn 20 kết quả khác"), "Overflow indicator present");

for (const msg of messages) {
    assert.ok(msg.length <= 3800, `Message length ${msg.length} must be <= 3800 chars`);
}

console.log("✔ Consolidated buildResultMessages passed all tests.");
console.log("\n=================================================");
console.log("✅ ALL TELEGRAM TESTS PASSED SUCCESSFULLY! ✅");
console.log("=================================================");
