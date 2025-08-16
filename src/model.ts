export interface EscortData {
  URL: string;
  Gia: string;
  SoDienThoai: string;
  Pass: string;
  NamSinh: string;
  ChieuCao: string;
  CanNang: string;
  XuatXu: string;
  SoDo3Vong: string;
  KhuVuc: string;
  DiaChi: string;
  DichVu: string[];
  Images: string[];
}

export type CsvConfig<T> = Partial<Record<keyof T, { header: string; formatter?: (value: any) => string }>>;