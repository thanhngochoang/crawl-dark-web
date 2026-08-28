import assert from "assert";
import { upsertRecords, hasValidPhone } from "../src/csv.util";
import { csvMapping } from "../src/util";
import { EscortData } from "../src/model";

console.log("=== Testing upsertRecords for AllData ===");

// 1. Phone number validation tests
console.log("\n1. Testing hasValidPhone...");
assert.strictEqual(hasValidPhone("0901234567"), true, "Standard 10-digit phone is valid");
assert.strictEqual(hasValidPhone(" '0901234567 "), true, "Quoted/formatted phone is valid");
assert.strictEqual(hasValidPhone("+84901234567"), true, "Phone with country code is valid");
assert.strictEqual(hasValidPhone("0123456"), true, "7-digit number is valid");
assert.strictEqual(hasValidPhone("12345"), false, "Less than 7 digits is invalid");
assert.strictEqual(hasValidPhone(""), false, "Empty string is invalid");
assert.strictEqual(hasValidPhone(null), false, "Null is invalid");
assert.strictEqual(hasValidPhone(undefined), false, "Undefined is invalid");
assert.strictEqual(hasValidPhone("N/A"), false, "Text without digits is invalid");
console.log("✔ hasValidPhone passed all checks.");

// 2. Upsert existing records & verify all fields are updated by URL
console.log("\n2. Testing all fields up to date by URL...");

const existingHeaders = [
    "URL", "Giá", "Số điện thoại", "Năm Sinh", "Ngày Tạo", "Lượt Xem",
    "Khu Vực", "Cân Nặng", "Chiều Cao", "Xuất xứ", "Số đồ 3 vòng", "Địa chỉ", "Trạng thái"
];

const existingRows = [
    [
        "https://example.com/item/1",
        "500k",
        " '0901111111 ",
        "2000",
        "01/01/2026",
        "100",
        "Cầu Giấy",
        "48kg",
        "1m65",
        "Miền Bắc",
        "90-60-90",
        "Cầu Giấy, Hà Nội",
        "active"
    ],
    [
        "https://example.com/item/2",
        "600k",
        " '0902222222 ",
        "1998",
        "02/01/2026",
        "200",
        "Đống Đa",
        "50kg",
        "1m68",
        "Miền Nam",
        "88-60-88",
        "Đống Đa, Hà Nội",
        "active"
    ],
    [
        "https://example.com/item/3",
        "700k",
        "",
        "2002",
        "03/01/2026",
        "50",
        "Hai Bà Trưng",
        "47kg",
        "1m60",
        "Miền Bắc",
        "86-58-86",
        "Hai Bà Trưng, Hà Nội",
        "inactive"
    ],
    [
        // Legacy row with blank status
        "https://example.com/item/4",
        "400k",
        " '0904444444 ",
        "1999",
        "04/01/2026",
        "80",
        "Tây Hồ",
        "49kg",
        "1m62",
        "Miền Bắc",
        "89-60-89",
        "Tây Hồ, Hà Nội",
        "" // blank status in legacy data
    ]
];

const newCrawlRecords: EscortData[] = [
    {
        // Update URL 1: Price 500k -> 700k, Views 100 -> 350, KhuVuc -> Ba Đình, SoDo3Vong -> 92-60-92
        URL: "https://example.com/item/1",
        Gia: "700k",
        SoDienThoai: "0901111111",
        Pass: "pass1",
        NamSinh: "2000",
        NgayTao: "01/01/2026",
        LuotXem: "350",
        KhuVuc: "Ba Đình",
        CanNang: "49kg",
        ChieuCao: "1m65",
        XuatXu: "Miền Bắc",
        SoDo3Vong: "92-60-92",
        DiaChi: "Ba Đình, Hà Nội",
        DichVu: [],
        Images: []
    },
    {
        // Update URL 2: Post deactivated / phone removed -> should become inactive
        URL: "https://example.com/item/2",
        Gia: "600k",
        SoDienThoai: "", // no phone number
        Pass: "",
        NamSinh: "1998",
        NgayTao: "02/01/2026",
        LuotXem: "220",
        KhuVuc: "Đống Đa",
        CanNang: "50kg",
        ChieuCao: "1m68",
        XuatXu: "Miền Nam",
        SoDo3Vong: "88-60-88",
        DiaChi: "Đống Đa, Hà Nội",
        DichVu: [],
        Images: []
    },
    {
        // Update URL 3: Previously inactive (no phone), now has phone -> becomes active
        URL: "https://example.com/item/3",
        Gia: "800k",
        SoDienThoai: "0903333333", // new phone
        Pass: "pass3",
        NamSinh: "2002",
        NgayTao: "03/01/2026",
        LuotXem: "150",
        KhuVuc: "Hai Bà Trưng",
        CanNang: "47kg",
        ChieuCao: "1m60",
        XuatXu: "Miền Bắc",
        SoDo3Vong: "86-58-86",
        DiaChi: "Hai Bà Trưng, Hà Nội",
        DichVu: [],
        Images: []
    },
    {
        // New URL 5: Brand new record with phone -> should be added as active
        URL: "https://example.com/item/5",
        Gia: "1000k",
        SoDienThoai: "0905555555",
        Pass: "pass5",
        NamSinh: "2004",
        NgayTao: "28/08/2026",
        LuotXem: "10",
        KhuVuc: "Cầu Giấy",
        CanNang: "46kg",
        ChieuCao: "1m66",
        XuatXu: "Miền Bắc",
        SoDo3Vong: "90-58-90",
        DiaChi: "Dịch Vọng, Cầu Giấy, Hà Nội",
        DichVu: [],
        Images: []
    },
    {
        // New URL 6: Brand new record without phone -> should be added as inactive
        URL: "https://example.com/item/6",
        Gia: "300k",
        SoDienThoai: "",
        Pass: "",
        NamSinh: "1995",
        NgayTao: "28/08/2026",
        LuotXem: "5",
        KhuVuc: "Thanh Xuân",
        CanNang: "52kg",
        ChieuCao: "1m58",
        XuatXu: "Miền Tây",
        SoDo3Vong: "88-64-90",
        DiaChi: "Thanh Xuân, Hà Nội",
        DichVu: [],
        Images: []
    }
];

