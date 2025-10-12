import puppeteer from "puppeteer";
import { csvMapping, nextPage, readAll, readCsv, sleep, getSheetName } from "./util";
import { saveToCSV, ensureSheetExists } from "./csv.util";

export const base_Url = process.env.BASE_URL
async function main(baseUrl?: string): Promise<void> {
    if (!baseUrl) throw new Error("Invalid URL");

    console.log("Running scrap from url: ", baseUrl)
    console.log("Running scrap from env url: ", base_Url)
    const debug = false;
    const browser = await puppeteer.launch({ headless: true, devtools: debug, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    let pageIndex = 1;
    const csvData = [];

    // Ensure the sheet exists before starting
    const keys = Object.keys(csvMapping) as (keyof typeof csvMapping)[];
    const headers = keys.map((k) => csvMapping[k]?.header).filter((h): h is string => h !== undefined);
    const sheetName = getSheetName();
    await ensureSheetExists(sheetName, headers);
    while (true) {

        await page.goto(baseUrl + nextPage(pageIndex++), { waitUntil: "networkidle2" });
        await page.waitForSelector("div.escort-list a", { timeout: 20000 });
        //   await autoScroll(page);
        await sleep(1000);

        const links: string[] = await page.$$eval("div.escort-list > a", (as) =>
            as.map((a) => (a as HTMLAnchorElement).href).filter(Boolean)
        );

        const uniqueLinks = [...new Set(links)];
        const results = await readAll(browser, 1000, uniqueLinks);
        csvData.push(...results);
        pageIndex++;
        if (!(results.length > 1)) break;
    }

    await saveToCSV("export", csvMapping, csvData, sheetName);
    await browser.close();
}

const urlArg = process.argv.slice(2).join(' ') || undefined;
main(urlArg).catch((err) => {
    console.error("Fatal error:", err);
});