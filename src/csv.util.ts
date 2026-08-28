import { CsvConfig, EscortData } from "./model";
import fs from "fs";
import path from "path";
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Google Sheets setup
export const spreadsheetId = process.env.SPREADSHEET_ID;
export const isUploadToSheets = process.env.UPLOAD_TO_SHEETS !== 'false' && process.env.UPLOAD_TO_SHEETS !== '0';

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let sheetsInitialized = false;

function getSheetsClient() {
    if (!isUploadToSheets || !spreadsheetId) return null;
    if (sheetsInitialized) return sheetsClient;

    sheetsInitialized = true;

    if (!fs.existsSync('credentials.json')) {
        console.warn('⚠️ credentials.json not found, skipping Google Sheets integration.');
        return null;
    }

    try {
        const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
        const auth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        sheetsClient = google.sheets({ version: 'v4', auth });
        return sheetsClient;
    } catch (err) {
        console.error('Error initializing Google Sheets client:', (err as Error).message);
        return null;
    }
}

export async function ensureSheetExists(sheetName: string, headers?: string[]) {
    const sheets = getSheetsClient();
    if (!sheets || !spreadsheetId) return;

    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
        });
        const sheetExists = response.data.sheets?.some((sheet: any) => sheet.properties?.title === sheetName);
        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: sheetName,
                                },
                            },
                        },
                    ],
                },
            });
            console.log(`✅ Created sheet: ${sheetName}`);
            if (headers && headers.length > 0) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `'${sheetName}'!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values: [headers] },
                });
                console.log(`✅ Added headers to sheet: ${sheetName}`);
            }
        }
    } catch (error) {
        console.error('Error ensuring sheet exists:', error);
    }
}

// Hàm tạo header & mapRow từ config
function getCSVConfig<T>(mappingConfig: CsvConfig<T>) {
    const keys = Object.keys(mappingConfig) as (keyof T)[];
    const header = keys.map((k) => mappingConfig[k]?.header);

    const mapRow = (row: T) =>
        keys.map((k) => {
            const formatter = mappingConfig[k]?.formatter;
            const rawValue = row[k];
            const value = formatter ? formatter(rawValue) : String(rawValue ?? "");
            return `"${String(value).replace(/"/g, '""')}"`;
        })
            .join(",");

    return { header, mapRow };
};

// Hàm tạo values cho Google Sheets
function getSheetValues<T>(config: CsvConfig<T>, results: T[]) {
    const keys = Object.keys(config) as (keyof T)[];
    const header = keys.map((k) => config[k]?.header);
    const values = [
        header,
        ...results.map(row => keys.map(k => {
            const formatter = config[k]?.formatter;
            const rawValue = row[k];
            return formatter ? formatter(rawValue) : String(rawValue ?? "");
        }))
    ];
    return values;
};

export async function saveToCSV<T>(prefix: string, config: CsvConfig<T>, results: T[], sheetName?: string) {
    const { header, mapRow } = getCSVConfig(config);
    const csvRows = [
        header.join(","),
        ...results.map(mapRow)
    ];

    const outPath = path.resolve(`${prefix}_escort_data_${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(outPath, "\uFEFF" + csvRows.join("\n"), "utf8");

    console.log(`✅ Saved CSV: ${outPath}`);

    const sheets = getSheetsClient();
    if (sheets && spreadsheetId && sheetName) {
        await ensureSheetExists(sheetName);
        const values = getSheetValues(config, results);
        try {
            // Clear the sheet
            await sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `'${sheetName}'`,
            });
            // Update with new data
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A1`,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`✅ Saved to Google Sheets: ${spreadsheetId}, sheet: ${sheetName}`);
        } catch (error) {
            console.error('Error saving to Google Sheets:', error);
        }
    }
};