const result = upsertRecords(existingHeaders, existingRows, newCrawlRecords, csvMapping);

console.log("Upsert result stats:", result.stats);

// Checks
assert.strictEqual(result.stats.total, 6, "Total rows should be 6 (4 existing + 2 added)");
assert.strictEqual(result.stats.updated, 3, "Updated rows should be 3 (URL 1, 2, 3)");
assert.strictEqual(result.stats.added, 2, "Added rows should be 2 (URL 5, 6)");

// Check row 0 (URL 1)
const row1 = result.rows[0];
assert.strictEqual(row1[0], "https://example.com/item/1");
assert.strictEqual(row1[1], "700k", "Price must be updated to 700k");
assert.strictEqual(row1[5], "350", "Views must be updated to 350");
assert.strictEqual(row1[6], "Ba Đình", "KhuVuc must be updated to Ba Đình");
assert.strictEqual(row1[10], "92-60-92", "3-sizes must be updated to 92-60-92");
assert.strictEqual(row1[12], "active", "Status must remain active");

// Check row 1 (URL 2: deactivated)
const row2 = result.rows[1];
assert.strictEqual(row2[0], "https://example.com/item/2");
assert.strictEqual(row2[12], "inactive", "Status must become inactive because phone number is absent");
assert.strictEqual(row2[2], " '0902222222 ", "Historical phone preserved");

// Check row 2 (URL 3: activated with phone)
const row3 = result.rows[2];
assert.strictEqual(row3[0], "https://example.com/item/3");
assert.strictEqual(row3[1], "800k", "Price must be updated to 800k");
assert.strictEqual(row3[2].trim(), "'0903333333", "Phone number must be updated with formatting");
assert.strictEqual(row3[12], "active", "Status must become active because valid phone is now present");

// Check row 3 (URL 4: legacy un-crawled row with empty status but valid phone)
const row4 = result.rows[3];
assert.strictEqual(row4[0], "https://example.com/item/4");
assert.strictEqual(row4[12], "active", "Legacy row status backfilled to active because it has valid phone");

// Check row 4 (URL 5: new active record)
const row5 = result.rows[4];
assert.strictEqual(row5[0], "https://example.com/item/5");
assert.strictEqual(row5[1], "1000k");
assert.strictEqual(row5[12], "active", "New record with phone added as active");

// Check row 5 (URL 6: new inactive record)
const row6 = result.rows[5];
assert.strictEqual(row6[0], "https://example.com/item/6");
assert.strictEqual(row6[1], "300k");
assert.strictEqual(row6[12], "inactive", "New record without phone added as inactive");

// Verify active & inactive counts
// Active: row 0 (URL 1), row 2 (URL 3), row 3 (URL 4), row 4 (URL 5) -> 4 active
// Inactive: row 1 (URL 2), row 5 (URL 6) -> 2 inactive
assert.strictEqual(result.stats.active, 4, "Active count should be 4");
assert.strictEqual(result.stats.inactive, 2, "Inactive count should be 2");

console.log("✔ All upsert and active/inactive tests passed cleanly!");
