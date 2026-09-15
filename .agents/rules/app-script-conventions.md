# Google Apps Script Conventions & Rules

Tài liệu quy chuẩn và hướng dẫn phát triển cho module **Google Apps Script** (`src/app-script/`).

---

## 1. Cấu trúc thư mục & Phân định trách nhiệm (Separation of Concerns)

Thư mục gốc của Apps Script là `src/app-script/` (được cấu hình trong `.clasp.json`):

| File | Trách nhiệm chính |
| :--- | :--- |
| `apps-script.js` | **Thin Entrypoint**: Chỉ tiếp nhận `doGet(e)` (gọi `getTelegramDiagnostics`), `doPost(e)` (gọi `handleTelegramWebhook`), và khởi tạo menu Google Sheet `onOpen()`. |
| `telegram.js` | **Toàn bộ xử lý Telegram & Logging Trace**: Webhook update processing (`handleTelegramWebhook`), trace logging (`logTrace`, `generateTraceId`), chống lặp (CacheService), chống race condition (LockService), kiểm tra Chat ID, xử lý lệnh `/start`, `/help`, format HTML message (tap-to-copy, phân trang <= 3800 chars), gửi tin nhắn, setup/remove webhook, và các UI prompts kết nối Telegram. |
| `config.js` | Quản trị tập trung Script Properties (`PropertiesService`), helper getters/setters cho secrets & config. |
| `helper.js` | Prompt builder, tích hợp AI Query Engine (Cloudflare Workers AI & Gemini AI fallback) có gắn kèm `traceId`. |
| `filter.js` | Xử lý dữ liệu in-memory, `DataQuery` class, chuẩn hóa text/unicode, coerce number, caching. |
| `sheet.js` | Tương tác đọc dữ liệu từ Spreadsheet, parser các cột (`Giá`, `Năm Sinh`, `Số đồ 3 vòng`,...). |
| `appsscript.json` | GAS Project Manifest (V8 runtime, OAuth scopes, timezone, Web App settings). |

---

## 2. Quy tắc bắt buộc: Toàn bộ xử lý Telegram phải đặt trong `telegram.js`

> [!IMPORTANT]
> **Tất cả mã nguồn và nghiệp vụ liên quan đến Telegram PHẢI nằm trong `telegram.js`:**
> 1. **Webhook Handler**: Hàm `handleTelegramWebhook(e)` đảm nhiệm nhận update, giải mã payload, xác thực `chat_id`, quản lý Lock, deduplication cache, điều hướng câu hỏi cho AI và gửi trả kết quả.
> 2. **Format Message & UX**: Toàn bộ hàm format tin nhắn (`escapeHtml`, `formatResultItem`, `buildResultMessages`, `cleanPhoneNumber`, `sendResultData`, `sendTelegramMessage`) đặt tại `telegram.js`.
> 3. **Quản lý Webhook & Kiểm tra kết nối**: `setWebhook`, `removeWebhook`, `updateDeployedUrlAndSetWebhook`, `checkTelegramConnection`, `getTelegramDiagnostics`, cùng các hàm UI Prompt (`promptTestTelegramConnection`, `promptUpdateWebhook`, `checkTelegramWebhookStatus`).
> 4. `apps-script.js` **KHÔNG** chứa logic nghiệp vụ của Telegram mà chỉ ủy quyền:
>    ```javascript
>    function doPost(e) {
>      return handleTelegramWebhook(e);
>    }
>    ```

---

## 3. Quy tắc bắt buộc: Log Trace xuyên suốt vòng đời Request (End-to-End Observability)

> [!IMPORTANT]
> **Mỗi request webhook tiếp nhận phải có Log Trace chi tiết từ đầu đến cuối:**
> 1. **Khởi tạo Trace ID**: Tạo `traceId` độc nhất (`generateTraceId()`) ngay khi request bắt đầu.
> 2. **Cấu trúc Log Trace chuẩn**:
>    `[TRACE][<ISO_TIMESTAMP>][<TRACE_ID>][<STAGE>] <Message> | Data: <JSON>`
> 3. **Các Stage bắt buộc phải ghi nhận**:
>    - `REQ_RECEIVED`: Nhận request POST từ Telegram Webhook.
>    - `REQ_RAW_PAYLOAD`: Raw payload length, type, snippet.
>    - `LOCK_ACQUIRED`: Trạng thái acquire LockService và thời gian chờ (ms).
>    - `PAYLOAD_PARSED`: Update ID, Message ID, Chat ID, Sender, Query text.
>    - `DEDUP_PASSED` / `DEDUP_SKIPPED`: Kết quả kiểm tra CacheService chống trùng.
>    - `AUTH_PASSED` / `AUTH_MISMATCH`: Kết quả kiểm tra xác thực Chat ID.
>    - `AI_RULE_START` / `AI_RULE_SUCCESS` / `AI_RULE_FAILED`: Quá trình gọi Cloudflare Workers AI / Gemini AI và kết quả bóc tách JSON rule.
>    - `SHEET_QUERY_START` / `SHEET_QUERY_DONE`: Sheet mục tiêu, số lượng record khớp và thời gian truy vấn.
>    - `SEND_RESULT` / `SEND_CHUNK` / `SEND_MSG_COMPLETE`: Gom nhóm chunk tin nhắn, độ dài ký tự và kết quả gọi Telegram API.
>    - `REQ_COMPLETE`: Tổng thời gian xử lý toàn bộ request (ms) và trạng thái cuối cùng.

