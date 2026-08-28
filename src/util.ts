import { Page, BrowserContext, Browser } from "playwright";
import { CsvConfig, EscortData } from "./model";
import { appendToCSV, ensureSheetExists, readCsvToObject } from "./csv.util";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getRandomDelay = (
  minMs = parseInt(process.env.CRAWL_MIN_DELAY_MS || "1500", 10),
  maxMs = parseInt(process.env.CRAWL_MAX_DELAY_MS || "3500", 10)
): number => {
  const min = Math.min(minMs, maxMs);
  const max = Math.max(minMs, maxMs);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export async function configureAntiSpam(target: BrowserContext | Page): Promise<void> {
  if (process.env.BLOCK_RESOURCES === "true") {
    await target.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf,mp4,mp3}", (route) => route.abort());
  }
}

export async function navigateWithRetry(
  page: Page,
  url: string,
  options: Parameters<Page['goto']>[1] = { waitUntil: "domcontentloaded", timeout: 30000 },
  maxRetries = parseInt(process.env.CRAWL_MAX_RETRIES || "3", 10)
): Promise<boolean> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await page.goto(url, options);
      const status = response?.status();

      if (status === 429 || status === 503) {
        attempt++;
        const backoffMs = Math.pow(2, attempt) * 3000 + getRandomDelay(1000, 2000);
        console.warn(`[AntiSpam] Server status ${status} (Rate limited). Backing off for ${Math.round(backoffMs / 1000)}s (retry ${attempt}/${maxRetries})...`);
        await sleep(backoffMs);
        continue;
      }
      return true;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        console.error(`[AntiSpam] Failed to load ${url} after ${maxRetries} retries: ${(err as Error).message}`);
        return false;
      }
      const backoffMs = Math.pow(2, attempt) * 2000 + getRandomDelay(500, 1500);
      console.warn(`[AntiSpam] Navigation warning (${(err as Error).message}). Retrying in ${Math.round(backoffMs / 1000)}s (retry ${attempt}/${maxRetries})...`);
      await sleep(backoffMs);
    }
  }
  return false;
}

