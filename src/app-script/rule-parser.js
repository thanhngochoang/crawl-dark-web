/**
 * Rule-based (no AI) Vietnamese query parser.
 * Converts a short natural-language filter sentence into the same JSON rule
 * structure that the AI engine produces, so DataQuery.applyRule() can consume it.
 * Used as a fallback when Cloudflare / Gemini do not return a usable response.
 */

// Reuse filter.js normalizeText (global in GAS, required under Node).
// Resolved lazily because GAS file load order is not guaranteed.
function _rpNormalizeText(val) {
    if (typeof normalizeText === 'function') return normalizeText(val);
    if (typeof require === 'function') return require('./filter.js').normalizeText(val);
    return String(val == null ? '' : val).toLowerCase().trim();
}

const RP_FIELD = {
    PRICE: 'Giá',
    YEAR: 'Năm Sinh',
    HEIGHT: 'Chiều Cao',
    WEIGHT: 'Cân Nặng',
    BUST: 'Số đồ 3 vòng.bust',
    HIP: 'Số đồ 3 vòng.hip',
    AREA: 'Khu Vực',
    ADDRESS: 'Địa chỉ',
    STATUS: 'Trạng thái',
    VIEWS: 'Lượt Xem',
};

// Known place aliases (normalized, accent-free key -> canonical value stored in the sheet).
// Longer keys are matched first so "ho chi minh" wins over "hcm" inside "tphcm".
const RP_PLACES = {
    'ha noi': 'Hà Nội', 'hanoi': 'Hà Nội', 'hn': 'Hà Nội',
    'ho chi minh': 'Hồ Chí Minh', 'sai gon': 'Hồ Chí Minh', 'saigon': 'Hồ Chí Minh',
    'tphcm': 'Hồ Chí Minh', 'tp hcm': 'Hồ Chí Minh', 'hcm': 'Hồ Chí Minh', 'sg': 'Hồ Chí Minh',
    'da nang': 'Đà Nẵng', 'danang': 'Đà Nẵng', 'dn': 'Đà Nẵng',
    'hai phong': 'Hải Phòng', 'hp': 'Hải Phòng',
    'can tho': 'Cần Thơ', 'nha trang': 'Nha Trang', 'vung tau': 'Vũng Tàu', 'hue': 'Huế',
    'binh duong': 'Bình Dương', 'bien hoa': 'Biên Hòa', 'bac ninh': 'Bắc Ninh',
    'thai nguyen': 'Thái Nguyên', 'quy nhon': 'Quy Nhơn', 'vinh': 'Vinh',
    // Hà Nội districts
    'cau giay': 'Cầu Giấy', 'dong da': 'Đống Đa', 'ba dinh': 'Ba Đình', 'hai ba trung': 'Hai Bà Trưng',
    'hoan kiem': 'Hoàn Kiếm', 'thanh xuan': 'Thanh Xuân', 'hoang mai': 'Hoàng Mai', 'long bien': 'Long Biên',
    'nam tu liem': 'Nam Từ Liêm', 'bac tu liem': 'Bắc Từ Liêm', 'tu liem': 'Từ Liêm', 'tay ho': 'Tây Hồ',
    'ha dong': 'Hà Đông', 'gia lam': 'Gia Lâm', 'my dinh': 'Mỹ Đình',
    // Hồ Chí Minh districts
    'binh thanh': 'Bình Thạnh', 'go vap': 'Gò Vấp', 'tan binh': 'Tân Bình', 'tan phu': 'Tân Phú',
    'phu nhuan': 'Phú Nhuận', 'thu duc': 'Thủ Đức', 'binh tan': 'Bình Tân',
};
const RP_PLACE_KEYS = Object.keys(RP_PLACES).sort((a, b) => b.length - a.length);
// Words that introduce a free-text location ("o Linh Dam", "quanh Cau Giay")
const RP_PLACE_KW = '(?:khu vuc|khu|o|tai|quanh|gan|quan|huyen|thanh pho|tp)';
// Connectors / filler words that must stop a free-text place capture
const RP_STOP = new Set(['va', 'hoac', 'hay', 'gia', 'cao', 'nang', 'vong', 'tuoi', 'tim', 'bai', 'gai', 'em',
    'duoi', 'tren', 'tu', 'den', 'khoang', 'tam', 'active', 'inactive', 'luot', 'xem', 'con', 'dang', 'het',
    // location keywords themselves must never become a place value
    'khu', 'vuc', 'o', 'tai', 'quanh', 'gan', 'quan', 'huyen', 'thanh', 'pho', 'tp']);

