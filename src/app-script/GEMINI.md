# Apps Script Directory Rules & Conventions

Khi làm việc với các file trong thư mục `src/app-script/`, tuân thủ các quy tắc sau:

1. **QUY TẮC BẮT BUỘC: Log Trace xuyên suốt vòng đời Request**:
   - Mọi request (đặc biệt là webhook POST và GET diagnostics) phải được sinh `traceId` và ghi log có cấu trúc qua `logTrace(traceId, stage, message, meta)`.
   - Các stage ghi nhận bao gồm: `REQ_RECEIVED`, `REQ_RAW_PAYLOAD`, `LOCK_ACQUIRED`, `PAYLOAD_PARSED`, `DEDUP_CHECK`, `AUTH_CHECK`, `AI_RULE_*`, `SHEET_QUERY_*`, `SEND_*`, `REQ_COMPLETE`.

2. **QUY TẮC BẮT BUỘC: Viết chú thích (Comments) hoàn toàn bằng tiếng Anh (English)**:
   - Tất cả inline comments `//`, block comments `/* ... */`, và JSDoc `/** ... */` trong mã nguồn BẮT BUỘC PHẢI VIẾT BẰNG TIẾNG ANH.

3. **QUY TẮC BẮT BUỘC: Toàn bộ xử lý Telegram nằm trong `telegram.js`**:
   - Mọi logic liên quan đến Telegram (xử lý webhook request `handleTelegramWebhook(e)`, xác thực chat ID, deduplication cache, job queue + trigger processor `processTelegramQueue()`, khóa `LockService`, parse lệnh `/start`/`/help`, format HTML message, gửi tin nhắn, diagnostics, check connection, prompt menu UI) **PHẢI ĐƯỢC ĐẶT TRONG `telegram.js`**.
   - Webhook chỉ dedup + enqueue + trả `OK` ngay; KHÔNG gọi AI / đọc Sheet / gửi tin trong `doPost` (Telegram sẽ retry và gây trùng tin nhắn).
   - `apps-script.js` chỉ là thin entrypoint tiếp nhận `doPost` (gọi `handleTelegramWebhook`), `doGet` (gọi `getTelegramDiagnostics`), và khai báo menu `onOpen`.

4. **Global Scope & Runtime V8**:
   - Tất cả các file `.js` cùng chia sẻ một global scope trên Google Apps Script runtime.
   - Không dùng `import`/`export` ES Modules trực tiếp.
   - Không khai báo trùng lặp biến `const`/`let` ở top-level giữa các file.
   - Luôn thêm guard `if (typeof module !== 'undefined' && module.exports)` ở cuối file để hỗ trợ Node.js testing.

5. **Cấu hình & Secrets**:
   - Luôn đọc secret và config qua helper trong `config.js` (`PropertiesService.getScriptProperties()`). Tuyệt đối không hardcode credentials trong source.

6. **Telegram HTML & UX**:
   - Luôn bọc chuỗi nội dung bằng `escapeHtml()` khi dùng `parse_mode: "HTML"`.
   - Bọc số điện thoại bằng thẻ `<code>...</code>` để hỗ trợ tap-to-copy.
   - Chunk tin nhắn tối đa 3800 ký tự qua `buildResultMessages` để không vượt quá giới hạn 4096 ký tự của Telegram.

7. **Tối ưu Sheet**:
   - Đọc dữ liệu theo batch (`getDataRange().getValues()`) và xử lý trên mảng in-memory thông qua `DataQuery` class trong `filter.js`.

8. **Clasp Deploy**:
   - Deploy code với `npm run push:script` hoặc `npm run deploy:script`.
