
// Function to get data from a specific sheet
function getSheetData(sheetName) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);

    const result = rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            let value = row[i];

            switch (header) {
                case "Giá":
                    value = parsePrice(value);
                    break;
                case "Năm Sinh":
                case "Lượt Xem":
                    value = parseInt(value, 10) || 0;
                    break;
                case "Cân Nặng":
                    value = parseFloat(String(value).replace(/[^\d.]/g, ""));
                    break;
                case "Chiều Cao":
                    value = parseFloat(String(value).replace(/[^\d.]/g, ""));
                    break;
                case "Ngày Tạo":
                    value = parseDate(value);
                    break;
                case "Số đồ 3 vòng":
                    value = parseThreeSizes(value);
                    break;
                default:
                    value = String(value).trim();
                    break;
            }

            obj[header] = value;
        });
        return obj;
    });

    Logger.log(result);
    return result;
}

function parsePrice(val) {
    if (!val) return 0;
    const s = String(val).toLowerCase().trim();
    if (s.endsWith("k")) return parseFloat(s);
    if (s.endsWith("tr") || s.endsWith("triệu")) return parseFloat(s);
    const num = parseFloat(s.replace(/[^\d.]/g, ""));
    return isNaN(num) ? 0 : num;
}

function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    const parts = String(val).split("/");
    if (parts.length === 3) {
        const [day, month, year] = parts.map(p => parseInt(p, 10));
        return new Date(year, month - 1, day);
    }
    return new Date(val);
}

function parseThreeSizes(val) {
    if (!val) return null;
    const parts = String(val).split("-").map(n => parseInt(n.trim(), 10));
    if (parts.length === 3) {
        return { bust: parts[0], waist: parts[1], hip: parts[2] };
    }
    return { bust: null, waist: null, hip: null };
}






// Sheet configuration
function getSheetName() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
const SHEET_NAME = getSheetName()
