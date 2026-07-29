import "dotenv/config";
import { chromium } from "playwright";
import { csvMapping, nextPage, readAll, readCsv, sleep, getSheetName, configureAntiSpam, getRandomDelay, navigateWithRetry } from "./util";
import { saveToCSV, ensureSheetExists } from "./csv.util";

export const base_Url = process.env.BASE_URL;

async function main(urlArg?: string): Promise<void> {
    const baseUrl = urlArg || process.env.BASE_URL;
    if (!baseUrl) {
        throw new Error("Invalid URL: Please provide a URL argument (e.g. `npm start <url>`) or set BASE_URL in your .env file.");
    }

    console.log("Running scrap from url: ", baseUrl);
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const context = await browser.newContext({
        userAgent: process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        extraHTTPHeaders: {
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"'
        }
    });
    await configureAntiSpam(context);
    const page = await context.newPage();

    let pageIndex = 1;
    const csvData = [];

    // Ensure the sheet exists before starting
    const keys = Object.keys(csvMapping) as (keyof typeof csvMapping)[];
    const headers = keys.map((k) => csvMapping[k]?.header).filter((h): h is string => h !== undefined);
    const sheetName = "AllData";
    await ensureSheetExists(sheetName, headers);
    while (true) {
        const pageUrl = baseUrl + nextPage(pageIndex);
        console.log(`[AntiSpam] Navigating to list page ${pageIndex}: ${pageUrl}`);
        const success = await navigateWithRetry(page, pageUrl);
        if (!success) {
            console.error(`Failed to load list page ${pageIndex}. Terminating crawl.`);
            break;
        }

        await page.waitForSelector("body", { timeout: 10000 });
        try {
            await page.waitForSelector("div.product-grid a, div.escort-list a, .product-grid a, .escort-list a", { timeout: 10000 });
        } catch (_) {}
        
        const listDelay = getRandomDelay();
        await sleep(listDelay);

        const links: string[] = await page.$$eval(
            "div.escort-list a, div.product-grid a, .escort-list a, .product-grid a, a[href*='/gai-goi/']",
            (as) => as.map((a) => (a as HTMLAnchorElement).href)
                      .filter(Boolean)
                      .filter(href => /\/gai-goi\/\d+(\/|$)/.test(href))
        );

        const uniqueLinks = [...new Set(links)];
        console.log(`Found ${uniqueLinks.length} detail links on page ${pageIndex}`);
        const results = await readAll(context, 1000, uniqueLinks);
        csvData.push(...results);
        pageIndex++;
        if (!(results.length >= 1)) break;
    }

    await saveToCSV("export", csvMapping, csvData, sheetName);
    await browser.close();
}

const urlArg = process.argv.slice(2).join(' ') || undefined;
main(urlArg).catch((err) => {
    console.error("Fatal error:", err);
});