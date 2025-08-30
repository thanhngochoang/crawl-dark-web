import { Page, Browser } from "puppeteer";
import { CsvConfig, EscortData } from "./model";
import { appendToCSV, readCsvToObject } from "./csv.util";

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

export const scrapeEscortPage = async function (link: string, browser: Browser): Promise<EscortData> {
  const page = await browser.newPage();

  try {
    await page.goto(link, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector(".main-content-escort", { timeout: 10000 });

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


      const attrLabels = Array.from(document.querySelectorAll(".attributes .col-md-4, .attributes .col-4"));
      const attrValues = Array.from(document.querySelectorAll(".attributes .col-md-8, .attributes .col-8"));
      const elementCreate = document.querySelectorAll(".main-content-escort")[0].nextElementSibling?.querySelectorAll('.content-left .card-sub .float-right');
      for (let i = 0; i < attrLabels.length; i++) {

        const label = normalize(clean(attrLabels[i].textContent));

        const value = clean(attrValues[i]?.textContent);

        if (label.includes("gia")) {
          result.Gia = value;
        } else if (label.includes("so dien thoai")) {
          const telLink = attrValues[i]?.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
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
        }
      }
      const elementView = (elementCreate ? elementCreate[1].textContent : "")?.trim().split(' ').filter(x => !!x)

      result.NgayTao = elementView && elementView?.length > 2 ? elementView?.[2] : "";
      result.LuotXem = elementView && elementView?.length > 0 ? elementView?.[0] : "";
      // 3. Extract services
      const servicesSection = document.querySelector(".services");
      if (servicesSection) {
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
  ChieuCao: { header: "Chiều Cao" },
  CanNang: { header: "Cân Nặng" },
  XuatXu: { header: "Xuất xứ" },
  SoDo3Vong: { header: "Số đồ 3 vòng" },
  KhuVuc: { header: "Khu Vực" },
  DiaChi: { header: "Địa chỉ" }
};

export const readAll = async (browser: Browser, batchSize: number, uniqueLinks: string[]) => {
  const results: EscortData[] = [];
  for (const link of uniqueLinks) {
    if (batchSize <= 0) break;
    batchSize--;
    console.log(`Scraping [${uniqueLinks.indexOf(link) + 1}:${uniqueLinks.length}] ${link}`);
    const data = await scrapeEscortPage(link, browser);
    appendToCSV('log', csvMapping, [data]);
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