---

## 4. Quy tắc bắt buộc: Viết chú thích (Comments) hoàn toàn bằng tiếng Anh

> [!IMPORTANT]
> **Toàn bộ chú thích trong mã nguồn (Code Comments, JSDoc, Docstrings) BẮT BUỘC PHẢI VIẾT BẰNG TIẾNG ANH (English).**
> - Không dùng tiếng Việt trong inline comments `//`, block comments `/* ... */`, và JSDoc `/** ... */`.
> - (Ngoại trừ nội dung chuỗi tin nhắn gửi người dùng cuối hoặc prompt template phục vụ bóc tách tiếng Việt của AI).

---

## 5. V8 Runtime & Phạm vi biến (Global Scope)

1. **GAS Flat Global Scope**:
   - Mọi file `.js` trong `src/app-script/` khi deploy lên Google Apps Script sẽ cùng chia sẻ một global scope chung.
   - Không dùng cú pháp `import` / `export` của ES Modules trực tiếp trong source GAS.
   - **Tránh xung đột tên**: Tuyệt đối không đặt tên hàm hoặc biến `const` / `let` ở top-level trùng nhau giữa các file.
   - Khuyến khích sử dụng hàm getter (ví dụ `getTelegramApiKey()`) thay vì biến global tĩnh khởi tạo một lần để đảm bảo luôn đọc giá trị mới nhất.

2. **Khả năng tương thích Node.js / Local Test (CommonJS Guard)**:
   - Cuối mỗi file `.js`, luôn sử dụng pattern guard sau để export hàm khi chạy trong môi trường Node.js / test suite:
     ```javascript
     if (typeof module !== 'undefined' && module.exports) {
         module.exports = {
             functionA,
             functionB,
         };
     }
     ```

---

## 6. Quản lý Cấu hình & Secrets (PropertiesService)

1. **Không Hardcode Secrets**:
   - Tuyệt đối không lưu API Key, Bot Token, Chat ID hay SpreadSheet ID trực tiếp trong mã nguồn.
   - Mọi cấu hình phải được lưu và đọc từ `PropertiesService.getScriptProperties()` qua các getter trong `config.js`.

2. **Các khóa cấu hình chuẩn (Script Properties)**:
   - `TELEGRAM_BOT_TOKEN`: Token của Telegram Bot API.
   - `TELEGRAM_CHAT_ID`: Chat ID của người nhận / nhóm được cấp phép.
   - `SPREADSHEET_ID`: ID Spreadsheet (sử dụng khi script chạy dạng standalone).
   - `DEPLOYED_URL`: URL Web App (`/exec`) của Apps Script dùng cho Webhook.
   - `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_TOKEN`: Dùng để gọi Cloudflare Workers AI.
   - `CLOUDFLARE_MODEL`: Tên model Cloudflare (mặc định `@cf/qwen/qwen2.5-7b-instruct`).
   - `GEMINI_API_KEY`: API Key Google Gemini (dùng làm phương án fallback).

---

## 7. Xử lý Webhook, Concurrency & Idempotency (trong `telegram.js`)

> [!IMPORTANT]
> Telegram gửi lại (retry) cùng một `update_id` mỗi khi webhook không trả 2xx đủ nhanh. Vì vậy **webhook KHÔNG được xử lý nghiệp vụ nặng**; mọi xử lý AI / đọc Sheet / gửi tin phải chạy ngoài request HTTP.

1. **Kiến trúc Queue + Trigger (ACK-first)**:
   - `handleTelegramWebhook(e)` chỉ làm: parse payload → dedup → xác thực Chat ID → `enqueueTelegramJob(job)` (lưu vào Script Properties key `TG_JOB_<update_id>`) → `scheduleTelegramQueueProcessor()` → trả `OK` ngay (< 1s).
   - `processTelegramQueue()` là entrypoint của time-based trigger (`ScriptApp.newTrigger(...).timeBased().after(1000)`), chạy toàn bộ phần nặng qua `processTelegramJob(job)` và xóa trigger đã bắn khi hoàn tất (giới hạn 20 trigger/script).
   - Chỉ tạo trigger mới khi chưa có trigger đang chờ (cờ `TG_QUEUE_SCHEDULED` trong CacheService, được processor xóa khi bắt đầu chạy).
   - Job được **xóa trước khi xử lý**: mất một job khi crash chấp nhận được, gửi trùng thì không.

