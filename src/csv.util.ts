import { CsvConfig, EscortData } from "./model";
import fs from "fs";
import path from "path";

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

export function saveToCSV<T>(prefix: string, config: CsvConfig<T>, results: T[]) {
    const { header, mapRow } = getCSVConfig(config);
    const csvRows = [
        header.join(","),
        ...results.map(mapRow)
    ];

    const outPath = path.resolve(`${prefix}_escort_data_${new Date().toISOString().slice(0, 10)}.csv`);
    fs.writeFileSync(outPath, "\uFEFF" + csvRows.join("\n"), "utf8");

    console.log(`✅ Saved CSV: ${outPath}`);
};
export function appendToCSV<T>(prefix: string, config: CsvConfig<T>, rows: T[]) {
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