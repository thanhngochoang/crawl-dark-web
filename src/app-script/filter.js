

const OPERATORS = {
    "==": (a, b) => a == b,
    "!=": (a, b) => a != b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b,
    "contains": (a, b) => typeof a === "string" && a.includes(b),
    "in": (a, b) => Array.isArray(b) && b.includes(a),
};

function filterValidPhoneData(data) {
    if (!Array.isArray(data)) return [];

    return data.filter(item => {
        const phone = (item["Số điện thoại"] || "").trim().replace("'", "");

        return phone !== "";
    });
}
function matchFilter(item, filter) {
    const { field, operator, value } = filter;
    const op = OPERATORS[operator];
    if (!op) throw new Error(`Unsupported operator: ${operator}`);
    return op(item[field], value);
}
function applyFilters(item, rule) {
    if (!rule) return true;

    // Nếu rule là filter đơn
    if (rule.field) return matchFilter(item, rule);

    // Nếu là nhóm logic
    const results = rule.filters.map(f => applyFilters(item, f));

    if (rule.logic === "and") return results.every(Boolean);
    if (rule.logic === "or") return results.some(Boolean);

    throw new Error(`Unsupported logic: ${rule.logic}`);
}

// ========== partitionArray ==========
/**
 * Chia mảng thành 2 nhóm: nhóm thỏa điều kiện (true) và nhóm không thỏa (false)
 * @param {Array} arr - Mảng đầu vào
 * @param {(val: any, i: number, arr: Array) => boolean} fn - Hàm kiểm tra
 * @returns {[Array, Array]} - Hai mảng kết quả
 */
function partitionArray(arr, fn) {
    return arr.reduce(
        (acc, val, i, array) => {
            acc[fn(val, i, array) ? 0 : 1].push(val);
            return acc;
        },
        [[], []]
    );
}

// ========== formatNumber ==========
function formatNumber(number, locale = 'de') {
    return new Intl.NumberFormat(locale).format(number);
}

// ========== funcOrderBy ==========
function funcOrderBy(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;

    if (typeof a === 'string' && typeof b === 'string') {
        const aValue = removeUnicode(a.toLowerCase()).trim();
        const bValue = removeUnicode(b.toLowerCase()).trim();
        return aValue.localeCompare(bValue);
    }

    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }

    if (a === b) return 0;
    return a < b ? -1 : 1;
}

// ========== funcOrderDesc ==========
function funcOrderDesc(b, a) {
    return funcOrderBy(a, b);
}

// ========== orderByMultiple ==========
function orderByMultiple(data, sortConfigs) {
    if (!data || !sortConfigs || sortConfigs.length === 0) return [...data];

    return [...data].sort((a, b) => {
        for (const config of sortConfigs) {
            const { fieldSort, predicate } = config;
            const valueA = a[fieldSort];
            const valueB = b[fieldSort];

            if (valueA === valueB) continue;
            return predicate === '-' ? funcOrderBy(valueB, valueA) : funcOrderBy(valueA, valueB);
        }
        return 0;
    });
}

// ========== order ==========
function order(data, sortParam) {
    if (!data) return [];
    if (!sortParam) return data;
    const [field, predicate] = sortParam.split(' ');
    return orderBy(data, field, predicate);
}

// ========== orderBy ==========
function orderBy(data, fieldSort, predicate = null) {
    if (!data) return [];
    const functionOrder = predicate === '-' ? funcOrderDesc : funcOrderBy;
    return [...data.sort((a, b) => functionOrder(a[fieldSort], b[fieldSort]))];
}

// ========== filterNotInclude ==========
function filterNotInclude(data, exclude, key) {
    if (!data) return [];
    if (!exclude || exclude.length === 0) return data;
    return data.filter(x => !exclude.includes(x[key]));
}

// ========== filterByText ==========
function filterByText(data, search, keys) {
    if (!data) return [];
    if (!search || typeof search !== 'string') return data;
    const textSearch = search.toLocaleLowerCase();
    return data.filter(x => compareByText(x, textSearch, keys));
}

// ========== compareByText ==========
function compareByText(data, search, keys) {
    if (!data) return false;
    if (!search) return true;
    for (const key of keys) {
        const result = (data[key]?.toString() || '').toLocaleLowerCase();
        if (result.includes(search)) return true;
    }
    return false;
}

// ========== getFirstDuplicateItem ==========
function getFirstDuplicateItem(array, key) {
    const seen = new Set();
    for (const item of array) {
        const value = item[key];
        if (seen.has(value)) return item;
        seen.add(value);
    }
    return undefined;
}

// ========== removeUnicode ==========
function removeUnicode(str) {
    return str.replace(/[^\x00-\x7F]/g, '');
}

// ========== convertEnumToArrayOptionsSelect ==========
function convertEnumToArrayOptionsSelect(enumData) {
    return Object.entries(enumData)
        .filter(([key]) => isNaN(Number(key)))
        .map(([key, value]) => ({
            label: key,
            text: camelCaseToWords(key),
            value: value,
        }));
}

// Giả lập hàm camelCaseToWords nếu cần dùng độc lập
function camelCaseToWords(str) {
    return str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

// ========== orderByIds ==========
function orderByIds(ids, objects, key) {
    const map = new Map(objects.map(obj => [obj[key], obj]));
    return ids.map(id => map.get(id)).filter(Boolean);
}

// ========== groupByKey ==========
function groupByKey(items, key, fallbackKey = 'ungrouped') {
    if (!items || items.length === 0) return { ungrouped: [] };

    return items.reduce((acc, item) => {
        const groupKey = item[key];
        const keyString = groupKey === null || groupKey === undefined || groupKey === '' ? fallbackKey : String(groupKey);

        if (!acc[keyString]) acc[keyString] = [];
        acc[keyString].push(item);

        return acc;
    }, {});
}

// ========== lastIndexOf ==========
function lastIndexOf(arr, callBack) {
    if (!arr || arr.length === 0) return -1;
    for (let i = arr.length - 1; i >= 0; i--) {
        if (callBack(arr[i])) return i;
    }
    return -1;
}

// ========== distinctByFields ==========
function distinctByFields(arr, fields) {
    const seen = new Set();
    const result = [];

    for (const item of arr) {
        let key = '';
        for (const f of fields) {
            key += '|' + (item[f] ?? '').toString().toLowerCase().trim();
        }

        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }

    return result;
}



const rule = `
{ "logic": "and", "filters": [ { "field": "Năm Sinh", "operator": "<=", "value": 2005 }, { "field": "Địa chỉ", "operator": "contains", "value": "quận 8" } ] }
`



const data = [
    { name: "Tony", age: 25, country: "VN" },
    { name: "Alex", age: 17, country: "VN" },
    { name: "John", age: 22, country: "US" },
];
const result = data.filter(item => applyFilters(item, JSON.parse(rule)));

console.log(result);
