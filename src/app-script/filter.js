/**
 * Data filtering, querying, sorting, and normalization utilities for Google Apps Script
 */

function removeUnicode(str) {
    if (str == null) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function normalizeText(val) {
    if (val == null) return '';
    return removeUnicode(String(val)).toLowerCase().trim();
}

function coerceNumber(val) {
    if (typeof val === 'number') return val;
    if (val == null || val instanceof Date) return NaN;
    const s = String(val).toLowerCase().trim();
    if (!s) return NaN;

    if (s.endsWith('k')) {
        const num = parseFloat(s);
        return isNaN(num) ? NaN : num;
    }

    if (s.includes('tr') || s.includes('triệu')) {
        const trMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:tr|triệu)\s*(\d+)?/);
        if (trMatch) {
            const mainPart = parseFloat(trMatch[1]);
            let decimalPart = 0;
            if (trMatch[2]) {
                const decStr = trMatch[2];
                if (decStr.length === 1) {
                    decimalPart = parseFloat(decStr) / 10;
                } else if (decStr.length === 2) {
                    decimalPart = parseFloat(decStr) / 100;
                } else {
                    decimalPart = parseFloat(decStr) / Math.pow(10, decStr.length);
                }
            }
            return (mainPart + decimalPart) * 1000;
        }
    }

    const mMatch = s.match(/(\d+)\s*m\s*(\d{1,2})/);
    if (mMatch) {
        const meters = parseInt(mMatch[1], 10);
        const cmStr = mMatch[2];
        const cms = cmStr.length === 1 ? parseInt(cmStr, 10) * 10 : parseInt(cmStr, 10);
        return meters * 100 + cms;
    }

    const match = s.match(/(\d+(?:\.\d+)?)/);
    if (!match) return NaN;
    const num = parseFloat(match[1]);
    return isNaN(num) ? NaN : num;
}

function getFieldValue(item, fieldPath) {
    if (!item || !fieldPath) return undefined;
    if (Object.prototype.hasOwnProperty.call(item, fieldPath)) {
        return item[fieldPath];
    }
    const parts = String(fieldPath).split('.');
    let current = item;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

const OPERATORS = {
    "==": (a, b) => {
        const numA = coerceNumber(a);
        const numB = coerceNumber(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA === numB;
        }
        return normalizeText(a) === normalizeText(b);
    },
    "!=": (a, b) => !OPERATORS["=="](a, b),
    ">": (a, b) => {
        const numA = coerceNumber(a);
        const numB = coerceNumber(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA > numB;
        }
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() > b.getTime();
        }
        return normalizeText(a) > normalizeText(b);
    },
    "<": (a, b) => {
        const numA = coerceNumber(a);
        const numB = coerceNumber(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA < numB;
        }
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() < b.getTime();
        }
        return normalizeText(a) < normalizeText(b);
    },
    ">=": (a, b) => OPERATORS[">"](a, b) || OPERATORS["=="](a, b),
    "<=": (a, b) => OPERATORS["<"](a, b) || OPERATORS["=="](a, b),
    "contains": (a, b) => normalizeText(a).includes(normalizeText(b)),
    "in": (a, b) => {
        if (!Array.isArray(b)) return false;
        const normA = normalizeText(a);
        return b.some(item => normalizeText(item) === normA);
    },
};

function filterValidPhoneData(data) {
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    const result = [];

    for (const item of data) {
        if (!item) continue;
        const rawPhone = item["Số điện thoại"] || "";
        const phone = String(rawPhone).replace(/[^\d+]/g, "").trim();

        if (phone.length >= 7) {
            if (!seen.has(phone)) {
                seen.add(phone);
                result.push(item);
            }
        }
    }

    return result;
}

function matchFilter(item, filter) {
    if (!filter) return true;
    const { field, operator, value } = filter;
    const op = OPERATORS[operator];
    if (!op) throw new Error(`Unsupported operator: ${operator}`);
    const itemValue = getFieldValue(item, field);
    return op(itemValue, value);
}

function applyFilters(item, rule) {
    if (!rule) return true;

    // Single filter condition
    if (rule.field) return matchFilter(item, rule);

    // Logical group condition
    if (Array.isArray(rule.filters)) {
        if (rule.filters.length === 0) return true;
        const results = rule.filters.map(f => applyFilters(item, f));

        if (rule.logic === "or") return results.some(Boolean);
        if (rule.logic === "and" || !rule.logic) return results.every(Boolean);
    }

    return true;
}

