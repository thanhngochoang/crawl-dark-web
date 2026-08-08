const assert = require('assert');
const {
    _dataQueryMemoryCache,
    DataQuery,
    orderBy,
    orderByMultiple,
    filterByText,
    distinctByFields,
    groupByKey,
    partitionArray
} = require('../src/app-script/filter.js');

console.log('=== Running Task 2 Verification Tests ===\n');

// Sample test data with nested properties and accented text
const sampleUsers = [
    { id: 1, user: { name: 'Nguyễn Văn A', city: 'Hà Nội', role: 'admin', score: 90, age: '30' } },
    { id: 2, user: { name: 'Trần Thị B', city: 'Đà Nẵng', role: 'user', score: 85, age: '25' } },
    { id: 3, user: { name: 'Lê Văn C', city: 'Hà Nội', role: 'user', score: 95, age: '35' } },
    { id: 4, user: { name: 'nguyen van a', city: 'ha noi', role: 'ADMIN', score: 90, age: '30' } }, // Duplicate logic-wise
    { id: 5, user: { name: 'Pham D', city: 'TP HCM', role: 'manager', score: 70, age: '28' } },
];

// Test 1: DataQuery.from(data) chaining: where, applyRule, filterByText, orderBy, distinctBy, execute
console.log('Test 1: DataQuery.from() chaining & execute()');
{
    const query = DataQuery.from(sampleUsers)
        .where('user.score', '>=', 85)
        .filterByText('ha noi', ['user.city'])
        .orderBy('user.score', '-')
        .distinctBy(['user.name']);

    const results = query.execute();
    assert.strictEqual(results.length, 2, 'Should filter and deduplicate down to 2 items');
    assert.strictEqual(results[0].id, 3, 'Highest score in Hanoi is ID 3 (score 95)');
    assert.strictEqual(results[1].id, 1, 'Second highest score in Hanoi is ID 1 (score 90)');
    console.log('✔ Test 1 passed.');
}

// Test 2: DataQuery chaining with applyRule, orderByMultiple, groupBy, partition
console.log('\nTest 2: DataQuery applyRule, orderByMultiple, groupBy, partition');
{
    const query = DataQuery.from(sampleUsers);
    
    // Test applyRule with logic OR
    query.applyRule({
        logic: 'or',
        filters: [
            { field: 'user.role', operator: '==', value: 'admin' },
            { field: 'user.score', operator: '>', value: 90 }
        ]
    });
    // Expected IDs: 1 (admin), 3 (score 95), 4 (ADMIN - normalized comparison)
    const ruleResults = query.execute();
    assert.strictEqual(ruleResults.length, 3, 'Should match 3 items with OR condition');

    // Test orderByMultiple
    query.orderByMultiple([
        { fieldSort: 'user.role', predicate: '+' },
        { fieldSort: 'user.score', predicate: '-' }
    ]);
    const sorted = query.execute();
    // Roles normalized: 'admin'/'ADMIN' comes before 'user'
    assert.strictEqual(sorted[0].user.role.toLowerCase(), 'admin');

    // Test groupBy
    const grouped = query.groupBy('user.role');
    assert.ok(grouped.admin && grouped.user, 'Should group by user.role');
    assert.strictEqual(grouped.admin.length, 1);
    assert.strictEqual(grouped.ADMIN.length, 1);

    // Test partition
    const [highScorers, lowScorers] = query.partition(item => item.user.score > 90);
    assert.strictEqual(highScorers.length, 1, '1 item with score > 90');
    assert.strictEqual(lowScorers.length, 2, '2 items with score <= 90');
    console.log('✔ Test 2 passed.');
}

// Test 3: DataQuery.fromSheet caching behavior & clearCache
console.log('\nTest 3: DataQuery.fromSheet() caching and clearCache()');
{
    let getSheetDataCalls = 0;
    global.getSheetName = () => 'Sheet_Test';
    global.getSheetData = (sheet) => {
        getSheetDataCalls++;
        return [
            { id: 101, title: 'Item 1' },
            { id: 102, title: 'Item 2' }
        ];
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

    // 1. First fetch: should call getSheetData and store in memory + CacheService
    const q1 = DataQuery.fromSheet();
    assert.strictEqual(getSheetDataCalls, 1, 'getSheetData should be called once');
    assert.strictEqual(q1.execute().length, 2);
    assert.ok(_dataQueryMemoryCache['QUERY_CACHE_Sheet_Test'], 'Memory cache should be populated');
    assert.ok(mockScriptCacheStore.has('QUERY_CACHE_Sheet_Test'), 'CacheService put should be called');

    // 2. Second fetch: should hit memory cache (getSheetDataCalls remains 1)
    const q2 = DataQuery.fromSheet('Sheet_Test');
    assert.strictEqual(getSheetDataCalls, 1, 'getSheetData should NOT be called on memory cache hit');
    assert.strictEqual(q2.execute().length, 2);

    // 3. Clear memory cache only: should hit CacheService
    delete _dataQueryMemoryCache['QUERY_CACHE_Sheet_Test'];
    const q3 = DataQuery.fromSheet('Sheet_Test');
    assert.strictEqual(getSheetDataCalls, 1, 'getSheetData should NOT be called on CacheService hit');
    assert.strictEqual(q3.execute().length, 2);
    assert.ok(_dataQueryMemoryCache['QUERY_CACHE_Sheet_Test'], 'Memory cache repopulated from CacheService');

    // 4. DataQuery.clearCache(): should clear both memory and CacheService
    DataQuery.clearCache();
    assert.strictEqual(Object.keys(_dataQueryMemoryCache).length, 0, 'Memory cache should be empty');
    assert.ok(mockRemovedKeys.includes('QUERY_CACHE_Sheet_Test'), 'CacheService.removeAll should receive cache key');
    assert.strictEqual(mockScriptCacheStore.size, 0, 'CacheService store should be cleared');

    // 5. Fetch after clearCache: should trigger getSheetData again (calls count = 2)
    const q4 = DataQuery.fromSheet('Sheet_Test');
    assert.strictEqual(getSheetDataCalls, 2, 'getSheetData should be called after clearCache()');

    // Cleanup globals
    delete global.getSheetName;
    delete global.getSheetData;
    delete global.CacheService;
    DataQuery.clearCache();

    console.log('✔ Test 3 passed.');
}

// Test 4: Standalone functions with nested/confluent data
console.log('\nTest 4: Standalone functions with confluent data (nested, unaccented, etc.)');
{
    const items = [
        { info: { tag: 'Áo thun', price: '150k' } },
        { info: { tag: 'Quần jeans', price: '300k' } },
        { info: { tag: 'ao THUN', price: '150k' } },
    ];

    // filterByText with nested field and unaccented query
    const filtered = filterByText(items, 'ao thun', ['info.tag']);
    assert.strictEqual(filtered.length, 2, 'filterByText should match both Áo thun and ao THUN');

    // distinctByFields with nested field
    const distinct = distinctByFields(items, ['info.tag']);
    assert.strictEqual(distinct.length, 2, 'distinctByFields should normalize Áo thun and ao THUN');

    // orderBy with nested field
    const sorted = orderBy(items, 'info.price', '-');
    assert.strictEqual(sorted[0].info.price, '300k', 'orderBy should sort 300k above 150k');

    // groupByKey with nested field
    const grouped = groupByKey(items, 'info.price');
    assert.strictEqual(grouped['150k'].length, 2, 'groupByKey should group 2 items under 150k');

    console.log('✔ Test 4 passed.');
}

console.log('\n=== ALL TASK 2 VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
