/**
 * Google Apps Script for Google Sheets
 * This script can be used to automate tasks in the escort data spreadsheet.
 */

// Function to get the target sheet
function getCurrentSheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
}

// Function to get data from a specific sheet
function getSheetData(sheetName) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log("Sheet not found: " + sheetName);
    return null;
  }
  return sheet.getDataRange().getValues();
}

// Function to count rows in current sheet (read-only)
function countRows() {
  const sheet = getCurrentSheet();
  return sheet.getLastRow();
}

// Function to export sheet data to CSV
function exportToCSV() {
  const sheet = getCurrentSheet();
  const data = sheet.getDataRange().getValues();
  const csv = data.map((row) => row.map((cell) => '"' + cell.toString().replace(/"/g, '""') + '"').join(",")).join("\n");
  return csv;
}

// Function to send email with sheet summary
function sendSummaryEmail() {
  const sheet = getCurrentSheet();
  const rowCount = sheet.getLastRow() - 1; // Subtract header row
  const subject = "Daily Escort Data Summary - " + sheet.getName();
  const body = "Total records: " + rowCount + "\nSheet: " + sheet.getName();

  // Note: Replace with actual email
  // MailApp.sendEmail('your-email@example.com', subject, body);
  Logger.log("Email summary: " + body);
}

// Function to setup Telegram webhook
function setupTelegramWebhook() {
  setWebhook();
  Logger.log("Telegram webhook set up");
}

// Function to remove Telegram webhook
function removeTelegramWebhook() {
  removeWebhook();
  Logger.log("Telegram webhook removed");
}

// Menu function to add custom menu
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Escort Data Tools")
    .addItem("Count Rows", "countRows")
    .addItem("Send Summary Email", "sendSummaryEmail")
    .addSeparator()
    .addItem("Setup Telegram Webhook", "setupTelegramWebhook")
    .addItem("Remove Telegram Webhook", "removeTelegramWebhook")
    .addItem("Send Daily Summary to Telegram", "sendDailySummaryToTelegram")
    .addSubMenu(ui.createMenu("Filter & Send to Telegram").addItem("Filter by Sài Gòn", "filterSaigon").addItem("Filter by Price < 500K", "filterCheap").addItem("Filter by Age 18-25", "filterYoung"))
    .addToUi();
}

// Filter helper functions
function filterSaigon() {
  filterAndSendToTelegram({ location: "Sài Gòn" });
}

function filterCheap() {
  filterAndSendToTelegram({ maxPrice: 500000 });
}

function filterYoung() {
  filterAndSendToTelegram({ minAge: 18, maxAge: 25 });
}

// Telegram configuration
const TELEGRAM_BOT_TOKEN = "8410839050:AAHT-AyHw-Q_gv7qSXnE2Pw6rx_tagAXYoE";
const TELEGRAM_CHAT_ID = "1021278066";
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // Replace with your actual Gemini API key
const SPREADSHEET_ID = "1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ";
const DEPLOYED_URL = "https://script.google.com/macros/s/AKfycbxOrj1JvBaDVH_34mgS76OsN__Dnjiekme0UVr_TvIvlGqOKYLo3YMn-H5-1LKtI-_J0Q/exec";

// Sheet configuration
function getSheetName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
const SHEET_NAME = getSheetName()

// Store last update ID in script properties
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const LAST_UPDATE_KEY = "lastUpdateId";

// Function to send message to Telegram
function sendTelegramMessage(message) {
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML",
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log("Telegram message sent: " + response.getContentText());
    return true;
  } catch (error) {
    Logger.log("Error sending Telegram message: " + error);
    return false;
  }
}

// Function to set webhook for Telegram
function setWebhook() {
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook";
  const payload = {
    url: DEPLOYED_URL,
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log("Webhook set: " + response.getContentText());
  } catch (error) {
    Logger.log("Error setting webhook: " + error);
  }
}

// Function to remove webhook
function removeWebhook() {
  const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/deleteWebhook";

  const options = {
    method: "post",
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log("Webhook removed: " + response.getContentText());
  } catch (error) {
    Logger.log("Error removing webhook: " + error);
  }
}


// Function to filter data by criteria and send to Telegram
function filterAndSendToTelegram(criteria) {
  const sheet = getCurrentSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    sendTelegramMessage("No data available in the sheet.");
    return;
  }

  // Remove header row
  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const khuVucIndex = headers.indexOf("Khu Vực");
  const giaIndex = headers.indexOf("Giá");
  const namSinhIndex = headers.indexOf("Năm Sinh");

  if (khuVucIndex === -1 || giaIndex === -1 || namSinhIndex === -1) {
    sendTelegramMessage("Required columns not found in the sheet.");
    return;
  }

  // Filter data based on criteria
  let filteredData = rows;

  if (criteria.location) {
    filteredData = filteredData.filter((row) => row[khuVucIndex] && row[khuVucIndex].toString().toLowerCase().includes(criteria.location.toLowerCase()));
  }

  if (criteria.maxPrice) {
    filteredData = filteredData.filter((row) => {
      const priceStr = row[giaIndex] ? row[giaIndex].toString().replace(/[^\d]/g, "") : "";
      const price = parseInt(priceStr);
      return !isNaN(price) && price <= criteria.maxPrice;
    });
  }

  if (criteria.minAge && criteria.maxAge) {
    const currentYear = new Date().getFullYear();
    filteredData = filteredData.filter((row) => {
      const birthYear = parseInt(row[namSinhIndex]);
      if (isNaN(birthYear)) return false;
      const age = currentYear - birthYear;
      return age >= criteria.minAge && age <= criteria.maxAge;
    });
  }

  // Send filtered results to Telegram
  if (filteredData.length === 0) {
    sendTelegramMessage("No data matches the filter criteria.");
    return;
  }

  let message = `📊 Filtered Escort Data (${filteredData.length} results):\n\n`;

  filteredData.slice(0, 10).forEach((row, index) => {
    message += `${index + 1}. 📍 ${row[khuVucIndex]}\n`;
    message += `💰 ${row[giaIndex]}\n`;
    message += `🎂 ${row[namSinhIndex]}\n`;
    message += `📞 ${row[headers.indexOf("Số điện thoại")]}\n\n`;
  });

  if (filteredData.length > 10) {
    message += `... and ${filteredData.length - 10} more results.`;
  }

  sendTelegramMessage(message);
}

