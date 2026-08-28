/**
 * Google Apps Script for Google Sheets updated
 * This script can be used to automate tasks in the escort data spreadsheet.
 */


// Web app function for GET requests (Health Check & Diagnostics)
function doGet(e) {
  try {
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

    const diagnostics = {
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

    return ContentService.createTextOutput(JSON.stringify(diagnostics, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput("Error running diagnostics: " + err.toString());
  }
}

// Web app function for POST requests (Telegram webhook)
function doPost(e) {
  let lock = null;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }

    // 1. Đồng bộ hóa xử lý webhook bằng LockService để chống xử lý đồng thời khi Telegram retry
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      lock = LockService.getScriptLock();
      try {
        lock.tryLock(15000); // Đợi tối đa 15 giây
      } catch (lockErr) {
        Logger.log("Lock acquisition warning: " + lockErr);
      }
    }

    const update = JSON.parse(e.postData.contents);
    const updateId = update.update_id;
    const message = update.message || update.edited_message;

    if (!message) {
      return ContentService.createTextOutput("OK");
    }

    const incomingChatId = String(message.chat ? message.chat.id : "");
    const messageId = message.message_id ? String(message.message_id) : "";
    const text = message.text ? String(message.text).trim() : "";

    // 2. Chống lặp tin nhắn triệt để (Deduplicate update_id & message_id & text)
    const cache = (typeof CacheService !== 'undefined' && CacheService.getScriptCache)
      ? CacheService.getScriptCache()
      : null;

    if (cache) {
      const updateKey = updateId ? ("TG_UPD_" + updateId) : null;
      const msgKey = (incomingChatId && messageId) ? ("TG_MSG_" + incomingChatId + "_" + messageId) : null;
      const queryKey = (incomingChatId && text) ? ("TG_QRY_" + incomingChatId + "_" + encodeURIComponent(text.toLowerCase()) + "_" + Math.floor(Date.now() / 4000)) : null;

      if ((updateKey && cache.get(updateKey)) || (msgKey && cache.get(msgKey)) || (queryKey && cache.get(queryKey))) {
        Logger.log(`Duplicate request detected (update_id: ${updateId}, message_id: ${messageId}). Skipping to prevent duplicate replies.`);
        return ContentService.createTextOutput("OK");
      }

      // Đánh dấu đã nhận ngay lập tức vào cache (TTL 10 phút)
      if (updateKey) cache.put(updateKey, "1", 600);
      if (msgKey) cache.put(msgKey, "1", 600);
      if (queryKey) cache.put(queryKey, "1", 600);
    }

    // 3. Kiểm tra Chat ID hợp lệ
    const expectedChatId = String(getTelegramChatId() || TELEGRAM_CHAT_ID);
    if (expectedChatId && incomingChatId && incomingChatId !== expectedChatId) {
      Logger.log(`⚠️ Chat ID mismatch. Incoming: ${incomingChatId}, Expected: ${expectedChatId}`);
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

    // 4. Xử lý lệnh hoặc câu hỏi
    if (text) {
      if (text === "/start" || text === "/help") {
        sendTelegramMessage("👋 <b>Xin chào!</b>\n\nHãy gửi câu hỏi tìm kiếm theo ngôn ngữ tự nhiên, ví dụ:\n- <i>giá dưới 500k ở Hà Nội 2k5</i>\n- <i>khu vực Sài Gòn vòng 1 trên 90</i>\n- <i>tìm bài active quanh Cầu Giấy</i>");
        return ContentService.createTextOutput("OK");
      }

      const ruleJson = makeTheRule(text);
      if (!ruleJson) {
        sendTelegramMessage("❌ Không thể phân tích điều kiện từ câu hỏi này. Bạn hãy thử viết ngắn gọn hơn nhé (Ví dụ: <i>hà nội dưới 500k 2k5</i>).");
        return ContentService.createTextOutput("OK");
      }

      let parsedRule;
      try {
        parsedRule = JSON.parse(ruleJson);
      } catch (parseErr) {
        Logger.log("Rule JSON parse error: " + parseErr + " | Rule text: " + ruleJson);
        sendTelegramMessage("❌ Lỗi phân tích cú pháp điều kiện từ AI. Vui lòng thử lại.");
        return ContentService.createTextOutput("OK");
      }

      const sheetName = getSheetName();
      const result = DataQuery.fromSheet(sheetName).applyRule(parsedRule).execute();

      if (!result || result.length === 0) {
        sendTelegramMessage("❌ Không tìm thấy dữ liệu phù hợp với điều kiện của bạn.");
        return ContentService.createTextOutput("OK");
      }

      sendResultData(result);
      return ContentService.createTextOutput("OK");
    }

    return ContentService.createTextOutput("OK");

  } catch (error) {
    Logger.log('Error processing webhook: ' + error);
    return ContentService.createTextOutput("OK");
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (e) {
        // ignore lock release error
      }
    }
  }
}

/**
 * Tự động tạo menu custom khi mở Google Sheet
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🤖 Telegram Bot')
      .addItem('🧪 Kiểm tra kết nối Telegram', 'promptTestTelegramConnection')
      .addItem('🔗 Cập nhật Webhook (Auto / Manual)', 'promptUpdateWebhook')
      .addItem('⚙️ Kiểm tra Webhook hiện tại', 'checkTelegramWebhookStatus')
      .addToUi();
  } catch (e) {
    // Menu creation fails gracefully if script is not bound to a spreadsheet UI container
  }
}

/**
 * Kiểm tra toàn bộ kết nối Telegram API và gửi tin nhắn test từ Google Sheets UI
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
 * Prompt nhập URL mới hoặc tự động dùng Web App URL hiện tại để setWebhook
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
 * Kiểm tra trạng thái webhook Telegram từ Telegram API
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