export function getSheetName(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

export const scrapeEscortPage = async function (link: string, browser: BrowserContext | Browser): Promise<EscortData> {
  const isCreatedContext = 'newContext' in browser;
  const context = isCreatedContext ? await browser.newContext({
    userAgent: process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"'
    }
  }) : browser;

  await configureAntiSpam(context);
  const page = await context.newPage();

  try {
    await navigateWithRetry(page, link);

    try {
      await page.waitForSelector(".attr-row, .main-content-escort, body", { timeout: 10000 });
    } catch (_) {}

    const data = await page.evaluate(() => {
      const clean = (s?: string | null): string =>
        s?.replace(/\s+/g, " ").trim() || "";

      const normalize = (s: string): string =>
        s.normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")                    // Chuyển đ -> d
          .replace(/Đ/g, "D").toLowerCase();
      const result: EscortData = {
        URL: window.location.href,
        Gia: "",
        SoDienThoai: "",
        Pass: "",
        NamSinh: "",
        NgayTao: "",
        ChieuCao: "",
        CanNang: "",
        XuatXu: "",
        SoDo3Vong: "",
        KhuVuc: "",
        DiaChi: "",
        DichVu: [],
        Images: []
      };


      const processKeyValue = (rawLabel: string, value: string, rowEl?: Element | null) => {
        const label = normalize(rawLabel);

        if (label.includes("thoi gian")) {
          // ignore or handle working hours if needed
        } else if (label.includes("gia")) {
          result.Gia = value;
        } else if (label.includes("so dien thoai") || label === "sdt") {
          const telLink = rowEl?.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
          result.SoDienThoai = telLink
            ? telLink.href.replace("tel:", "").trim()
            : value.replace(/[^\d+]/g, "").trim();
        } else if (label.includes("pass")) {
          result.Pass = value;
        } else if (label.includes("nam sinh")) {
          result.NamSinh = value;
        } else if (label.includes("chieu cao")) {
          result.ChieuCao = value;
        } else if (label.includes("can nang")) {
          result.CanNang = value;
        } else if (label.includes("xuat xu")) {
          result.XuatXu = value;
        } else if (label.includes("so do 3 vong")) {
          result.SoDo3Vong = value;
        } else if (label.includes("khu vuc")) {
          result.KhuVuc = value;
        } else if (label.includes("dia chi")) {
          result.DiaChi = value;
        } else if (label.includes("dich vu")) {
          const items = value.split(/\s*[-,-]\s*/).map(s => s.trim()).filter(Boolean);
          if (items.length > 0) {
            result.DichVu = items;
          }
        }
      };

      // 1. Legacy .attributes layout
      const attrLabels = Array.from(document.querySelectorAll(".attributes .col-md-4, .attributes .col-4"));
      const attrValues = Array.from(document.querySelectorAll(".attributes .col-md-8, .attributes .col-8"));
      for (let i = 0; i < attrLabels.length; i++) {
        const label = clean(attrLabels[i].textContent);
        const value = clean(attrValues[i]?.textContent);
        processKeyValue(label, value, attrValues[i]);
      }

      // 2. New .attr-row layout
      const attrRows = Array.from(document.querySelectorAll(".attr-row"));
      for (const row of attrRows) {
        const children = Array.from(row.children);
        const labelEl = children.find(el => el.tagName === "SPAN" && el.textContent && !el.querySelector("svg"));
        if (!labelEl) continue;

        const label = clean(labelEl.textContent);
        const labelIndex = children.indexOf(labelEl);

        const telLink = row.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
        let value = "";
        if (telLink) {
          value = telLink.href.replace("tel:", "").trim() || clean(telLink.textContent);
        } else {
          const valueEls = children.slice(labelIndex + 1);
          value = valueEls.map(el => clean(el.textContent)).filter(Boolean).join(" ");
        }

        processKeyValue(label, value, row);
      }

      // 3. Fallback for KhuVuc if empty but DiaChi exists
      if (!result.KhuVuc && result.DiaChi) {
        const parts = result.DiaChi.split(",").map(p => p.trim());
        if (parts.length >= 2) {
          result.KhuVuc = parts.slice(1).join(", ");
        } else {
          result.KhuVuc = result.DiaChi;
        }
      }

      // 4. Creation date and views
      const elementCreate = document.querySelectorAll(".page-main, .main-content-escort")[0]?.nextElementSibling?.querySelectorAll('.content-left .card-sub .float-right');
      const elementView = (elementCreate && elementCreate[1] ? elementCreate[1].textContent : "")?.trim().split(' ').filter(x => !!x);

      result.NgayTao = elementView && elementView?.length > 2 ? elementView?.[2] : "";
      result.LuotXem = elementView && elementView?.length > 0 ? elementView?.[0] : "";

      if (!result.NgayTao) {
        const bodyText = document.body.innerText;
        const dateMatch = bodyText.match(/(?:Ngày đăng|Đăng ngày|Ngày tạo):\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (dateMatch) {
          result.NgayTao = dateMatch[1];
        }
      }

      if (!result.LuotXem) {
        const bodyText = document.body.innerText;
        const viewMatch = bodyText.match(/(\d+[\d,.]*)\s*(?:lượt xem|Lượt xem)/i);
        if (viewMatch) {
          result.LuotXem = viewMatch[1];
        }
      }

      // 5. Extract services (legacy fallback)
      const servicesSection = document.querySelector(".services");
      if (servicesSection && result.DichVu.length === 0) {
        result.DichVu = Array.from(servicesSection.querySelectorAll("span"))
          .map(span => clean(span.textContent))
          .filter(Boolean);
      }

      const hasPhone = (s?: string | null): boolean => {
        if (!s) return false;
        const cleaned = s.replace(/[^\d+]/g, "").trim();
        return cleaned.length >= 7;
      };

      result.TrangThai = hasPhone(result.SoDienThoai) ? "active" : "inactive";
      return result;
    });

    return data;
  } catch (err) {
    console.error("Error scraping", link, (err as Error).message);
    return {
      URL: link,
      Gia: "",
      SoDienThoai: "",
      Pass: "",
      NamSinh: "",
      ChieuCao: "",
      NgayTao: "",
      CanNang: "",
      XuatXu: "",
      SoDo3Vong: "",
      KhuVuc: "",
      DiaChi: "",
      DichVu: [],
      Images: [],
      TrangThai: "inactive"
    };
  } finally {
    await page.close();
  }
}

export const csvMapping: CsvConfig<EscortData> = {
  URL: { header: "URL" },
  Gia: { header: "Giá" },
  SoDienThoai: {
    header: "Số điện thoại",
    formatter: (value) => (value && String(value).trim()) ? " '" + String(value).trim() + " " : ""
  },
  NamSinh: { header: "Năm Sinh" },
  NgayTao: { header: "Ngày Tạo" },
  LuotXem: { header: "Lượt Xem" },
  KhuVuc: { header: "Khu Vực" },
  CanNang: { header: "Cân Nặng" },
  ChieuCao: { header: "Chiều Cao" },
  XuatXu: { header: "Xuất xứ" },
  SoDo3Vong: { header: "Số đồ 3 vòng" },
  DiaChi: { header: "Địa chỉ" },
  TrangThai: { header: "Trạng thái" }
};

export const readAll = async (
  browser: BrowserContext | Browser,
  batchSize: number,
  uniqueLinks: string[],
  dailySheetName?: string
) => {
  const results: EscortData[] = [];
  const targetDailySheet = dailySheetName || getSheetName();
  await ensureSheetExists(targetDailySheet);

  for (const link of uniqueLinks) {
    if (batchSize <= 0) break;
    batchSize--;
    console.log(`Scraping [${uniqueLinks.indexOf(link) + 1}:${uniqueLinks.length}] ${link}`);
    const data = await scrapeEscortPage(link, browser);
    await appendToCSV('log', csvMapping, [data], targetDailySheet);
    results.push(data);
    const delay = getRandomDelay();
    console.log(`[AntiSpam] Waiting ${delay}ms before next request...`);
    await sleep(delay);
  }
  return results;
}
export function nextPage(page: number) {
  if (page <= 1) return '';
  return '&page=' + page

}
export function readCsv() {
  const a = readCsvToObject(csvMapping)
  console.log(a);

}