export async function appendToCSV<T>(prefix: string, config: CsvConfig<T>, rows: T[], sheetName?: string) {
    const { header, mapRow } = getCSVConfig(config);
    const outPath = path.resolve(`${prefix}_escort_data_${new Date().toISOString().slice(0, 10)}.csv`);

    // Nếu file chưa tồn tại → tạo mới với header
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
        fs.writeFileSync(outPath, "\uFEFF" + header.join(",") + "\n", "utf8");
    }

    for (const row of rows) {
        fs.appendFileSync(outPath, mapRow(row) + "\n", "utf8");
    }

    console.log(`✅ Appended ${rows.length} row(s) to CSV: ${outPath}`);

    const sheets = getSheetsClient();
    if (sheets && spreadsheetId && sheetName) {
        const keys = Object.keys(config) as (keyof T)[];
        const header = keys.map((k) => config[k]?.header);
        let values: any[] = rows.map(row => keys.map(k => {
            const formatter = config[k]?.formatter;
            const rawValue = row[k];
            return formatter ? formatter(rawValue) : String(rawValue ?? "");
        }));

        // Check if sheet is empty, if so, prepend headers
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${sheetName}'!A1`,
            });
            if (!response.data.values || response.data.values.length === 0) {
                values = [header, ...values];
            }
        } catch (error) {
            // If error (e.g., sheet doesn't exist), assume empty and add headers
            values = [header, ...values];
        }

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'${sheetName}'!A:A`,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`✅ Appended ${rows.length} row(s) to Google Sheets: ${spreadsheetId}, sheet: ${sheetName}`);
        } catch (error) {
            console.error('Error appending to Google Sheets:', error);
        }
    }
};

function columnToObject<T>(config: CsvConfig<T>): Record<string, keyof T> {
    if (!config) return {};
    return Object.keys(config).reduce((acc, key) => {
        const typedKey = key as keyof T;
        return {
            ...acc,
            [config[typedKey]?.header.toString() || '']: typedKey,
        };
    }, {} as Record<string, keyof T>);
}

export function readCsvToObject<T>(config: CsvConfig<T>): Partial<Record<keyof T, string>>[] {
    return readCsvToObjects<T>(path.resolve("log_escort_data_2025-08-16.csv"), config);
}

export function readCsvToObjects<T>(filePath: string, config: CsvConfig<T>): Partial<Record<keyof T, string>>[] {
    const content = fs.readFileSync(filePath, "utf8");
    const cleaned = content.replace(/^\uFEFF/, "").trim();

    if (!cleaned) return [];

    const headerMap = columnToObject(config);
    const lines = cleaned.split("\n").map(line => line.trim());
    const headers = lines[0].split(",").map(x => headerMap[x]);

    const rows = lines.slice(1).filter(l => l.length > 0);

    return rows.map(row => {
        const values = row.split(",");
        const obj: Partial<Record<keyof T, string>> = {};
        headers.forEach((h, i) => {
            obj[h] = values[i] ?? "";
        });
        return obj;
    });
}

// Helper function to get all data from a sheet
export async function getSheetData(sheetName: string): Promise<string[][]> {
    const sheets = getSheetsClient();
    if (!sheets || !spreadsheetId) return [];
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${sheetName}'`,
        });
        return response.data.values || [];
    } catch (error) {
        return [];
    }
}

export function normalizeUrl(url: string | null | undefined): string {
    if (!url) return '';
    return String(url).trim().toLowerCase().replace(/\/+$/, '');
}

export function hasValidPhone(phone: string | null | undefined): boolean {
    if (!phone) return false;
    const cleaned = String(phone).replace(/[^\d+]/g, "").trim();
    return cleaned.length >= 7;
}

export function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

