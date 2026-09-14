/**
 * Google Apps Script Web App & Spreadsheet UI Entrypoint
 * This script serves as the main entry point for Web App endpoints and UI menu.
 */

// Web app function for GET requests (Health Check & Diagnostics)
function doGet(e) {
  const traceId = typeof generateTraceId === 'function' ? generateTraceId() : "get_" + Date.now().toString(36);
  try {
    const diagnostics = typeof getTelegramDiagnostics === 'function'
      ? getTelegramDiagnostics(traceId)
      : { status: "online", timestamp: new Date().toISOString() };

    return ContentService.createTextOutput(JSON.stringify(diagnostics, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    if (typeof logTrace === 'function') {
      logTrace(traceId, "GET_EXCEPTION", `Error running diagnostics: ${err.toString()}`);
    }
    return ContentService.createTextOutput("Error running diagnostics: " + err.toString());
  }
}

// Web app function for POST requests (Telegram webhook)
function doPost(e) {
  if (typeof handleTelegramWebhook === 'function') {
    return handleTelegramWebhook(e);
  }
  return ContentService.createTextOutput("OK");
}

/**
 * Automatically create custom menu when Google Spreadsheet is opened
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    doPost,
    onOpen
  };
}