// ========== partitionArray ==========
/**
 * Partitions an array into two arrays: matching (true) and non-matching (false)
 * @param {Array} arr - Input array
 * @param {(val: any, i: number, arr: Array) => boolean} fn - Predicate function
 * @returns {[Array, Array]} - Two partitioned arrays
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

    const numA = coerceNumber(a);
    const numB = coerceNumber(b);
    if (!isNaN(numA) && !isNaN(numB)) {
        if (numA === numB) return 0;
        return numA < numB ? -1 : 1;
    }

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

// ========== DataQuery & Cache ==========
const _dataQueryMemoryCache = {};

class DataQuery {
    constructor(data) {
        this.data = Array.isArray(data) ? [...data] : [];
    }

    static from(data) {
        return new DataQuery(data);
    }

    static fromSheet(sheetName) {
        const targetName = sheetName || (typeof getSheetName === 'function' ? getSheetName() : '');
        const cacheKey = 'QUERY_CACHE_' + targetName;

        if (_dataQueryMemoryCache[cacheKey]) {
            return new DataQuery(_dataQueryMemoryCache[cacheKey]);
        }

        if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
            const cachedStr = CacheService.getScriptCache().get(cacheKey);
            if (cachedStr) {
                try {
                    const parsed = JSON.parse(cachedStr);
                    _dataQueryMemoryCache[cacheKey] = parsed;
                    return new DataQuery(parsed);
                } catch (e) {
                    // ignore JSON parse error
                }
            }
        }

        const rawData = (typeof getSheetData === 'function' ? getSheetData(targetName) : []) || [];
        _dataQueryMemoryCache[cacheKey] = rawData;

        if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
            try {
                const jsonStr = JSON.stringify(rawData);
                if (jsonStr.length < 100000) {
                    CacheService.getScriptCache().put(cacheKey, jsonStr, 21600);
                }
            } catch (e) {
                // ignore cache write error
            }
        }

        return new DataQuery(rawData);
    }

    static clearCache() {
        const keys = Object.keys(_dataQueryMemoryCache);
        for (const key of keys) {
            delete _dataQueryMemoryCache[key];
        }
        if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
            try {
                const cache = CacheService.getScriptCache();
                if (cache && typeof cache.removeAll === 'function' && keys.length > 0) {
                    cache.removeAll(keys);
                }
            } catch (e) {
                // ignore cache clear error
            }
        }
    }

    applyRule(rule) {
        this.data = this.data.filter(item => applyFilters(item, rule));
        return this;
    }

    where(field, operator, value) {
        return this.applyRule({ field, operator, value });
    }

    filterByText(search, keys) {
        this.data = filterByText(this.data, search, keys);
        return this;
    }

    orderBy(fieldSort, predicate = null) {
        this.data = orderBy(this.data, fieldSort, predicate);
        return this;
    }

    orderByMultiple(sortConfigs) {
        this.data = orderByMultiple(this.data, sortConfigs);
        return this;
    }

    distinctBy(fields) {
        this.data = distinctByFields(this.data, fields);
        return this;
    }

    groupBy(key, fallbackKey = 'ungrouped') {
        return groupByKey(this.data, key, fallbackKey);
    }

    partition(fn) {
        return partitionArray(this.data, fn);
    }

    execute() {
        return [...this.data];
    }
}

// ========== funcOrderDesc ==========
function funcOrderDesc(b, a) {
    return funcOrderBy(a, b);
}

// ========== orderByMultiple ==========
function orderByMultiple(data, sortConfigs) {
    if (!data || !sortConfigs || sortConfigs.length === 0) return [...(data || [])];

    return [...data].sort((a, b) => {
        for (const config of sortConfigs) {
            const { fieldSort, predicate } = config;
            const valueA = getFieldValue(a, fieldSort);
            const valueB = getFieldValue(b, fieldSort);

            const func = predicate === '-' ? funcOrderDesc : funcOrderBy;
            const res = func(valueA, valueB);
            if (res !== 0) return res;
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
    return [...data].sort((a, b) => functionOrder(getFieldValue(a, fieldSort), getFieldValue(b, fieldSort)));
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
    const normSearch = normalizeText(search);
    if (!normSearch) return data;
    return data.filter(x => compareByText(x, normSearch, keys));
}

// ========== compareByText ==========
function compareByText(item, search, keys) {
    if (!item) return false;
    const normSearch = normalizeText(search);
    if (!normSearch) return true;
    if (!Array.isArray(keys)) return false;
    for (const key of keys) {
        const val = getFieldValue(item, key);
        const normVal = normalizeText(val);
        if (normVal.includes(normSearch)) return true;
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

// Note: removeUnicode is defined above with full NFD normalization support

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

// Helper function to convert camelCase string to spaced words
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
    if (!items || items.length === 0) return { [fallbackKey]: [] };

    return items.reduce((acc, item) => {
        const groupKey = getFieldValue(item, key);
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
    if (!Array.isArray(arr)) return [];
    if (!Array.isArray(fields) || fields.length === 0) return [...arr];
    const seen = new Set();
    const result = [];

    for (const item of arr) {
        let key = '';
        for (const f of fields) {
            const val = getFieldValue(item, f);
            key += '|' + normalizeText(val);
        }

        if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
        }
    }

    return result;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        _dataQueryMemoryCache,
        DataQuery,
        removeUnicode,
        normalizeText,
        coerceNumber,
        getFieldValue,
        OPERATORS,
        matchFilter,
        applyFilters,
        filterValidPhoneData,
        partitionArray,
        formatNumber,
        funcOrderBy,
        funcOrderDesc,
        orderByMultiple,
        order,
        orderBy,
        filterNotInclude,
        filterByText,
        compareByText,
        getFirstDuplicateItem,
        convertEnumToArrayOptionsSelect,
        orderByIds,
        groupByKey,
        lastIndexOf,
        distinctByFields
    };
}