// Function to send daily summary to Telegram
function sendDailySummaryToTelegram() {
  const sheet = getCurrentSheet();
  const rowCount = sheet.getLastRow() - 1; // Subtract header row
  const sheetName = sheet.getName();

  const message = `📈 Daily Summary - ${sheetName}\n` + `📊 Total records: ${rowCount}\n` + `📅 Date: ${new Date().toLocaleDateString()}`;

  sendTelegramMessage(message);
}
// Function to retrieve the API key securely
function getGeminiApiKey() {
  // Good practice: Store API key in Script Properties (File -> Project properties -> Script properties)
  // Key: GEMINI_API_KEY, Value: YOUR_API_KEY
  const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  return key;
}
function napGemini() {
  const sheet = getCurrentSheet();
  const data = sheet.getDataRange().getValues();
  sendTelegramMessage("Reading data from the sheet: " + SHEET_NAME);

  if (data.length <= 1) {
    sendTelegramMessage("No data available in the sheet.");
    return;
  }

  const headers = data[0].join(" | ");
  const rows = data.slice(1);
  const totalRows = rows.length;
  const CHUNK_SIZE = 50; // Số hàng gửi mỗi lần
  const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);

  sendTelegramMessage(`Total ${totalRows} rows, will send in ${totalChunks} chunks.`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalRows);
    const chunkRows = rows.slice(start, end)
      .map(row => row.join(" | "))
      .join("\n");

    const prompt = `
    Bạn là một trợ lý AI, chuyên truy vấn dữ liệu từ Google Sheet.
    Đây là phần dữ liệu số ${i + 1}/${totalChunks}.
    Mỗi cột được phân tách bằng ký tự '|'.

    **Cấu trúc cột:**
    ${headers}

    **Dữ liệu từ hàng ${start + 1} đến ${end} trong tổng số ${totalRows}:**
    ${chunkRows}

    Hãy xác nhận đã nhận dữ liệu phần ${i + 1}/${totalChunks}.
    `;

    // Gọi API xử lý từng phần
    sendTelegramMessage(`Sending chunk ${i + 1}/${totalChunks} to Gemini...`);
    callGemini(prompt);

    // Thêm delay để tránh giới hạn gọi API (nếu cần)
    Utilities.sleep(2000); // 2s giữa các lần gọi
  }

  sendTelegramMessage(`✅ Finished sending all ${totalChunks} chunks to Gemini.`);
}

function queryWithGemini(query) {
  const prompt = `Bạn là một trợ lý AI, chuyên truy vấn dữ liệu từ Google Sheet.
 Dựa vào dữ liệu đã cung cấp trước đó,
  
  **Truy vấn của người dùng:** "${query}"
  
  Dựa *duy nhất* trên dữ liệu được cung cấp, hãy phân tích truy vấn và đưa ra câu trả lời rõ ràng, súc tích bao gồm thông tin họ tên, số điện thoại, Khu vực. Hãy trình bày kết quả một cách gọn gàng, có thể dưới dạng danh sách hoặc bảng.
  Không đề cập đến việc dữ liệu bị cắt bớt.`;

  return callGemini(prompt);
}
// Function to query sheet data using Gemini AI
function callGemini(prompt) {
  const apiKey = getGeminiApiKey();
  const modelName = 'gemini-2.5-flash'; // Recommended
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    // 1. Check for API-level errors
    if (result.error) {
      const errorMessage = `API Error: ${result.error.message}`;
      Logger.log(errorMessage);
      sendTelegramMessage("🤖 Gemini Error: " + errorMessage);
      return;
    }

    // 2. Check for candidates (successful generation)
    if (result.candidates && result.candidates.length > 0) {
      const candidate = result.candidates[0];

      // 3. Check for blocked content
      if (candidate.finishReason === 'SAFETY') {
        sendTelegramMessage("🚫 The response was blocked due to safety settings. Please try a different query.");
        return;
      }

      // 4. Extract the text
      const aiResponse = candidate.content.parts[0].text;
      sendTelegramMessage(aiResponse);

    } else {
      // Catch all for unexpected empty responses
      sendTelegramMessage("🤖 Gemini Error: Received an empty or malformed response.");
    }

  } catch (error) {
    // Catch network or parsing errors
    sendTelegramMessage("Error querying Gemini: " + error.toString());
    Logger.log("Error querying Gemini: " + error.toString());
  }
}



// Web app function for POST requests (Telegram webhook)
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);

    if (update.message && update.message.chat.id == TELEGRAM_CHAT_ID) {
      const text = update.message.text;

      if (text && text.startsWith('/')) {
        if (text.startsWith("/nap")) {
          sendTelegramMessage("Bắt đầu nạp dữ liệu");
          napGemini(text);
          sendTelegramMessage("Nạp dữ liệu thành công. Mời bạn nhập query.");
          return
        } else {
          sendTelegramMessage("Hum... hay đấy");
          queryWithGemini(text);
          sendTelegramMessage("Bạn có hài lòng không?");
          return
        }

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