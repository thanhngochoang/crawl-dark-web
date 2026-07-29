import { Page, BrowserContext, Browser } from "playwright";
import { CsvConfig, EscortData } from "./model";
import { appendToCSV, ensureSheetExists, readCsvToObject } from "./csv.util";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const context = 'newContext' in browser ? await browser.newContext() : browser;
  const page = await context.newPage();

  try {
    try {
      await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      console.warn("Navigation timeout or network error, proceeding with available DOM...", (e as Error).message);
    }

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
      Images: []
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
    formatter: (value) => " '" + String(value ?? "") + " "
  },
  NamSinh: { header: "Năm Sinh" },
  NgayTao: { header: "Ngày Tạo" },
  LuotXem: { header: "Lượt Xem" },
  KhuVuc: { header: "Khu Vực" },
  CanNang: { header: "Cân Nặng" },
  ChieuCao: { header: "Chiều Cao" },
  XuatXu: { header: "Xuất xứ" },
  SoDo3Vong: { header: "Số đồ 3 vòng" },
  DiaChi: { header: "Địa chỉ" }
};

export const readAll = async (browser: BrowserContext | Browser, batchSize: number, uniqueLinks: string[]) => {
  const results: EscortData[] = [];
  const sheetName = getSheetName();
  await ensureSheetExists(sheetName);

  for (const link of uniqueLinks) {
    if (batchSize <= 0) break;
    batchSize--;
    console.log(`Scraping [${uniqueLinks.indexOf(link) + 1}:${uniqueLinks.length}] ${link}`);
    const data = await scrapeEscortPage(link, browser);
    await appendToCSV('log', csvMapping, [data], sheetName);
    data.SoDienThoai && results.push(data);
    await sleep(1000);
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