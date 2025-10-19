/**
 * Google Apps Script for Google Sheets
 * This script can be used to automate tasks in the escort data spreadsheet.
 */


// Web app function for POST requests (Telegram webhook)
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);

    if (update.message && update.message.chat.id == TELEGRAM_CHAT_ID) {
      const text = update.message.text;

      if (text) {
        sendTelegramMessage("Hay đấy, chờ tý");
        const rule = makeTheRule(text);
        const data = getSheetData(SHEET_NAME);
        const result = data.filter(item => applyFilters(item, JSON.parse(rule)));
        sendResultData(result);
        sendTelegramMessage("Thỏa mãn chưa?");
        return

      }
    }

    // Return simple OK response
    sendTelegramMessage("Không có lệnh phù hợp");
    return;

  } catch (error) {
    Logger.log('Error processing webhook: ' + error);
    sendTelegramMessage("Yêu cầu không hợp lệ: ", error);
    return
  }
}