const RP_NUM = '(\\d+(?:[.,]\\d+)?)';
const RP_PRICE_UNIT = '(k|nghin|ngan|trieu|tr|cu)';
// Comparator words preceding a value
const RP_LOWER = '(?:duoi|be hon|nho hon|it hon|toi da|max|khong qua|<=?)';
const RP_UPPER = '(?:tren|hon|lon hon|cao hon|nhieu hon|toi thieu|it nhat|min|>=?)';

/** Parse a price token ("500k", "1tr5", "1.5 trieu", "2 cu", "500.000") into thousands of VND. */
function _rpPriceToK(numStr, unit, tail) {
    let n = parseFloat(String(numStr).replace(',', '.'));
    if (isNaN(n)) return NaN;
    unit = unit || '';
    if (unit === 'k' || unit === 'nghin' || unit === 'ngan') return n;
    if (unit === 'tr' || unit === 'trieu' || unit === 'cu') {
        if (tail) n += parseInt(tail, 10) / Math.pow(10, tail.length);
        return n * 1000;
    }
    // No unit: "500.000" / "500000" are VND, small numbers are already in k
    const raw = String(numStr).replace(/[.,]/g, '');
    const asInt = parseInt(raw, 10);
    if (asInt >= 10000) return asInt / 1000;
    return n;
}

function _rpCmp(prefix) {
    if (!prefix) return '==';
    if (new RegExp('^' + RP_LOWER + '$').test(prefix)) return '<=';
    if (new RegExp('^' + RP_UPPER + '$').test(prefix)) return '>=';
    return '==';
}

/**
 * Generic matcher runner: applies regex to state.text, pushes filters, and blanks out
 * the matched span so later matchers cannot re-use the same tokens.
 */
function _rpConsume(state, regex, handler) {
    state.text = state.text.replace(regex, (...args) => {
        const match = args[0];
        const produced = handler(...args);
        if (produced === false) return match;
        return ' '.repeat(match.length);
    });
}

function _rpRange(field, low, high) {
    return {
        logic: 'and',
        filters: [
            { field, operator: '>=', value: low },
            { field, operator: '<=', value: high },
        ],
    };
}

// ---------- Year / age ----------
function _rpMatchYear(state) {
    const year = state.currentYear;

    // "2k5", "2k05", "2k" (short for 2000s birth year)
    _rpConsume(state, /\b2k(\d{1,2})?\b(?!\s*(?:k|tr|trieu|cu))/g, (m, d) => {
        const v = d ? 2000 + parseInt(d, 10) : 2000;
        state.filters.push({ field: RP_FIELD.YEAR, operator: '==', value: v });
    });

    // "9x", "8x" -> decade range
    _rpConsume(state, /\b([789])x\b/g, (m, d) => {
        const base = 1900 + parseInt(d, 10) * 10;
        state.filters.push(_rpRange(RP_FIELD.YEAR, base, base + 9));
    });

    // "sinh nam 2000", "nam sinh 2000", "sn 2000"
    _rpConsume(state, /\b(?:sinh nam|nam sinh|sn)\s*((?:19|20)\d{2})\b/g, (m, y) => {
        state.filters.push({ field: RP_FIELD.YEAR, operator: '==', value: parseInt(y, 10) });
    });

    // "tu 20 den 25 tuoi"
    _rpConsume(state, /\btu\s*(\d{1,2})\s*(?:tuoi)?\s*(?:den|toi|-)\s*(\d{1,2})\s*tuoi\b/g, (m, a, b) => {
        const lo = Math.min(+a, +b), hi = Math.max(+a, +b);
        state.filters.push(_rpRange(RP_FIELD.YEAR, year - hi, year - lo));
    });

    // "duoi 25 tuoi" / "tren 20 tuoi" / "25 tuoi"
    const ageRe = new RegExp('(' + RP_LOWER + '|' + RP_UPPER + ')?\\s*(\\d{1,2})\\s*tuoi\\b', 'g');
    _rpConsume(state, ageRe, (m, prefix, age) => {
        const cmp = _rpCmp(prefix);
        // Younger than N years -> born after (year - N)
        const op = cmp === '<=' ? '>=' : cmp === '>=' ? '<=' : '==';
        state.filters.push({ field: RP_FIELD.YEAR, operator: op, value: year - parseInt(age, 10) });
    });
}

