

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
