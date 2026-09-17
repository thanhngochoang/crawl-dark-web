/**
 * Structured trace logger for end-to-end request lifecycle visibility
 */
const TG_TRACE_RING_KEY = "TG_TRACE_RING";
const TG_TRACE_RING_SIZE = 60;

function logTrace(traceId, stage, message, meta = null) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? (" | Data: " + (typeof meta === 'object' ? JSON.stringify(meta) : String(meta))) : "";
    const line = `[TRACE][${timestamp}][${traceId || "NO_TRACE_ID"}][${stage}] ${message}${metaStr}`;
    Logger.log(line);
    appendTraceRing(line);
}

/**
 * Keep the last N trace lines in CacheService so diagnostics (doGet) can expose them.
 * Anonymous web-app executions are hard to inspect otherwise. Best effort, never throws.
 */
function appendTraceRing(line) {
    if (typeof CacheService === 'undefined' || !CacheService.getScriptCache) return;
    try {
        const cache = CacheService.getScriptCache();
        let ring = [];
        const raw = cache.get(TG_TRACE_RING_KEY);
        if (raw) { try { ring = JSON.parse(raw) || []; } catch (e) { ring = []; } }
        ring.push(line.length > 600 ? line.slice(0, 600) + "…" : line);
        if (ring.length > TG_TRACE_RING_SIZE) ring = ring.slice(ring.length - TG_TRACE_RING_SIZE);
        cache.put(TG_TRACE_RING_KEY, JSON.stringify(ring), 21600);
    } catch (e) {
        // ignore cache failures
    }
}

