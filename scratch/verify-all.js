const assert = require('assert');
const path = require('path');
const {
    _dataQueryMemoryCache,
    DataQuery,
    applyFilters,
    matchFilter,
    filterByText,
    orderBy,
    groupByKey,
    distinctByFields,
    partitionArray,
    removeUnicode
} = require('../src/app-script/filter.js');
const { buildPrompt } = require('../src/app-script/helper.js');

console.log('====================================================');
console.log('=== Task 4: Complete E2E Confluent Verification ===');
console.log('====================================================\n');

// 1. Mock raw Google Sheet items dataset
const mockSheetItems = [
    {
        "ID": 1,
        "Số điện thoại": "0901111111",
        "Giá": "500k",
        "Chiều Cao": "1m65",
        "Cân Nặng": "48kg",
        "Khu Vực": "Hà Nội",
        "Năm Sinh": 2001,
        "Số đồ 3 vòng": { bust: 92, waist: 60, hip: 90 }
    },
    {
        "ID": 2,
        "Số điện thoại": "0902222222",
        "Giá": "1.2 triệu", // > 1000
        "Chiều Cao": "1m70",
        "Cân Nặng": "52kg",
        "Khu Vực": "Hà Nội",
        "Năm Sinh": 2003,
        "Số đồ 3 vòng": { bust: 94, waist: 62, hip: 92 }
    },
    {
        "ID": 3,
        "Số điện thoại": "0903333333",
        "Giá": "800k",
        "Chiều Cao": "160cm", // < 165
        "Cân Nặng": "48kg",
        "Khu Vực": "HN",
        "Năm Sinh": 1999, // < 2001 (Age 27 > 25)
        "Số đồ 3 vòng": { bust: 90, waist: 60, hip: 90 }
    },
    {
        "ID": 4,
        "Số điện thoại": "0904444444",
        "Giá": "1tr5", // > 1000
        "Chiều Cao": "1m68",
        "Cân Nặng": "50kg",
        "Khu Vực": "HCM", // not HN/Hà Nội
        "Năm Sinh": 2001,
        "Số đồ 3 vòng": { bust: 85, waist: 58, hip: 88 } // bust < 90
    },
    {
        "ID": 5,
        "Số điện thoại": "0905555555",
        "Giá": "900k",
        "Chiều Cao": "1m67",
        "Cân Nặng": "48kg",
        "Khu Vực": "HN",
        "Năm Sinh": 2002,
        "Số đồ 3 vòng": { bust: 91, waist: 61, hip: 89 }
    }
];

// Test Section 1: Complex Confluent Rule Filter Simulation
console.log('--- Test 1: Confluent Multi-Condition Rule Filtering ---');
{
    // Rule matching:
    // a) Price <= 1000 ("Giá dưới 1 triệu")
    // b) Height >= 165 ("Chiều Cao từ 1m65")
    // c) Location in ["HN", "Hà Nội"] or contains "HN" / "Hà Nội"
    // d) Age <= 25 (Năm Sinh >= 2001)
    // e) 3-sizes bust >= 90 ("Vòng 1 trên 90")
    const parsedRule = {
        logic: "and",
        filters: [
            { field: "Giá", operator: "<=", value: 1000 },
            { field: "Chiều Cao", operator: ">=", value: 165 },
            {
                logic: "or",
                filters: [
                    { field: "Khu Vực", operator: "contains", value: "Hà Nội" },
                    { field: "Khu Vực", operator: "contains", value: "HN" }
                ]
            },
            { field: "Năm Sinh", operator: ">=", value: 2001 },
            { field: "Số đồ 3 vòng.bust", operator: ">=", value: 90 }
        ]
    };

    const results = DataQuery.from(mockSheetItems).applyRule(parsedRule).execute();

    assert.strictEqual(results.length, 2, 'Should match exactly 2 items (ID 1 and ID 5)');
    const resultIds = results.map(r => r.ID);
    assert.deepStrictEqual(resultIds, [1, 5], 'Matching items should be ID 1 and ID 5');
    console.log('✔ Test 1 passed: Confluent rule filter returned items [1, 5]');
}

