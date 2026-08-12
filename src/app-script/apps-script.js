/**
 * Google Apps Script for Google Sheets updated
 * This script can be used to automate tasks in the escort data spreadsheet.
 */


// Web app function for POST requests (Telegram webhook)
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("OK");
    }

    const update = JSON.parse(e.postData.contents);

    // Verify authorized user/chat
    if (update.message && String(update.message.chat.id) === String(TELEGRAM_CHAT_ID)) {
      const text = update.message.text;

      if (text) {
        sendTelegramMessage("⏳ Đang tìm kiếm dữ liệu, chờ chút nhé...");
        
        const ruleJson = makeTheRule(text);
        if (!ruleJson) {
          sendTelegramMessage("❌ Không thể tạo điều kiện lọc từ yêu cầu của bạn.");
          return ContentService.createTextOutput("OK");
        }

        let parsedRule;
        try {
          parsedRule = JSON.parse(ruleJson);
        } catch (parseErr) {
          Logger.log("Rule JSON parse error: " + parseErr + " | Rule text: " + ruleJson);
          sendTelegramMessage("❌ Lỗi phân tích cú pháp điều kiện từ AI.");
          return ContentService.createTextOutput("OK");
        }

        const sheetName = getSheetName();
        const result = DataQuery.fromSheet(sheetName).applyRule(parsedRule).execute();

        if (!result || result.length === 0) {
          sendTelegramMessage("❌ Không có dữ liệu phù hợp.");
          return ContentService.createTextOutput("OK");
        }

        sendResultData(result);
        return ContentService.createTextOutput("OK");
      }
    }

    return ContentService.createTextOutput("OK");

  } catch (error) {
    Logger.log('Error processing webhook: ' + error);
    sendTelegramMessage("⚠️ Yêu cầu không hợp lệ hoặc xảy ra lỗi: " + error.toString());
    return ContentService.createTextOutput("OK");
  }
}

/**
 * Tự động tạo menu custom khi mở Google Sheet
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🤖 Telegram Bot')
      .addItem('🔗 Cập nhật Webhook (Auto / Manual)', 'promptUpdateWebhook')
      .addItem('⚙️ Kiểm tra Webhook hiện tại', 'checkTelegramWebhookStatus')
      .addToUi();
  } catch (e) {
    // Menu creation fails gracefully if script is not bound to a spreadsheet UI container
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