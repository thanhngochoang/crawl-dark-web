/**
 * Structured trace logger for end-to-end request lifecycle visibility
 */
function logTrace(traceId, stage, message, meta = null) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? (" | Data: " + (typeof meta === 'object' ? JSON.stringify(meta) : String(meta))) : "";
    Logger.log(`[TRACE][${timestamp}][${traceId || "NO_TRACE_ID"}][${stage}] ${message}${metaStr}`);
}

/**
 * Generate a unique trace ID for each incoming request
 */
function generateTraceId() {
    return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6);
}

/**
 * Escape HTML special characters to prevent Telegram HTML parser errors
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Format date value to dd/MM/yyyy format
 */
function formatDate(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

/**
 * Clean phone number and strip invalid characters for tap-to-copy
 */
function cleanPhoneNumber(phone) {
    if (!phone) return "";
    return String(phone).replace(/[^\d+]/g, "").trim();
}

/**
 * Format a single result row item with <code>phone</code> tag for tap-to-copy on Telegram
 */
function formatResultItem(item) {
    const rawPhone = item["Số điện thoại"] || "";
    const phone = cleanPhoneNumber(rawPhone) || String(rawPhone).replace(/'/g, "").trim();
    const gia = item["Giá"] ? String(item["Giá"]).trim() : "";
    const namSinh = item["Năm Sinh"] ? `NS: ${item["Năm Sinh"]}` : "";

    const specs = [];
    if (gia) specs.push(gia);
    if (namSinh) specs.push(namSinh);

    if (item["Chiều Cao"] && item["Cân Nặng"]) {
        specs.push(`${item["Chiều Cao"]}, ${item["Cân Nặng"]}`);
    } else if (item["Chiều Cao"]) {
        specs.push(`${item["Chiều Cao"]}`);
    } else if (item["Cân Nặng"]) {
        specs.push(`${item["Cân Nặng"]}`);
    }

    if (item["Số đồ 3 vòng"]) {
        if (typeof item["Số đồ 3 vòng"] === "object") {
            const v1 = item["Số đồ 3 vòng"].bust;
            if (v1) specs.push(`V1: ${v1}`);
        } else {
            specs.push(String(item["Số đồ 3 vòng"]));
        }
    }

    const detailStr = specs.length > 0 ? ` | ${specs.map(escapeHtml).join(" | ")}` : "";
    return `• <code>${escapeHtml(phone)}</code>${detailStr}`;
}

/**
 * Batch results into concise messages (max 3800 chars/message) to prevent spam & hitting Telegram limits
 */
function buildResultMessages(filteredItems, maxDisplay = 30) {
    if (!filteredItems || filteredItems.length === 0) {
        return ["❌ Không tìm thấy dữ liệu phù hợp."];
    }

    const totalCount = filteredItems.length;
    const displayItems = filteredItems.slice(0, maxDisplay);
    const groupedData = typeof groupByKey === 'function'
        ? groupByKey(displayItems, "Khu Vực", "Khác")
        : { "Danh sách": displayItems };

    const messages = [];
    let currentMessage = `📋 <b>Tìm thấy ${totalCount} kết quả${totalCount > maxDisplay ? ` (hiển thị ${maxDisplay} đầu)` : ""}:</b>\n\n`;

    for (const [khuVuc, items] of Object.entries(groupedData)) {
        let section = `🏙️ <b>${escapeHtml(khuVuc)}:</b>\n`;
        for (const item of items) {
            section += formatResultItem(item) + "\n";
        }
        section += "\n";

        if ((currentMessage + section).length > 3800) {
            messages.push(currentMessage.trim());
            currentMessage = section;
        } else {
            currentMessage += section;
        }
    }

    if (totalCount > maxDisplay) {
        const footer = `<i>⚠️ Còn ${totalCount - maxDisplay} kết quả khác. Vui lòng thêm điều kiện để lọc chính xác hơn.</i>\n\n`;
        if ((currentMessage + footer).length > 3800) {
            messages.push(currentMessage.trim());
            currentMessage = footer;
        } else {
            currentMessage += footer;
        }
    }

    const copyTip = `<i>💡 Nhấn vào số điện thoại để sao chép nhanh.</i>`;
    if ((currentMessage + copyTip).length > 3800) {
        messages.push(currentMessage.trim());
        currentMessage = copyTip;
    } else {
        currentMessage += copyTip;
    }

    if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
    }

    return messages;
}

/**
 * Send filtered query results to Telegram as structured messages
 */
function sendResultData(data, traceId = null) {
    const filter = typeof filterValidPhoneData === 'function' ? filterValidPhoneData(data) : data;
    if (!filter || filter.length === 0) {
        logTrace(traceId, "SEND_RESULT", "No valid data to send after phone filtering");
        return sendTelegramMessage("❌ Không có dữ liệu phù hợp.", traceId);
    }

    const messages = buildResultMessages(filter, 30);
    logTrace(traceId, "SEND_RESULT", `Prepared ${messages.length} message chunk(s) for ${filter.length} item(s)`);

    for (let i = 0; i < messages.length; i++) {
        logTrace(traceId, "SEND_CHUNK", `Sending chunk ${i + 1}/${messages.length} (${messages[i].length} chars)`);
        sendTelegramMessage(messages[i], traceId);
    }
}

/**
 * Send a message to Telegram via Bot API
 */
function sendTelegramMessage(message, traceId = null) {
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId() || TELEGRAM_CHAT_ID;

    if (!token) {
        logTrace(traceId, "SEND_MSG_ERROR", "TELEGRAM_BOT_TOKEN is not configured in Script Properties");
        return false;
    }

    if (!chatId) {
        logTrace(traceId, "SEND_MSG_ERROR", "TELEGRAM_CHAT_ID is not configured in Script Properties");
        return false;
    }

    const url = "https://api.telegram.org/bot" + token + "/sendMessage";
    const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
    };

    const startTime = Date.now();
    try {
        logTrace(traceId, "SEND_MSG_START", `Dispatching sendMessage to Chat ID: ${chatId}`, { length: message.length });
        const response = UrlFetchApp.fetch(url, options);
        const duration = Date.now() - startTime;
        const resText = response.getContentText();
        const resJson = JSON.parse(resText);
        const isOk = resJson && resJson.ok === true;

        logTrace(traceId, "SEND_MSG_COMPLETE", `Telegram API response in ${duration}ms (status: ${isOk ? "OK" : "FAILED"})`, {
            statusCode: response.getResponseCode(),
            ok: isOk,
            description: resJson.description || null
        });

        return isOk;
    } catch (error) {
        const duration = Date.now() - startTime;
        logTrace(traceId, "SEND_MSG_EXCEPTION", `Exception sending Telegram message in ${duration}ms: ${error.toString()}`);
        return false;
    }
}