// Test Section 2: DataQuery.fromSheet & Caching across multiple calls
console.log('\n--- Test 2: DataQuery.fromSheet() & Caching Behavior ---');
{
    let getSheetDataCallCount = 0;
    const testSheetName = '08-08-2026';

    global.getSheetName = () => testSheetName;
    global.getSheetData = (sName) => {
        getSheetDataCallCount++;
        return mockSheetItems;
    };

    const mockScriptCacheStore = new Map();
    const mockRemovedKeys = [];
    global.CacheService = {
        getScriptCache: () => ({
            get: (key) => mockScriptCacheStore.get(key) || null,
            put: (key, val, ttl) => mockScriptCacheStore.set(key, val),
            removeAll: (keys) => {
                mockRemovedKeys.push(...keys);
                for (const k of keys) mockScriptCacheStore.delete(k);
            }
        })
    };

    // First call: calls getSheetData and populates memory + script cache
    const query1 = DataQuery.fromSheet(testSheetName);
    assert.strictEqual(getSheetDataCallCount, 1, 'getSheetData should be called on first fetch');
    assert.strictEqual(query1.execute().length, 5);
    assert.ok(_dataQueryMemoryCache['QUERY_CACHE_' + testSheetName], 'Memory cache populated');
    assert.ok(mockScriptCacheStore.has('QUERY_CACHE_' + testSheetName), 'Script cache populated');

    // Second call: hits memory cache
    const query2 = DataQuery.fromSheet(testSheetName);
    assert.strictEqual(getSheetDataCallCount, 1, 'getSheetData should NOT be called on memory cache hit');
    assert.strictEqual(query2.execute().length, 5);

    // Apply rule on fromSheet
    const priceFilterRule = { field: "Giá", operator: "<=", value: 1000 };
    const filteredFromSheet = DataQuery.fromSheet(testSheetName).applyRule(priceFilterRule).execute();
    assert.strictEqual(filteredFromSheet.length, 3, 'Items with Price <= 1000 should be 3 (ID 1, 3, 5)');

    // Clear cache test
    DataQuery.clearCache();
    assert.strictEqual(Object.keys(_dataQueryMemoryCache).length, 0, 'Memory cache cleared');
    assert.ok(mockRemovedKeys.includes('QUERY_CACHE_' + testSheetName), 'Script cache key removed');

    // Call after clearCache calls getSheetData again
    const query3 = DataQuery.fromSheet(testSheetName);
    assert.strictEqual(getSheetDataCallCount, 2, 'getSheetData called again after clearCache');

    delete global.getSheetName;
    delete global.getSheetData;
    delete global.CacheService;
    DataQuery.clearCache();

    console.log('✔ Test 2 passed: DataQuery.fromSheet caching and clearCache verified');
}

// Test Section 3: Verification of Legacy Top-Level Export Functions
console.log('\n--- Test 3: Legacy Top-Level Export Functions ---');
{
    // 1. applyFilters & matchFilter
    const singleItem = mockSheetItems[0]; // ID 1
    const singleRule = { field: "Chiều Cao", operator: ">=", value: 165 };
    assert.strictEqual(matchFilter(singleItem, singleRule), true, 'matchFilter: ID 1 height >= 165');
    assert.strictEqual(applyFilters(singleItem, singleRule), true, 'applyFilters: ID 1 height >= 165');

    // 2. filterByText
    const textMatches = filterByText(mockSheetItems, 'Ha Noi', ['Khu Vực']);
    assert.strictEqual(textMatches.length, 2, 'filterByText: unaccented "Ha Noi" matches Hà Nội (ID 1, ID 2)');

    // 3. orderBy
    const sortedByPrice = orderBy(mockSheetItems, 'Giá', '+');
    // Coerced prices: 500k(500), 800k(800), 900k(900), 1.2 triệu(1200), 1tr5(1500)
    assert.strictEqual(sortedByPrice[0].ID, 1, 'First item in ascending price sort should be ID 1 (500k)');
    assert.strictEqual(sortedByPrice[4].ID, 4, 'Last item in ascending price sort should be ID 4 (1tr5)');

    // 4. groupByKey
    const groupedByLocation = groupByKey(mockSheetItems, 'Khu Vực');
    assert.ok(groupedByLocation['Hà Nội'], 'Should contain Hà Nội group');
    assert.ok(groupedByLocation['HN'], 'Should contain HN group');
    assert.ok(groupedByLocation['HCM'], 'Should contain HCM group');
    assert.strictEqual(groupedByLocation['HCM'].length, 1);

    // 5. distinctByFields
    const distinctByHeightAndWeight = distinctByFields(mockSheetItems, ['Cân Nặng']);
    // Weights in data: 48kg, 52kg, 50kg -> 3 unique weights
    assert.strictEqual(distinctByHeightAndWeight.length, 3, 'Should have 3 distinct weights');

    // 6. partitionArray
    const [priceUnder1M, priceOver1M] = partitionArray(mockSheetItems, item => applyFilters(item, { field: "Giá", operator: "<=", value: 1000 }));
    assert.strictEqual(priceUnder1M.length, 3, '3 items under or equal to 1M');
    assert.strictEqual(priceOver1M.length, 2, '2 items over 1M');

    // 7. removeUnicode
    const unaccented = removeUnicode('Nguyễn Văn A - Hà Nội');
    assert.strictEqual(unaccented, 'Nguyen Van A - Ha Noi', 'removeUnicode removes accents correctly');

    console.log('✔ Test 3 passed: All legacy export functions verified');
}

console.log('\n====================================================');
console.log('✅ ALL TASK 4 VERIFICATION ASSERTS PASSED CLEANLY! ✅');
console.log('====================================================');
