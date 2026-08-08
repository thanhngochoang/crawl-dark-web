# Design Spec: Confluent Data Filtering & Helper Engine

**Date:** 2026-08-08  
**Target Files:**  
- `src/app-script/helper.js`  
- `src/app-script/filter.js`  

---

## 1. Executive Summary

This design establishes **value confluence** between Gemini AI natural-language rule generation (`helper.js`), Google Sheet row parsing (`sheet.js`), and row-level filtering/querying (`filter.js`). 

It fixes issues where raw unit strings (`"500k"`, `"1m65"`, `"25 tuổi"`), Vietnamese diacritics (`"Hà Nội"` vs `"ha noi"`), case sensitivity, age vs. birth year mapping, and nested field structures (`"Số đồ 3 vòng"`) caused filter comparisons to fail.

---

## 2. Gemini Prompt Value Normalization (`helper.js`)

`makeTheRule(query)` will include explicit instructions for value confluence:

1. **Price (`Giá`)**:
   - Convert all prices to **thousands VND** (`k` unit).
   - Examples:
     - `"500k"`, `"500.000"`, `"500 nghìn"` $\rightarrow$ `500`
     - `"1 triệu"`, `"1tr"` $\rightarrow$ `1000`
     - `"1.5 triệu"`, `"1tr5"` $\rightarrow$ `1500`

2. **Height & Weight (`Chiều Cao`, `Cân Nặng`)**:
   - Convert height to numeric **centimeters (`cm`)**: `"1m65"`, `"165cm"` $\rightarrow$ `165`.
   - Convert weight to numeric **kilograms (`kg`)**: `"50kg"` $\rightarrow$ `50`.

3. **Age to Birth Year Mapping (`Năm Sinh`)**:
   - Reference current year: `2026`.
   - Convert age expressions to birth year rules:
     - *"dưới 25 tuổi"* (younger than 25) $\rightarrow$ `{"field": "Năm Sinh", "operator": ">=", "value": 2001}`
     - *"trên 20 tuổi"* (older than 20) $\rightarrow$ `{"field": "Năm Sinh", "operator": "<=", "value": 2006}`
     - *"từ 20 đến 25 tuổi"* $\rightarrow$ range between `2001` and `2006`.
     - *"sinh năm 2000"* $\rightarrow$ `{"field": "Năm Sinh", "operator": "==", "value": 2000}`

4. **3-Sizes Sub-fields (`Số đồ 3 vòng`)**:
   - Map 3-size sub-queries to dot-notated fields:
     - *"vòng 1 trên 90"* $\rightarrow$ `{"field": "Số đồ 3 vòng.bust", "operator": ">=", "value": 90}`
     - *"vòng 2 dưới 60"* $\rightarrow$ `{"field": "Số đồ 3 vòng.waist", "operator": "<=", "value": 60}`
     - *"vòng 3 trên 90"* $\rightarrow$ `{"field": "Số đồ 3 vòng.hip", "operator": ">=", "value": 90}`

5. **Location Normalization (`Khu Vực`, `Địa chỉ`)**:
   - Normalize common abbreviations: `"HN"` $\rightarrow$ `"Hà Nội"`, `"SG"` / `"HCM"` $\rightarrow$ `"Hồ Chí Minh"`, `"ĐN"` $\rightarrow$ `"Đà Nẵng"`.

---

## 3. Confluent Filter Engine & Fluent API (`filter.js`)

### 3.1 Value Normalization & Coercion Helpers
- **`removeUnicode(str)`**: Improved NFD decomposition (`str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")`).
- **`normalizeText(val)`**: String conversion + lowercase + `removeUnicode` + trim.
- **`coerceNumber(val)`**: Coerces numeric strings, numbers, or formatted strings (`"500k"` $\rightarrow$ `500`, `"1m65"` $\rightarrow$ `165`, `"50kg"` $\rightarrow$ `50`) into valid JS numbers (returns `NaN` if unparseable).
- **`getFieldValue(item, fieldPath)`**: Extracts direct fields (`item["Giá"]`) or nested property paths (`item["Số đồ 3 vòng"]?.bust`).

### 3.2 Context-Aware Operators (`OPERATORS`)
- **`==` / `!=`**: Accent- & case-insensitive string equality, or coerced numeric equality if both operands can be numeric.
- **`>` / `<` / `>=` / `<=`**: Coerced numeric or Date object comparisons.
- **`contains`**: Accent- & case-insensitive substring search (`normalizeText(a).includes(normalizeText(b))`).
- **`in`**: Accent- & case-insensitive array inclusion check.

### 3.3 Fluent `DataQuery` Class
Provide a chainable API wrapper:
```javascript
class DataQuery {
  static from(data) { return new DataQuery(data); }
  applyRule(rule) { ... }
  where(field, operator, value) { ... }
  filterByText(search, keys) { ... }
  orderBy(field, predicate) { ... }
  orderByMultiple(sortConfigs) { ... }
  distinctBy(fields) { ... }
  groupBy(key, fallbackKey) { ... }
  partition(fn) { ... }
  execute() { return [...this.data]; }
}
```

### 3.4 Daily Data Query Caching (`DataQuery.fromSheet(sheetName)`)
To optimize execution speed in Google Apps Script (preventing repeated expensive Google Spreadsheet file reads during Telegram webhook calls):
- `DataQuery` will incorporate daily caching using `CacheService.getScriptCache()` and an in-memory static store keyed by date (`YYYY-MM-DD`).
- **`DataQuery.fromSheet(sheetName)`**: Convenience method that loads and caches parsed sheet data for the given day, returning a pre-populated `DataQuery` instance ready for filtering.
- **Cache Eviction / Invalidation**: Cache automatically scopes by daily date string `YYYY-MM-DD` and expires after 6 hours (or when explicitly cleared via `DataQuery.clearCache()`).

### 3.5 Backwards Compatibility
All existing top-level functions (`applyFilters`, `matchFilter`, `orderBy`, `groupByKey`, `distinctByFields`, `filterByText`, `partitionArray`, `removeUnicode`, etc.) will remain exported and functional.

---

## 4. Verification Plan

1. **Unit Test / Integration Checks in Apps Script context**:
   - Verify `makeTheRule` prompt handles price, height, weight, age, 3-sizes, locations properly.
   - Verify `applyFilters` accurately matches raw sheet data against AI-generated rules.
   - Verify `DataQuery` method chaining produces correct filtered results.
