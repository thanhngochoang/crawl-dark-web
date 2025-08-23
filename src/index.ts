import puppeteer from "puppeteer";
import { csvMapping, nextPage, readAll, readCsv, sleep } from "./util";
import { saveToCSV } from "./csv.util";


async function main(url: string): Promise<void> {
    const debug = false;
    const browser = await puppeteer.launch({ headless: true, devtools: debug });
    const page = await browser.newPage();
    let pageIndex = 1;
    const csvData = [];
    while (true) {

        await page.goto(url + nextPage(pageIndex++), { waitUntil: "networkidle2" });
        await page.waitForSelector("div.escort-list a", { timeout: 20000 });
        //   await autoScroll(page);
        await sleep(1000); // thay thế page.waitForTimeout(1000)

        const links: string[] = await page.$$eval("div.escort-list > a", (as) =>
            as.map((a) => (a as HTMLAnchorElement).href).filter(Boolean)
        );

        const uniqueLinks = [...new Set(links)];
        const results = await readAll(browser, 1000, uniqueLinks);
        csvData.push(...results);
        pageIndex++;
        if (!(results.length > 1)) break;
    }
    
    saveToCSV("export", csvMapping, csvData);
    await browser.close();
}

main("https://gaigu41.tv/gai-goi/sai-gon?a=20").catch((err) => {
    console.error("Fatal error:", err);
});