export function upsertRecords<T>(
    existingHeaders: string[],
    existingRows: string[][],
    newRecords: T[],
    config: CsvConfig<T>
): { headers: string[]; rows: string[][]; stats: { total: number; updated: number; added: number; active: number; inactive: number } } {
    const keys = Object.keys(config) as (keyof T)[];
    let headers = [...existingHeaders];

    if (headers.length === 0) {
        headers = keys.map(k => config[k]?.header || String(k));
    }

    for (const key of keys) {
        const headerName = config[key]?.header || String(key);
        if (!headers.includes(headerName)) {
            headers.push(headerName);
        }
    }

    const urlHeader = (config as any).URL?.header || 'URL';
    const phoneHeader = (config as any).SoDienThoai?.header || 'Số điện thoại';
    const statusHeader = (config as any).TrangThai?.header || 'Trạng thái';

    const urlIdx = headers.indexOf(urlHeader);
    const phoneIdx = headers.indexOf(phoneHeader);
    const statusIdx = headers.indexOf(statusHeader);

    const rows = existingRows.map(r => {
        const rowCopy = [...r];
        while (rowCopy.length < headers.length) {
            rowCopy.push('');
        }
        return rowCopy;
    });

    const urlToRowIndex = new Map<string, number>();
    rows.forEach((row, idx) => {
        const url = normalizeUrl(row[urlIdx]);
        if (url) {
            urlToRowIndex.set(url, idx);
        }
    });

    let updatedCount = 0;
    let addedCount = 0;

    for (const item of newRecords) {
        const itemObj = item as any;
        const normUrl = normalizeUrl(itemObj.URL);
        if (!normUrl) continue;

        const itemHasPhone = hasValidPhone(itemObj.SoDienThoai);
        const itemStatus = itemHasPhone ? 'active' : 'inactive';

        if (urlToRowIndex.has(normUrl)) {
            const rowIndex = urlToRowIndex.get(normUrl)!;
            const row = rows[rowIndex];
            updatedCount++;

            // 1. Cập nhật trạng thái active / inactive theo số điện thoại
            if (statusIdx !== -1) {
                row[statusIdx] = itemStatus;
            }

            // 2. Cập nhật tất cả các trường dữ liệu theo URL mới nhất
            for (const key of keys) {
                if (key === 'TrangThai') continue;
                const hName = config[key]?.header || String(key);
                const colIdx = headers.indexOf(hName);
                if (colIdx === -1) continue;

                if (key === 'URL') {
                    if (itemObj.URL) {
                        row[colIdx] = String(itemObj.URL).trim();
                    }
                } else if (key === 'SoDienThoai') {
                    if (itemObj.SoDienThoai && String(itemObj.SoDienThoai).trim() !== "") {
                        const formatter = (config as any).SoDienThoai?.formatter;
                        row[colIdx] = formatter ? formatter(itemObj.SoDienThoai) : String(itemObj.SoDienThoai).trim();
                    }
                } else {
                    const rawVal = itemObj[key];
                    if (rawVal !== undefined && rawVal !== null && rawVal !== "" && !(Array.isArray(rawVal) && rawVal.length === 0)) {
                        const formatter = config[key]?.formatter;
                        const val = formatter ? formatter(rawVal) : String(rawVal);
                        row[colIdx] = val;
                    }
                }
            }
        } else {
            addedCount++;
            const newRow = headers.map(h => {
                const key = keys.find(k => (config[k]?.header || String(k)) === h);
                if (!key) return '';
                if (key === 'TrangThai') return itemStatus;
                const rawVal = itemObj[key];
                if (rawVal === undefined || rawVal === null) return '';
                const formatter = config[key]?.formatter;
                return formatter ? formatter(rawVal) : String(rawVal ?? "");
            });
            rows.push(newRow);
            urlToRowIndex.set(normUrl, rows.length - 1);
        }
    }

    let activeCount = 0;
    let inactiveCount = 0;
    if (statusIdx !== -1) {
        rows.forEach(r => {
            if (!r[statusIdx]) {
                const phone = phoneIdx !== -1 ? r[phoneIdx] : '';
                r[statusIdx] = hasValidPhone(phone) ? 'active' : 'inactive';
            }
            if (r[statusIdx] === 'active') activeCount++;
            else inactiveCount++;
        });
    }

    return {
        headers,
        rows,
        stats: {
            total: rows.length,
            updated: updatedCount,
            added: addedCount,
            active: activeCount,
            inactive: inactiveCount
        }
    };
}