/**
 * Main handler for Telegram Webhook POST requests received from doPost(e)
 */
function handleTelegramWebhook(e) {
    const traceId = generateTraceId();
    const reqStart = Date.now();
    let lock = null;

    try {
        logTrace(traceId, "REQ_RECEIVED", "Incoming webhook POST request initiated");

        if (!e || !e.postData || !e.postData.contents) {
            logTrace(traceId, "REQ_EMPTY", "Empty postData received, returning HTTP 200 OK");
            return ContentService.createTextOutput("OK");
        }

        logTrace(traceId, "REQ_RAW_PAYLOAD", "Raw payload received", {
            length: e.postData.contents.length,
            type: e.postData.type,
            rawPreview: e.postData.contents.substring(0, 300)
        });

        // 1. Synchronize webhook processing using LockService to prevent race conditions on retries
        if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
            lock = LockService.getScriptLock();
            const lockStart = Date.now();
            try {
                const acquired = lock.tryLock(15000);
                logTrace(traceId, "LOCK_ACQUIRED", `Script lock acquired: ${acquired} (in ${Date.now() - lockStart}ms)`);
            } catch (lockErr) {
                logTrace(traceId, "LOCK_WARNING", `Lock acquisition warning: ${lockErr.toString()}`);
            }
        }

        const update = JSON.parse(e.postData.contents);
        const updateId = update.update_id;
        const message = update.message || update.edited_message;

        if (!message) {
            logTrace(traceId, "UPDATE_NO_MSG", `Update received without standard message object (update_id: ${updateId})`, update);
            return ContentService.createTextOutput("OK");
        }

        const incomingChatId = String(message.chat ? message.chat.id : "");
        const messageId = message.message_id ? String(message.message_id) : "";
        const sender = message.from ? `${message.from.first_name || ""} (@${message.from.username || "no_user"})` : "Unknown";
        const text = message.text ? String(message.text).trim() : "";

        logTrace(traceId, "PAYLOAD_PARSED", "Parsed Telegram Update message details", {
            update_id: updateId,
            message_id: messageId,
            chat_id: incomingChatId,
            chat_type: message.chat ? message.chat.type : "unknown",
            sender: sender,
            text: text
        });

        // 2. Message deduplication using CacheService
        const cache = (typeof CacheService !== 'undefined' && CacheService.getScriptCache)
            ? CacheService.getScriptCache()
            : null;

        if (cache) {
            const updateKey = updateId ? ("TG_UPD_" + updateId) : null;
            const msgKey = (incomingChatId && messageId) ? ("TG_MSG_" + incomingChatId + "_" + messageId) : null;
            const queryKey = (incomingChatId && text) ? ("TG_QRY_" + incomingChatId + "_" + encodeURIComponent(text.toLowerCase()) + "_" + Math.floor(Date.now() / 4000)) : null;

            if ((updateKey && cache.get(updateKey)) || (msgKey && cache.get(msgKey)) || (queryKey && cache.get(queryKey))) {
                logTrace(traceId, "DEDUP_SKIPPED", `Duplicate request detected (update_id: ${updateId}, message_id: ${messageId}). Skipping duplicate reply.`);
                return ContentService.createTextOutput("OK");
            }

            if (updateKey) cache.put(updateKey, "1", 600);
            if (msgKey) cache.put(msgKey, "1", 600);
            if (queryKey) cache.put(queryKey, "1", 600);
            logTrace(traceId, "DEDUP_PASSED", "Deduplication check passed, keys registered in cache");
        }

        // 3. Verify incoming Chat ID matches expected configuration
        const expectedChatId = String(getTelegramChatId() || TELEGRAM_CHAT_ID);
        if (expectedChatId && incomingChatId && incomingChatId !== expectedChatId) {
            logTrace(traceId, "AUTH_MISMATCH", `Chat ID mismatch! Incoming: ${incomingChatId}, Expected: ${expectedChatId}`);
            const mismatchCacheKey = "MISMATCH_NOTIFY_" + incomingChatId;
            if (cache && !cache.get(mismatchCacheKey)) {
                cache.put(mismatchCacheKey, "1", 600);
                const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
                if (token) {
                    UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
                        method: "post",
                        contentType: "application/json",
                        payload: JSON.stringify({
                            chat_id: incomingChatId,
                            text: `⚠️ <b>Chat ID không khớp</b>\n\nChat ID của bạn: <code>${incomingChatId}</code>\nChat ID đã cấu hình: <code>${expectedChatId}</code>\n\nVui lòng cập nhật <code>TELEGRAM_CHAT_ID</code> trong Script Properties thành <code>${incomingChatId}</code>.`,
                            parse_mode: "HTML"
                        }),
                        muteHttpExceptions: true
                    });
                }
            }
            return ContentService.createTextOutput("OK");
        }
        logTrace(traceId, "AUTH_PASSED", `Chat ID authorized: ${incomingChatId}`);

        // 4. Process bot command or natural language query
        if (text) {
            if (text === "/start" || text === "/help") {
                logTrace(traceId, "COMMAND_HELP", `Executing help command: ${text}`);
                sendTelegramMessage("👋 <b>Xin chào!</b>\n\nHãy gửi câu hỏi tìm kiếm theo ngôn ngữ tự nhiên, ví dụ:\n- <i>giá dưới 500k ở Hà Nội 2k5</i>\n- <i>khu vực Sài Gòn vòng 1 trên 90</i>\n- <i>tìm bài active quanh Cầu Giấy</i>", traceId);
                logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: HELP_COMMAND_SERVED)`);
                return ContentService.createTextOutput("OK");
            }

            logTrace(traceId, "QUERY_START", `Processing natural language query: "${text}"`);
            const ruleJson = typeof makeTheRule === 'function' ? makeTheRule(text, false, traceId) : null;
            if (!ruleJson) {
                logTrace(traceId, "QUERY_FAILED_RULE", "Unable to generate rule from AI, sending fallback message");
                sendTelegramMessage("❌ Không thể phân tích điều kiện từ câu hỏi này. Bạn hãy thử viết ngắn gọn hơn nhé (Ví dụ: <i>hà nội dưới 500k 2k5</i>).", traceId);
                logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: NO_AI_RULE)`);
                return ContentService.createTextOutput("OK");
            }

            let parsedRule;
            try {
                parsedRule = JSON.parse(ruleJson);
                logTrace(traceId, "RULE_PARSED", "Successfully parsed rule JSON", parsedRule);
            } catch (parseErr) {
                logTrace(traceId, "RULE_PARSE_ERROR", `JSON Parse Error on rule: ${parseErr.toString()}`, { rawRule: ruleJson });
                sendTelegramMessage("❌ Lỗi phân tích cú pháp điều kiện từ AI. Vui lòng thử lại.", traceId);
                logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: PARSE_ERROR)`);
                return ContentService.createTextOutput("OK");
            }

            const sheetName = typeof getSheetName === 'function' ? getSheetName() : "AllData";
            logTrace(traceId, "SHEET_QUERY_START", `Querying sheet "${sheetName}" with rule`);

            const queryStart = Date.now();
            const result = typeof DataQuery !== 'undefined'
                ? DataQuery.fromSheet(sheetName).applyRule(parsedRule).execute()
                : [];
            const queryDuration = Date.now() - queryStart;

            logTrace(traceId, "SHEET_QUERY_DONE", `Sheet query finished in ${queryDuration}ms, found ${result ? result.length : 0} matching record(s)`);

            if (!result || result.length === 0) {
                logTrace(traceId, "NO_RESULTS", "0 matching records found for rule");
                sendTelegramMessage("❌ Không tìm thấy dữ liệu phù hợp với điều kiện của bạn.", traceId);
                logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: ZERO_MATCH)`);
                return ContentService.createTextOutput("OK");
            }

            sendResultData(result, traceId);
            logTrace(traceId, "REQ_COMPLETE", `Request successfully completed in ${Date.now() - reqStart}ms (Status: RESULTS_DELIVERED)`);
            return ContentService.createTextOutput("OK");
        }

        logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: NO_TEXT)`);
        return ContentService.createTextOutput("OK");

    } catch (error) {
        logTrace(traceId, "REQ_FATAL_ERROR", `Fatal error processing webhook in ${Date.now() - reqStart}ms: ${error.toString()}`, {
            stack: error.stack || null
        });
        return ContentService.createTextOutput("OK");
    } finally {
        if (lock) {
            try {
                lock.releaseLock();
                logTrace(traceId, "LOCK_RELEASED", "Script lock released successfully");
            } catch (e) {}
        }
    }
}

/**
 * Retrieve system diagnostics and Telegram Webhook status
 */
function getTelegramDiagnostics(traceId = null) {
    logTrace(traceId, "DIAGNOSTICS_START", "Running diagnostics check");
    const token = getTelegramApiKey();
    const chatId = getTelegramChatId();
    const spreadsheetId = getSpreadsheetId();
    const geminiKey = getGeminiApiKey();
    const cfAccountId = getCloudflareAccountId();
    const cfApiToken = getCloudflareApiToken();
    const cfModel = getCloudflareModel();
    const deployedUrl = getDeployedUrl();

    let webhookInfo = null;
    if (token) {
        try {
            const res = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", { muteHttpExceptions: true });
            const json = JSON.parse(res.getContentText());
            webhookInfo = json.ok ? json.result : { error: json.description };
        } catch (err) {
            webhookInfo = { error: err.toString() };
        }
    }

    const report = {
        status: "online",
        timestamp: new Date().toISOString(),
        scriptProperties: {
            TELEGRAM_BOT_TOKEN: token ? `Configured (Length: ${token.length})` : "MISSING ❌",
            TELEGRAM_CHAT_ID: chatId ? chatId : "MISSING ❌",
            CLOUDFLARE_WORKERS_AI: cfAccountId && cfApiToken ? `Configured ✅ (Model: ${cfModel})` : "Not configured (Optional)",
            GEMINI_API_KEY: geminiKey ? "Configured ✅" : "Not configured (Optional)",
            SPREADSHEET_ID: spreadsheetId ? spreadsheetId : "MISSING ❌",
            DEPLOYED_URL: deployedUrl ? deployedUrl : "Not set in properties"
        },
        telegramWebhookStatus: webhookInfo
    };

    logTrace(traceId, "DIAGNOSTICS_COMPLETE", "Diagnostics completed", report);
    return report;
}

/**
 * Test and verify complete Telegram API connection
 */
function checkTelegramConnection() {
    const traceId = generateTraceId();
    logTrace(traceId, "CONN_TEST_START", "Initiating Telegram connection verification");
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId() || TELEGRAM_CHAT_ID;

    const results = {
        success: false,
        botInfo: null,
        messageSent: false,
        webhookInfo: null,
        errors: []
    };

    if (!token) {
        results.errors.push("TELEGRAM_BOT_TOKEN is not configured in Script Properties.");
        logTrace(traceId, "CONN_TEST_FAIL", "TELEGRAM_BOT_TOKEN missing in script properties");
        return results;
    }

    // Step 1: Test Bot Token via /getMe
    try {
        const getMeUrl = "https://api.telegram.org/bot" + token + "/getMe";
        const res = UrlFetchApp.fetch(getMeUrl, { muteHttpExceptions: true });
        const data = JSON.parse(res.getContentText());
        
        if (data.ok) {
            results.botInfo = data.result;
            logTrace(traceId, "CONN_TEST_BOT", `Bot Verified: @${data.result.username} (${data.result.first_name})`);
        } else {
            results.errors.push("Bot token error: " + (data.description || "Invalid token"));
            logTrace(traceId, "CONN_TEST_FAIL", "Bot Token verification failed: " + res.getContentText());
            return results;
        }
    } catch (err) {
        results.errors.push("Failed to connect to Telegram getMe API: " + err.toString());
        logTrace(traceId, "CONN_TEST_ERROR", "Error on getMe: " + err.toString());
        return results;
    }

    // Step 2: Test sending a message to TELEGRAM_CHAT_ID
    if (!chatId) {
        results.errors.push("TELEGRAM_CHAT_ID is not configured in Script Properties.");
        logTrace(traceId, "CONN_TEST_WARN", "TELEGRAM_CHAT_ID missing, skipping test message");
    } else {
        const testMsg = "🤖 <b>Kiểm tra kết nối Telegram Bot</b>\n\n✅ Bot kết nối thành công với Google Apps Script!\n⏰ Thời gian: " + new Date().toLocaleString("vi-VN");
        const sent = sendTelegramMessage(testMsg, traceId);
        results.messageSent = sent;
        if (!sent) {
            results.errors.push("Không thể gửi tin nhắn thử tới Telegram Chat ID: " + chatId);
        }
    }

    // Step 3: Check Webhook Info via /getWebhookInfo
    try {
        const getWebhookUrl = "https://api.telegram.org/bot" + token + "/getWebhookInfo";
        const res = UrlFetchApp.fetch(getWebhookUrl, { muteHttpExceptions: true });
        const data = JSON.parse(res.getContentText());
        if (data.ok) {
            results.webhookInfo = data.result;
            logTrace(traceId, "CONN_TEST_WEBHOOK", "Webhook Info retrieved", data.result);
        }
    } catch (err) {
        logTrace(traceId, "CONN_TEST_WARN", "Error fetching webhook info: " + err.toString());
    }

    results.success = (results.botInfo !== null) && (chatId ? results.messageSent : true);
    logTrace(traceId, "CONN_TEST_COMPLETE", `Connection test finished: ${results.success ? "SUCCESS" : "FAILED"}`);
    return results;
}

/**
 * UI Prompt: Test Telegram connection from Google Spreadsheet Menu
 */
function promptTestTelegramConnection() {
    const ui = SpreadsheetApp.getUi();
    const res = checkTelegramConnection();

    if (res.success) {
        const botName = res.botInfo ? `${res.botInfo.first_name} (@${res.botInfo.username})` : 'N/A';
        const webhookUrl = res.webhookInfo && res.webhookInfo.url ? res.webhookInfo.url : 'Chưa cấu hình';
        const pendingMsg = res.webhookInfo ? res.webhookInfo.pending_update_count : 0;

        const msg = `✅ KẾT NỐI TELEGRAM THÀNH CÔNG!\n\n` +
                    `🤖 Bot Name: ${botName}\n` +
                    `📲 Gửi tin nhắn test: ${res.messageSent ? 'Thành công (Đã gửi tới Chat ID)' : 'Thất bại'}\n` +
                    `🌐 Webhook URL: ${webhookUrl}\n` +
                    `📩 Tin nhắn đang chờ: ${pendingMsg}`;
        ui.alert('🎉 Kiểm Tra Kết Nối', msg, ui.ButtonSet.OK);
    } else {
        const errorMsg = res.errors.length > 0 ? res.errors.join('\n- ') : 'Không xác định được nguyên nhân.';
        ui.alert('❌ Kết Nối Thất Bại', 'Chi tiết lỗi:\n- ' + errorMsg, ui.ButtonSet.OK);
    }
}

/**
 * UI Prompt: Update Telegram Webhook URL from Google Spreadsheet Menu
 */
function promptUpdateWebhook() {
    const ui = SpreadsheetApp.getUi();
    const currentUrl = getDeployedUrl();

    const response = ui.prompt(
        'Cập nhật Telegram Webhook',
        'Nhập DEPLOYED_URL mới (hoặc để trống để tự động dùng Web App URL hiện tại):\nURL hiện tại: ' + (currentUrl || 'Chưa có'),
        ui.ButtonSet.OK_CANCEL
    );

    if (response.getSelectedButton() === ui.Button.OK) {
        const inputUrl = response.getResponseText().trim();
        const success = updateDeployedUrlAndSetWebhook(inputUrl || null);
        const activeUrl = inputUrl || getDeployedUrl();
        if (success) {
            ui.alert('✅ Thành công', 'Đã cập nhật Webhook Telegram thành công!\nURL: ' + activeUrl, ui.ButtonSet.OK);
        } else {
            ui.alert('❌ Thất bại', 'Không thể cập nhật Webhook. Vui lòng kiểm tra Logs hoặc Script Properties (TELEGRAM_BOT_TOKEN / DEPLOYED_URL).', ui.ButtonSet.OK);
        }
    }
}

/**
 * UI Prompt: Check current Telegram Webhook status from Google Spreadsheet Menu
 */
function checkTelegramWebhookStatus() {
    const ui = SpreadsheetApp.getUi();
    const token = getTelegramApiKey();
    if (!token) {
        ui.alert('❌ Lỗi', 'Chưa cấu hình TELEGRAM_BOT_TOKEN trong Script Properties.', ui.ButtonSet.OK);
        return;
    }

    try {
        const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo", { muteHttpExceptions: true });
        const info = JSON.parse(response.getContentText());
        if (info.ok) {
            const result = info.result;
            const msg = `URL Webhook: ${result.url || 'Chưa thiết lập'}\n` +
                        `Có custom certificate: ${result.has_custom_certificate}\n` +
                        `Số lượng tin nhắn chờ: ${result.pending_update_count}\n` +
                        `Lỗi gần nhất: ${result.last_error_message || 'Không có'}`;
            ui.alert('ℹ️ Trạng thái Webhook Telegram', msg, ui.ButtonSet.OK);
        } else {
            ui.alert('❌ Lỗi', 'Không thể lấy thông tin Webhook: ' + response.getContentText(), ui.ButtonSet.OK);
        }
    } catch (err) {
        ui.alert('❌ Lỗi', 'Lỗi khi gọi Telegram API: ' + err.toString(), ui.ButtonSet.OK);
    }
}

/**
 * Register Webhook URL to Telegram Bot API
 */
function setWebhook(customUrl) {
    const traceId = generateTraceId();
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const targetUrl = customUrl || getDeployedUrl() || DEPLOYED_URL;

    logTrace(traceId, "SET_WEBHOOK_START", `Setting Telegram webhook to URL: ${targetUrl}`);

    if (!token) {
        logTrace(traceId, "SET_WEBHOOK_ERROR", "TELEGRAM_BOT_TOKEN is not configured");
        return false;
    }

    if (!targetUrl) {
        logTrace(traceId, "SET_WEBHOOK_ERROR", "DEPLOYED_URL is empty");
        return false;
    }

    const url = "https://api.telegram.org/bot" + token + "/setWebhook";
    const payload = {
        url: targetUrl,
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const resultText = response.getContentText();
        logTrace(traceId, "SET_WEBHOOK_RESPONSE", `Webhook registration response for ${targetUrl}: ${resultText}`);
        return true;
    } catch (error) {
        logTrace(traceId, "SET_WEBHOOK_EXCEPTION", `Error setting webhook: ${error.toString()}`);
        return false;
    }
}

/**
 * Update DEPLOYED_URL in Script Properties and automatically invoke setWebhook
 */
function updateDeployedUrlAndSetWebhook(newUrl) {
    let targetUrl = newUrl;

    if (!targetUrl && typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
        try {
            targetUrl = ScriptApp.getService().getUrl();
        } catch (e) {
            Logger.log("Unable to automatically get Web App URL: " + e);
        }
    }

    if (targetUrl) {
        setDeployedUrl(targetUrl);
        Logger.log("Updated DEPLOYED_URL in Script Properties: " + targetUrl);
    } else {
        targetUrl = getDeployedUrl();
    }

    if (!targetUrl) {
        Logger.log("❌ DEPLOYED_URL not found. Please provide URL or set DEPLOYED_URL in Script Properties.");
        return false;
    }

    return setWebhook(targetUrl);
}

/**
 * Delete Telegram Webhook
 */
function removeWebhook() {
    const traceId = generateTraceId();
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const url = "https://api.telegram.org/bot" + token + "/deleteWebhook";

    logTrace(traceId, "REMOVE_WEBHOOK_START", "Calling Telegram deleteWebhook API");

    const options = {
        method: "post",
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        logTrace(traceId, "REMOVE_WEBHOOK_COMPLETE", `Webhook delete response: ${response.getContentText()}`);
    } catch (error) {
        logTrace(traceId, "REMOVE_WEBHOOK_EXCEPTION", `Error removing webhook: ${error.toString()}`);
    }
}

function setupTelegramWebhook(newUrl) {
    const result = updateDeployedUrlAndSetWebhook(newUrl);
    Logger.log("Telegram webhook setup completed.");
    return result;
}

function removeTelegramWebhook() {
    removeWebhook();
    Logger.log("Telegram webhook removed.");
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        logTrace,
        generateTraceId,
        escapeHtml,
        formatDate,
        cleanPhoneNumber,
        formatResultItem,
        buildResultMessages,
        sendResultData,
        sendTelegramMessage,
        handleTelegramWebhook,
        getTelegramDiagnostics,
        checkTelegramConnection,
        promptTestTelegramConnection,
        promptUpdateWebhook,
        checkTelegramWebhookStatus,
        setWebhook,
        updateDeployedUrlAndSetWebhook,
        removeWebhook,
        setupTelegramWebhook,
        removeTelegramWebhook
    };
}