function readTraceRing() {
    if (typeof CacheService === 'undefined' || !CacheService.getScriptCache) return [];
    try {
        const raw = CacheService.getScriptCache().get(TG_TRACE_RING_KEY);
        return raw ? (JSON.parse(raw) || []) : [];
    } catch (e) {
        return [];
    }
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

// ---------------------------------------------------------------------------
// Webhook queue architecture
//
// Telegram re-delivers an update (same update_id) whenever the webhook does not
// answer 2xx quickly. The previous design ran AI + sheet query + sendMessage
// inside the webhook request, which regularly exceeded that window and caused
// the same result to be sent many times. The webhook now only deduplicates,
// persists a job and schedules a time-based trigger, then ACKs immediately.
// The heavy work runs in processTelegramQueue() outside the HTTP request.
// ---------------------------------------------------------------------------

const TG_JOB_PREFIX = "TG_JOB_";
const TG_QUEUE_SCHEDULED_KEY = "TG_QUEUE_SCHEDULED";
const TG_QUEUE_PROCESSOR_FN = "processTelegramQueue";
const TG_DEDUP_TTL_SECONDS = 600;
const TG_PROCESSOR_TIME_BUDGET_MS = 4.5 * 60 * 1000;
// Jobs older than this are dropped: answering a query hours later is worse than not answering
const TG_JOB_MAX_AGE_MS = 30 * 60 * 1000;
// Inline fallback runs inside the webhook request: keep it short so Telegram does not time out
const TG_INLINE_TIME_BUDGET_MS = 40 * 1000;

/**
 * Persist a webhook job so the trigger-based processor can pick it up
 */
function enqueueTelegramJob(job) {
    PropertiesService.getScriptProperties().setProperty(TG_JOB_PREFIX + job.updateId, JSON.stringify(job));
}

/**
 * Return all pending jobs ordered by update_id (Telegram delivery order)
 */
function listTelegramJobs() {
    const props = PropertiesService.getScriptProperties().getProperties();
    const jobs = [];
    for (const key of Object.keys(props)) {
        if (!key.startsWith(TG_JOB_PREFIX)) continue;
        try {
            jobs.push(JSON.parse(props[key]));
        } catch (e) {
            // Corrupted entry: drop it so it does not block the queue forever
            PropertiesService.getScriptProperties().deleteProperty(key);
        }
    }
    return jobs.sort((a, b) => Number(a.updateId) - Number(b.updateId));
}

function deleteTelegramJob(updateId) {
    PropertiesService.getScriptProperties().deleteProperty(TG_JOB_PREFIX + updateId);
}

/**
 * Drain pending jobs in delivery order. Shared by the trigger processor and the
 * inline webhook fallback. Returns { processed, budgetExceeded }.
 */
function drainTelegramJobs(traceId, runStart, budgetMs) {
    let processed = 0;
    let budgetExceeded = false;
    while (true) {
        const jobs = listTelegramJobs();
        if (jobs.length === 0) break;
        logTrace(traceId, "QUEUE_BATCH", `Draining ${jobs.length} pending job(s)`);

        for (const job of jobs) {
            if (Date.now() - runStart > budgetMs) {
                budgetExceeded = true;
                break;
            }
            // Delete before processing: losing a job on crash is preferable to sending it twice
            deleteTelegramJob(job.updateId);
            if (job.enqueuedAt && Date.now() - job.enqueuedAt > TG_JOB_MAX_AGE_MS) {
                logTrace(job.traceId || traceId, "JOB_EXPIRED", `Dropping stale job for update_id ${job.updateId} (age ${Math.round((Date.now() - job.enqueuedAt) / 60000)} min)`, { text: job.text });
                continue;
            }
            processTelegramJob(job);
            processed++;
        }
        if (budgetExceeded) break;
    }
    return { processed, budgetExceeded };
}

/**
 * Schedule the queue processor trigger unless one is already pending.
 * The pending flag is cleared by the processor when it starts, so any update
 * arriving while it runs schedules a fresh trigger.
 */
function scheduleTelegramQueueProcessor(traceId, cache) {
    if (cache && cache.get(TG_QUEUE_SCHEDULED_KEY)) {
        logTrace(traceId, "QUEUE_SCHEDULE_SKIP", "Processor trigger already pending, reusing it");
        return false;
    }
    if (typeof ScriptApp === 'undefined' || !ScriptApp.newTrigger) {
        logTrace(traceId, "QUEUE_SCHEDULE_ERROR", "ScriptApp triggers unavailable in this runtime");
        return false;
    }
    try {
        ScriptApp.newTrigger(TG_QUEUE_PROCESSOR_FN).timeBased().after(1000).create();
    } catch (error) {
        // Typically a missing script.scriptapp authorization: the owner must re-authorize the script
        logTrace(traceId, "QUEUE_SCHEDULE_ERROR", `Cannot create processor trigger: ${error.toString()}`);
        return false;
    }
    if (cache) cache.put(TG_QUEUE_SCHEDULED_KEY, "1", 120);
    logTrace(traceId, "QUEUE_SCHEDULED", "Processor trigger created (fires in ~1s)");
    return true;
}

/**
 * Remove every time-based trigger pointing at the queue processor
 */
function deleteTelegramQueueTriggers() {
    if (typeof ScriptApp === 'undefined' || !ScriptApp.getProjectTriggers) return 0;
    let removed = 0;
    for (const trigger of ScriptApp.getProjectTriggers()) {
        const handler = typeof trigger.getHandlerFunction === 'function' ? trigger.getHandlerFunction() : trigger.fn;
        if (handler === TG_QUEUE_PROCESSOR_FN) {
            ScriptApp.deleteTrigger(trigger);
            removed++;
        }
    }
    return removed;
}

/**
 * Main handler for Telegram Webhook POST requests received from doPost(e).
 * Fast path only: parse, dedup, authorize, enqueue, ACK.
 */
function handleTelegramWebhook(e) {
    const traceId = generateTraceId();
    const reqStart = Date.now();

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

        const update = JSON.parse(e.postData.contents);
        const updateId = update.update_id;
        // Ignore edited_message: re-running a query because the user fixed a typo is a duplicate reply
        const message = update.message;

        if (!message) {
            logTrace(traceId, "UPDATE_NO_MSG", `Update received without a new message object (update_id: ${updateId})`, update);
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

        // 1. Deduplicate by update_id (Telegram retries) and message_id (defensive)
        const cache = (typeof CacheService !== 'undefined' && CacheService.getScriptCache)
            ? CacheService.getScriptCache()
            : null;
        const updateKey = updateId !== undefined && updateId !== null ? ("TG_UPD_" + updateId) : null;
        const msgKey = (incomingChatId && messageId) ? ("TG_MSG_" + incomingChatId + "_" + messageId) : null;

        if (cache) {
            const cacheHit = (updateKey && cache.get(updateKey)) || (msgKey && cache.get(msgKey));
            const jobPending = updateKey && PropertiesService.getScriptProperties().getProperty(TG_JOB_PREFIX + updateId);
            if (cacheHit || jobPending) {
                logTrace(traceId, "DEDUP_SKIPPED", `Duplicate request detected (update_id: ${updateId}, message_id: ${messageId}). Skipping.`);
                return ContentService.createTextOutput("OK");
            }
            if (updateKey) cache.put(updateKey, "1", TG_DEDUP_TTL_SECONDS);
            if (msgKey) cache.put(msgKey, "1", TG_DEDUP_TTL_SECONDS);
            logTrace(traceId, "DEDUP_PASSED", "Deduplication check passed, keys registered in cache");
        }

        // 2. Verify incoming Chat ID matches expected configuration
        const expectedChatId = String(getTelegramChatId() || TELEGRAM_CHAT_ID || "");
        if (expectedChatId && incomingChatId && incomingChatId !== expectedChatId) {
            logTrace(traceId, "AUTH_MISMATCH", `Chat ID mismatch! Incoming: ${incomingChatId}, Expected: ${expectedChatId}`);
            const mismatchCacheKey = "MISMATCH_NOTIFY_" + incomingChatId;
            if (cache && !cache.get(mismatchCacheKey)) {
                cache.put(mismatchCacheKey, "1", TG_DEDUP_TTL_SECONDS);
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

        if (!text) {
            logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: NO_TEXT)`);
            return ContentService.createTextOutput("OK");
        }

        // 3. Persist the job and hand off to the trigger-based processor
        const job = {
            updateId: updateId,
            messageId: messageId,
            chatId: incomingChatId,
            sender: sender,
            text: text,
            traceId: traceId,
            enqueuedAt: Date.now()
        };
        enqueueTelegramJob(job);
        logTrace(traceId, "QUEUE_ENQUEUED", `Job persisted for update_id ${updateId}`);
        const scheduled = scheduleTelegramQueueProcessor(traceId, cache);
        const pendingFlag = cache && cache.get(TG_QUEUE_SCHEDULED_KEY);

        if (!scheduled && !pendingFlag) {
            // No processor will run: answer inline rather than swallow the message.
            // Slower ACK (Telegram may retry, dedup handles it) beats silence.
            logTrace(traceId, "QUEUE_INLINE_FALLBACK", "Trigger unavailable, draining queue inline in webhook");
            const { processed } = drainTelegramJobs(traceId, reqStart, TG_INLINE_TIME_BUDGET_MS);
            logTrace(traceId, "REQ_COMPLETE", `Request completed in ${Date.now() - reqStart}ms (Status: PROCESSED_INLINE, jobs: ${processed})`);
            return ContentService.createTextOutput("OK");
        }

        logTrace(traceId, "REQ_COMPLETE", `Request ACKed in ${Date.now() - reqStart}ms (Status: ENQUEUED)`);
        return ContentService.createTextOutput("OK");

    } catch (error) {
        logTrace(traceId, "REQ_FATAL_ERROR", `Fatal error processing webhook in ${Date.now() - reqStart}ms: ${error.toString()}`, {
            stack: error.stack || null
        });
        return ContentService.createTextOutput("OK");
    }
}

/**
 * Time-based trigger entrypoint: drain the job queue outside the webhook request.
 * Serialized with a script lock so only one processor runs at a time.
 */
function processTelegramQueue() {
    const traceId = generateTraceId();
    const runStart = Date.now();
    let lock = null;
    const cache = (typeof CacheService !== 'undefined' && CacheService.getScriptCache)
        ? CacheService.getScriptCache()
        : null;

    try {
        logTrace(traceId, "QUEUE_RUN_START", "Queue processor started");

        // Allow webhooks arriving from now on to schedule a follow-up run
        if (cache) cache.remove(TG_QUEUE_SCHEDULED_KEY);

        if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
            lock = LockService.getScriptLock();
            const lockStart = Date.now();
            const acquired = lock.tryLock(30000);
            logTrace(traceId, "LOCK_ACQUIRED", `Script lock acquired: ${acquired} (in ${Date.now() - lockStart}ms)`);
            if (!acquired) {
                // Another processor owns the queue; it will drain our jobs too
                lock = null;
                logTrace(traceId, "QUEUE_RUN_SKIP", "Another processor is running, exiting");
                return;
            }
        }

        const { processed, budgetExceeded } = drainTelegramJobs(traceId, runStart, TG_PROCESSOR_TIME_BUDGET_MS);

        // Clean up fired triggers (Apps Script keeps them around; 20-trigger limit per script)
        const removed = deleteTelegramQueueTriggers();
        logTrace(traceId, "QUEUE_TRIGGERS_CLEANED", `Removed ${removed} processor trigger(s)`);

        // Re-arm if work is still pending (time budget hit, or a job slipped in during cleanup)
        if (budgetExceeded || listTelegramJobs().length > 0) {
            scheduleTelegramQueueProcessor(traceId, cache);
        }

        logTrace(traceId, "QUEUE_RUN_COMPLETE", `Processed ${processed} job(s) in ${Date.now() - runStart}ms`);
    } catch (error) {
        logTrace(traceId, "QUEUE_RUN_ERROR", `Fatal error in queue processor: ${error.toString()}`, { stack: error.stack || null });
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
 * Execute one queued job end-to-end: command / AI rule / sheet query / reply.
 * Reuses the job's webhook traceId so logs form a single end-to-end trace.
 */
function processTelegramJob(job) {
    const traceId = job.traceId || generateTraceId();
    const jobStart = Date.now();
    const text = job.text || "";

    try {
        logTrace(traceId, "JOB_START", `Processing job for update_id ${job.updateId} (queued ${jobStart - (job.enqueuedAt || jobStart)}ms ago)`, { text });

        if (text === "/start" || text === "/help") {
            logTrace(traceId, "COMMAND_HELP", `Executing help command: ${text}`);
            sendTelegramMessage("👋 <b>Xin chào!</b>\n\nHãy gửi câu hỏi tìm kiếm theo ngôn ngữ tự nhiên, ví dụ:\n- <i>giá dưới 500k ở Hà Nội 2k5</i>\n- <i>khu vực Sài Gòn vòng 1 trên 90</i>\n- <i>tìm bài active quanh Cầu Giấy</i>", traceId);
            logTrace(traceId, "JOB_COMPLETE", `Job completed in ${Date.now() - jobStart}ms (Status: HELP_COMMAND_SERVED)`);
            return;
        }

        logTrace(traceId, "QUERY_START", `Processing natural language query: "${text}"`);
        // AI providers first, then the local rule-based parser (see helper.js resolveRule)
        const resolved = typeof resolveRule === 'function' ? resolveRule(text, traceId) : null;
        if (!resolved) {
            logTrace(traceId, "QUERY_FAILED_RULE", "Neither AI nor local parser produced a rule, sending fallback message");
            sendTelegramMessage("❌ Không thể phân tích điều kiện từ câu hỏi này. Bạn hãy thử viết ngắn gọn hơn nhé (Ví dụ: <i>hà nội dưới 500k 2k5</i>).", traceId);
            logTrace(traceId, "JOB_COMPLETE", `Job completed in ${Date.now() - jobStart}ms (Status: NO_RULE)`);
            return;
        }
        const parsedRule = resolved.rule;

        const sheetName = typeof getSheetName === 'function' ? getSheetName() : "AllData";
        logTrace(traceId, "SHEET_QUERY_START", `Querying sheet "${sheetName}" with rule (source: ${resolved.source})`);

        const queryStart = Date.now();
        const result = typeof DataQuery !== 'undefined'
            ? DataQuery.fromSheet(sheetName).applyRule(parsedRule).execute()
            : [];
        logTrace(traceId, "SHEET_QUERY_DONE", `Sheet query finished in ${Date.now() - queryStart}ms, found ${result ? result.length : 0} matching record(s)`);

        if (!result || result.length === 0) {
            logTrace(traceId, "NO_RESULTS", "0 matching records found for rule");
            sendTelegramMessage("❌ Không tìm thấy dữ liệu phù hợp với điều kiện của bạn.", traceId);
            logTrace(traceId, "JOB_COMPLETE", `Job completed in ${Date.now() - jobStart}ms (Status: ZERO_MATCH)`);
            return;
        }

        sendResultData(result, traceId);
        logTrace(traceId, "JOB_COMPLETE", `Job completed in ${Date.now() - jobStart}ms (Status: RESULTS_DELIVERED)`);
    } catch (error) {
        logTrace(traceId, "JOB_ERROR", `Fatal error processing job in ${Date.now() - jobStart}ms: ${error.toString()}`, {
            stack: error.stack || null
        });
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
        telegramWebhookStatus: webhookInfo,
        pendingJobs: (() => { try { return listTelegramJobs().map(j => ({ updateId: j.updateId, text: j.text, enqueuedAt: j.enqueuedAt })); } catch (e) { return String(e); } })(),
        queueTriggers: (() => { try { return (typeof ScriptApp !== 'undefined') ? ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()) : []; } catch (e) { return String(e); } })(),
        recentTraces: readTraceRing()
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
function setWebhook(customUrl, dropPendingUpdates = false) {
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
    // max_connections=1: Telegram delivers updates sequentially, so retries cannot overlap.
    // drop_pending_updates: one-shot flush of a retry backlog accumulated by a slow webhook.
    const payload = {
        url: targetUrl,
        max_connections: 1,
        drop_pending_updates: !!dropPendingUpdates,
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
        processTelegramQueue,
        processTelegramJob,
        enqueueTelegramJob,
        listTelegramJobs,
        scheduleTelegramQueueProcessor,
        deleteTelegramQueueTriggers,
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