// ---------- Body measurements ----------
function _rpMatchBody(state) {
    const cmpGrp = '(' + RP_LOWER + '|' + RP_UPPER + ')?\\s*';

    // Bust / hip: "vong 1 tren 90", "v1 90", "vong 3 duoi 95"
    _rpConsume(state, new RegExp('\\b(?:vong|v)\\s*([13])\\s*' + cmpGrp + '(\\d{2,3})\\b', 'g'), (m, which, prefix, n) => {
        const field = which === '1' ? RP_FIELD.BUST : RP_FIELD.HIP;
        state.filters.push({ field, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });

    // Height: "1m65", "cao tren 1m6", "165cm", "cao 165"
    _rpConsume(state, new RegExp('(?:chieu cao|cao)?\\s*' + cmpGrp + '\\b(\\d)m(\\d{1,2})\\b', 'g'), (m, prefix, meter, cm) => {
        const cms = cm.length === 1 ? parseInt(cm, 10) * 10 : parseInt(cm, 10);
        state.filters.push({ field: RP_FIELD.HEIGHT, operator: _rpCmp(prefix), value: parseInt(meter, 10) * 100 + cms });
    });
    _rpConsume(state, new RegExp('(?:chieu cao|cao)?\\s*' + cmpGrp + '\\b(1\\d{2})\\s*cm\\b', 'g'), (m, prefix, n) => {
        state.filters.push({ field: RP_FIELD.HEIGHT, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });
    _rpConsume(state, new RegExp('\\b(?:chieu cao|cao)\\s*' + cmpGrp + '(1\\d{2})\\b', 'g'), (m, prefix, n) => {
        state.filters.push({ field: RP_FIELD.HEIGHT, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });

    // Weight: "50kg", "nang duoi 48", "can nang 50"
    _rpConsume(state, new RegExp('(?:can nang|nang)?\\s*' + cmpGrp + '\\b(\\d{2,3})\\s*(?:kg|ki|ky)\\b', 'g'), (m, prefix, n) => {
        state.filters.push({ field: RP_FIELD.WEIGHT, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });
    _rpConsume(state, new RegExp('\\b(?:can nang|nang)\\s*' + cmpGrp + '(\\d{2,3})\\b', 'g'), (m, prefix, n) => {
        state.filters.push({ field: RP_FIELD.WEIGHT, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });
}

// ---------- Status / views ----------
function _rpMatchMisc(state) {
    _rpConsume(state, /\b(inactive|het han|ngung hoat dong|khong hoat dong)\b/g, () => {
        state.filters.push({ field: RP_FIELD.STATUS, operator: '==', value: 'inactive' });
    });
    _rpConsume(state, /\b(active|con hoat dong|dang hoat dong|con hang)\b/g, () => {
        state.filters.push({ field: RP_FIELD.STATUS, operator: '==', value: 'active' });
    });
    _rpConsume(state, new RegExp('\\b(?:luot xem|view)\\s*(' + RP_LOWER + '|' + RP_UPPER + ')?\\s*(\\d+)\\b', 'g'), (m, prefix, n) => {
        state.filters.push({ field: RP_FIELD.VIEWS, operator: _rpCmp(prefix), value: parseInt(n, 10) });
    });
}

// ---------- Location ----------
function _rpPlaceFilter(value) {
    return {
        logic: 'or',
        filters: [
            { field: RP_FIELD.AREA, operator: 'contains', value },
            { field: RP_FIELD.ADDRESS, operator: 'contains', value },
        ],
    };
}

function _rpMatchPlace(state) {
    const places = [];

    // Known aliases, longest first
    for (const key of RP_PLACE_KEYS) {
        const re = new RegExp('(?<![a-z])' + key.replace(/\s+/g, '\\s+') + '(?![a-z])', 'g');
        _rpConsume(state, re, () => {
            if (!places.includes(RP_PLACES[key])) places.push(RP_PLACES[key]);
        });
    }

    // Free-text place after a location keyword: capture up to 3 words until a stop word / number
    const freeRe = new RegExp('\\b' + RP_PLACE_KW + '\\s+([a-z]+(?:\\s+[a-z]+){0,2})', 'g');
    _rpConsume(state, freeRe, (m, phrase) => {
        const words = [];
        for (const w of phrase.split(/\s+/)) {
            if (RP_STOP.has(w)) break;
            words.push(w);
        }
        if (words.length === 0) return false;
        const value = words.join(' ');
        if (!places.includes(value)) places.push(value);
    });

    if (places.length === 0) return;
    if (places.length === 1) {
        state.filters.push(_rpPlaceFilter(places[0]));
        return;
    }
    // Several places in one query are alternatives, never a conjunction
    state.filters.push({ logic: 'or', filters: places.map(_rpPlaceFilter) });
}

// ---------- Price ----------
function _rpMatchPrice(state) {
    const F = RP_FIELD.PRICE;
    const price = RP_NUM + '\\s*' + RP_PRICE_UNIT + '?(\\d)?';

    // "tu 500k den 1tr", "500k-1tr", "500-800k"
    const rangeRe = new RegExp('(?:tu\\s*)?' + price + '\\s*(?:den|toi|-|~)\\s*' + price + '\\b', 'g');
    _rpConsume(state, rangeRe, (m, n1, u1, t1, n2, u2, t2) => {
        if (!u1 && !u2) return false; // plain "20-25" is not a price
        const lo = _rpPriceToK(n1, u1 || u2, t1);
        const hi = _rpPriceToK(n2, u2 || u1, t2);
        if (isNaN(lo) || isNaN(hi)) return false;
        state.filters.push(_rpRange(F, Math.min(lo, hi), Math.max(lo, hi)));
    });

    // "gia duoi 500k", "duoi 500k", "gia 500", "500k", "tren 1tr5"
    const singleRe = new RegExp('(gia\\s*)?(' + RP_LOWER + '|' + RP_UPPER + ')?\\s*' + price + '\\b', 'g');
    _rpConsume(state, singleRe, (m, giaKw, prefix, n, u, t) => {
        if (!u && !giaKw) return false; // bare number without unit or "gia" keyword
        const v = _rpPriceToK(n, u, t);
        if (isNaN(v)) return false;
        state.filters.push({ field: F, operator: _rpCmp(prefix), value: v });
    });
}

/**
 * Parse a Vietnamese natural-language query into a JSON rule.
 * @param {string} text - user query
 * @param {{currentYear?: number}} [opts]
 * @returns {{logic: string, filters: Array}|null} rule, or null when nothing was recognised
 */
function parseRuleLocal(text, opts = {}) {
    if (!text) return null;
    const state = {
        text: ' ' + _rpNormalizeText(text).replace(/\s+/g, ' ') + ' ',
        filters: [],
        currentYear: opts.currentYear || new Date().getFullYear(),
    };

    // Order matters: specific patterns consume their tokens before generic ones
    _rpMatchYear(state);
    _rpMatchBody(state);
    _rpMatchMisc(state);
    _rpMatchPrice(state);
    _rpMatchPlace(state);

    if (state.filters.length === 0) return null;
    return { logic: 'and', filters: state.filters };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseRuleLocal };
}
