import { CsvConfig, EscortData } from "./model";
import fs from "fs";
import path from "path";
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';

// Google Sheets setup
const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
export const spreadsheetId = process.env.SPREADSHEET_ID || "1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ";

const auth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

export async function ensureSheetExists(sheetName: string, headers?: string[]) {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    const sheetExists = response.data.sheets?.some(sheet => sheet.properties?.title === sheetName);
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

    if (spreadsheetId && sheetName) {
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
export async function appendToCSV<T>(prefix: string, config: CsvConfig<T>, rows: T[],  sheetName?: string) {
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

    if (spreadsheetId && sheetName) {
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
//https://docs.google.com/spreadsheets/d/1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ/edit?gid=0#gid=0