export async function saveOrUpdateAllData<T>(
    config: CsvConfig<T>,
    results: T[],
    sheetName: string = "AllData"
) {
    const keys = Object.keys(config) as (keyof T)[];
    const defaultHeaders = keys.map((k) => config[k]?.header || String(k));

    const sheets = getSheetsClient();
    let existingHeaders: string[] = [];
    let existingRows: string[][] = [];

    // 1. Đọc dữ liệu hiện có từ Google Sheets (nếu có cấu hình)
    if (sheets && spreadsheetId) {
        await ensureSheetExists(sheetName, defaultHeaders);
        const sheetData = await getSheetData(sheetName);
        if (sheetData && sheetData.length > 0) {
            existingHeaders = sheetData[0];
            existingRows = sheetData.slice(1);
        }
    } else {
        // Fallback: Đọc từ file master CSV local nếu có
        const masterCsvPath = path.resolve(`export_escort_data_${sheetName}.csv`);
        if (fs.existsSync(masterCsvPath)) {
            const rawContent = fs.readFileSync(masterCsvPath, "utf8").replace(/^\uFEFF/, "").trim();
            if (rawContent) {
                const lines = rawContent.split("\n").map(l => l.trim()).filter(Boolean);
                if (lines.length > 0) {
                    existingHeaders = parseCsvLine(lines[0]);
                    existingRows = lines.slice(1).map(parseCsvLine);
                }
            }
        }
    }

    // 2. Thực hiện upsert / merge dữ liệu
    const { headers, rows, stats } = upsertRecords(existingHeaders, existingRows, results, config);

    // 3. Ghi ra file CSV Master AllData
    const masterCsvPath = path.resolve(`export_escort_data_${sheetName}.csv`);
    const csvContent = [
        headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","),
        ...rows.map(row => row.map(val => `"${String(val ?? "").replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    fs.writeFileSync(masterCsvPath, "\uFEFF" + csvContent, "utf8");
    console.log(`✅ Saved master CSV: ${masterCsvPath} (Total: ${stats.total} | Added: ${stats.added} | Updated: ${stats.updated} | Active: ${stats.active} | Inactive: ${stats.inactive})`);

    // Ghi thêm bản snapshot ngày để backup
    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyCsvPath = path.resolve(`export_escort_data_${todayStr}.csv`);
    fs.writeFileSync(dailyCsvPath, "\uFEFF" + csvContent, "utf8");

    // 4. Đồng bộ lên Google Sheets sheet AllData
    if (sheets && spreadsheetId && sheetName) {
        try {
            await ensureSheetExists(sheetName, headers);
            const values = [headers, ...rows];

            // Xóa sạch vùng cũ và ghi đè trọn vẹn AllData (chỉ 2 API calls nhanh và chuẩn)
            await sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `'${sheetName}'`,
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${sheetName}'!A1`,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`✅ Synced to Google Sheets [${sheetName}]: Total ${stats.total} rows (${stats.added} new, ${stats.updated} updated, ${stats.active} active, ${stats.inactive} inactive)`);
        } catch (error) {
            console.error('Error syncing Google Sheets:', error);
        }
    }

    return { headers, rows, stats };
}

// Function to update master sheet from daily sheet, adding & updating records based on URL uniqueness
export async function updateMasterFromDaily(dailySheetName: string, masterSheetName: string = 'AllData', config?: CsvConfig<any>) {
    const sheets = getSheetsClient();
    if (!sheets || !spreadsheetId) return;

    try {
        await ensureSheetExists(masterSheetName);

        const dailyData = await getSheetData(dailySheetName);
        const masterData = await getSheetData(masterSheetName);

        if (dailyData.length === 0) {
            console.log(`No data in daily sheet: ${dailySheetName}`);
            return;
        }

        const dailyHeaders = dailyData[0];
        const dailyRows = dailyData.slice(1);

        const masterHeaders = masterData.length > 0 ? masterData[0] : dailyHeaders;
        const masterRows = masterData.length > 0 ? masterData.slice(1) : [];

        // Build mapping config if not provided
        const effectiveConfig: CsvConfig<any> = config || {};
        if (Object.keys(effectiveConfig).length === 0) {
            dailyHeaders.forEach(h => {
                let keyName = h;
                const lower = h.toLowerCase();
                if (lower === 'url') keyName = 'URL';
                else if (lower === 'số điện thoại' || lower === 'sdt') keyName = 'SoDienThoai';
                else if (lower === 'trạng thái') keyName = 'TrangThai';

                (effectiveConfig as any)[keyName] = {
                    header: h,
                    formatter: keyName === 'SoDienThoai'
                        ? (val: any) => (val && String(val).trim()) ? " '" + String(val).trim().replace(/^'\s*|\s*$/g, '') + " " : ""
                        : undefined
                };
            });
        }

        const headerToKey = new Map<number, string>();
        dailyHeaders.forEach((h, idx) => {
            const entry = Object.entries(effectiveConfig).find(([_, v]: [string, any]) => v?.header?.toLowerCase() === h.toLowerCase());
            if (entry) {
                headerToKey.set(idx, entry[0]);
            } else {
                headerToKey.set(idx, h);
            }
        });

        const dailyRecords = dailyRows.map(row => {
            const obj: any = {};
            row.forEach((val, idx) => {
                const key = headerToKey.get(idx);
                if (key) {
                    obj[key] = val;
                }
            });
            return obj;
        });

        const { headers, rows, stats } = upsertRecords(masterHeaders, masterRows, dailyRecords, effectiveConfig);

        const values = [headers, ...rows];
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `'${masterSheetName}'`,
        });
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `'${masterSheetName}'!A1`,
            valueInputOption: 'RAW',
            requestBody: { values },
        });

        console.log(`✅ Synced master sheet [${masterSheetName}] from daily [${dailySheetName}]: Total ${stats.total} (Added: ${stats.added}, Updated: ${stats.updated}, Active: ${stats.active}, Inactive: ${stats.inactive})`);
    } catch (error) {
        console.error('Error updating master from daily:', error);
    }
}