2. **LockService chống Race Conditions**:
   - Lock đặt trong `processTelegramQueue()` (không phải trong webhook). Nếu `tryLock` thất bại → thoát ngay, processor đang chạy sẽ xử lý nốt các job còn lại.
   - Luôn giải phóng lock trong block `finally`.

3. **Chống lặp tin nhắn (Deduplication)**:
   - Dedup **trước** mọi thao tác khác, theo `update_id` (`TG_UPD_*`) và `message_id` (`TG_MSG_*`) trong CacheService TTL 600s, kết hợp kiểm tra job đang chờ trong Script Properties.
   - Bỏ qua `edited_message` — người dùng sửa tin nhắn không được xem là truy vấn mới.
   - Nếu phát hiện trùng, ghi log `DEDUP_SKIPPED` và trả về `ContentService.createTextOutput("OK")` ngay lập tức.

4. **Cấu hình Webhook**:
   - `setWebhook` luôn gửi `max_connections: 1` để Telegram giao update tuần tự; tham số `dropPendingUpdates=true` dùng một lần để xả backlog retry cũ.

5. **Xác thực bảo mật Chat ID**:
   - Kiểm tra `incomingChatId === expectedChatId` tại webhook, trước khi enqueue.

6. **Trace stages bổ sung**: `QUEUE_ENQUEUED`, `QUEUE_SCHEDULED` / `QUEUE_SCHEDULE_SKIP`, `QUEUE_RUN_START` / `QUEUE_BATCH` / `QUEUE_TRIGGERS_CLEANED` / `QUEUE_RUN_COMPLETE`, `JOB_START` / `JOB_COMPLETE` / `JOB_ERROR`. Job giữ nguyên `traceId` của webhook để log xuyên suốt một request.

---

## 8. Tối ưu hiệu năng Google Spreadsheet

1. **Hạn chế gọi API SpreadsheetApp trong vòng lặp**:
   - Luôn đọc dữ liệu dạng lô (batch read): `sheet.getDataRange().getValues()`.
   - Toàn bộ thao tác lọc, sắp xếp, gom nhóm, tìm kiếm phải thực hiện trên mảng bộ nhớ (in-memory) bằng `filter.js` / `DataQuery`.

2. **Sử dụng Caching Layer**:
   - Sử dụng `DataQuery.fromSheet(...)` để tận dụng in-memory cache và `CacheService` nhằm giảm số lần đọc Sheet khi có nhiều truy vấn liên tiếp.

---

## 9. Định dạng tin nhắn & Telegram UX

1. **Escape HTML An toàn**:
   - Khi gửi tin nhắn với `parse_mode: "HTML"`, mọi dữ liệu người dùng / dữ liệu từ sheet đều phải được bọc qua hàm `escapeHtml()` để tránh lỗi cú pháp parse HTML của Telegram.

2. **Tap-to-copy cho Số điện thoại**:
   - Chuẩn hóa số điện thoại bằng `cleanPhoneNumber()` và bọc trong thẻ `<code>` (ví dụ `<code>0901234567</code>`) giúp người dùng Telegram chạm một lần là sao chép được.

3. **Giới hạn kích thước tin nhắn & Chunking**:
   - Telegram giới hạn tối đa 4096 ký tự/tin nhắn.
   - Luôn giới hạn độ dài mỗi tin nhắn không quá **3800 ký tự** và phân tách thành nhiều tin nhắn nếu kết quả dài (sử dụng hàm `buildResultMessages`).
   - Giới hạn số lượng bản ghi hiển thị (mặc định tối đa 30 kết quả đầu) kèm thông báo tổng số tìm thấy.

---

## 10. AI Query Engine & Prompt Engineering

1. **JSON Rule Schema nghiêm ngặt**:
   - Prompt AI phải yêu cầu trả về đúng cấu trúc `{ logic: "and" | "or", filters: [...] }` với danh sách field hợp lệ và toán tử cho phép.

2. **Loại bỏ Markdown Fences**:
   - AI có thể trả về block \`\`\`json ... \`\`\`. Luôn làm sạch chuỗi trước khi `JSON.parse()`:
     ```javascript
     aiResponse = aiResponse.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
     ```

3. **Fallback Strategy**:
   - Thứ tự ưu tiên AI: Cloudflare Workers AI -> Google Gemini AI -> Thông báo lỗi thân thiện cho người dùng.

---

## 11. Quy trình Deploy với Clasp

1. **Lệnh phát triển & deploy**:
   - Push code lên Google Apps Script:
     ```bash
     npm run push:script       # clasp push
     ```
   - Deploy phiên bản mới:
     ```bash
     npm run deploy:script     # clasp push && clasp deploy
     ```

2. **Cập nhật Webhook sau khi Deploy**:
   - Sau khi tạo phiên bản Web App mới, thực hiện cập nhật Webhook qua Custom Menu trên Google Sheet (`🤖 Telegram Bot -> Cập nhật Webhook`) hoặc hàm `updateDeployedUrlAndSetWebhook()`.
