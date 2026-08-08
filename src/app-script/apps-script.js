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