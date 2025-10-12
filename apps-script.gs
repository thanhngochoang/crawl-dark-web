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
    Logger.log('Sheet not found: ' + sheetName);
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
  const csv = data.map(row => row.map(cell => '"' + cell.toString().replace(/"/g, '""') + '"').join(',')).join('\n');
  return csv;
}

// Function to send email with sheet summary
function sendSummaryEmail() {
  const sheet = getCurrentSheet();
  const rowCount = sheet.getLastRow() - 1; // Subtract header row
  const subject = 'Daily Escort Data Summary - ' + sheet.getName();
  const body = 'Total records: ' + rowCount + '\nSheet: ' + sheet.getName();

  // Note: Replace with actual email
  // MailApp.sendEmail('your-email@example.com', subject, body);
  Logger.log('Email summary: ' + body);
}

// Function to setup Telegram webhook
function setupTelegramWebhook() {
  setWebhook();
  Logger.log('Telegram webhook set up');
}

// Function to remove Telegram webhook
function removeTelegramWebhook() {
  removeWebhook();
  Logger.log('Telegram webhook removed');
}

// Menu function to add custom menu
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Escort Data Tools')
    .addItem('Count Rows', 'countRows')
    .addItem('Send Summary Email', 'sendSummaryEmail')
    .addSeparator()
    .addItem('Setup Telegram Webhook', 'setupTelegramWebhook')
    .addItem('Remove Telegram Webhook', 'removeTelegramWebhook')
    .addItem('Send Daily Summary to Telegram', 'sendDailySummaryToTelegram')
    .addSubMenu(ui.createMenu('Filter & Send to Telegram')
      .addItem('Filter by Sài Gòn', 'filterSaigon')
      .addItem('Filter by Price < 500K', 'filterCheap')
      .addItem('Filter by Age 18-25', 'filterYoung'))
    .addToUi();
}

// Filter helper functions
function filterSaigon() {
  filterAndSendToTelegram({location: 'Sài Gòn'});
}

function filterCheap() {
  filterAndSendToTelegram({maxPrice: 500000});
}

function filterYoung() {
  filterAndSendToTelegram({minAge: 18, maxAge: 25});
}

// Telegram configuration
const TELEGRAM_BOT_TOKEN = "8410839050:AAHT-AyHw-Q_gv7qSXnE2Pw6rx_tagAXYoE";
const TELEGRAM_CHAT_ID = '1021278066';
const SPREADSHEET_ID = '1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ';
const DEPLOYED_URL = "https://script.google.com/macros/s/AKfycbxOrj1JvBaDVH_34mgS76OsN__Dnjiekme0UVr_TvIvlGqOKYLo3YMn-H5-1LKtI-_J0Q/exec";

// Sheet configuration
function getSheetName() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const SHEET_NAME = getSheetName() + "-all";

// Store last update ID in script properties
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const LAST_UPDATE_KEY = 'lastUpdateId';

// Function to send message to Telegram
function sendTelegramMessage(message) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('Telegram message sent: ' + response.getContentText());
    return true;
  } catch (error) {
    Logger.log('Error sending Telegram message: ' + error);
    return false;
  }
}

// Function to set webhook for Telegram
function setWebhook() {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/setWebhook';
  const payload = {
    url: DEPLOYED_URL
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('Webhook set: ' + response.getContentText());
  } catch (error) {
    Logger.log('Error setting webhook: ' + error);
  }
}

// Function to remove webhook
function removeWebhook() {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/deleteWebhook';

  const options = {
    method: 'post'
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    Logger.log('Webhook removed: ' + response.getContentText());
  } catch (error) {
    Logger.log('Error removing webhook: ' + error);
  }
}

// Command configuration
const COMMANDS = {
  '/filter': {
    description: 'Filter data by criteria',
    subcommands: {
      'location': {
        description: 'Filter by location (e.g., /filter location Sài Gòn)',
        handler: (value) => filterAndSendToTelegram({ location: value })
      },
      'price': {
        description: 'Filter by price (e.g., /filter price <500000)',
        handler: (value) => {
          const priceMatch = value.match(/([<>]=?)?\s*(\d+)/);
          if (priceMatch) {
            const operator = priceMatch[1] || '<=';
            const price = parseInt(priceMatch[2]);
            const criteria = operator.includes('<') ? { maxPrice: price } : { minPrice: price };
            filterAndSendToTelegram(criteria);
          }
        }
      },
      'age': {
        description: 'Filter by age range (e.g., /filter age 18-25)',
        handler: (value) => {
          const ageMatch = value.match(/(\d+)-(\d+)/);
          if (ageMatch) {
            filterAndSendToTelegram({ minAge: parseInt(ageMatch[1]), maxAge: parseInt(ageMatch[2]) });
          }
        }
      }
    }
  },
  '/summary': {
    description: 'Send daily summary',
    handler: () => sendDailySummaryToTelegram()
  },
  '/total': {
    description: 'Count total records with phone numbers',
    handler: () => {
      const sheet = getCurrentSheet();
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) return 'No data available in the sheet.';
      const headers = data[0];
      const phoneIndex = headers.indexOf('Số điện thoại');
      if (phoneIndex === -1) return 'Phone number column not found.';
      const rowsWithPhone = data.slice(1).filter(row => row[phoneIndex] && row[phoneIndex].toString().trim() !== '');
      return `Total records with phone numbers: ${rowsWithPhone.length}`;
    }
  },
  '/help': {
    description: 'Show available commands',
    handler: () => generateHelp()
  }
};

// Function to generate help text from config
function generateHelp() {
  let helpText = '📋 Available Commands:\n\n';

  Object.keys(COMMANDS).forEach(cmd => {
    const command = COMMANDS[cmd];
    helpText += `🔹 ${cmd} - ${command.description}\n`;

    if (command.subcommands) {
      Object.keys(command.subcommands).forEach(sub => {
        helpText += `   └ ${cmd} ${sub} - ${command.subcommands[sub].description}\n`;
      });
    }
    helpText += '\n';
  });

  return helpText.trim();
}

// Function to parse command from text
function parseCommand(text) {
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();

  if (COMMANDS[cmd]) {
    if (COMMANDS[cmd].subcommands && parts[1]) {
      const subCmd = parts[1];
      if (COMMANDS[cmd].subcommands[subCmd]) {
        const value = parts.slice(2).join(' ');
        return { type: cmd, subType: subCmd, value: value };
      }
    } else if (!COMMANDS[cmd].subcommands) {
      return { type: cmd };
    }
  }

  return null;
}

// Function to execute command and return response
function executeCommand(command) {
  const cmdConfig = COMMANDS[command.type];

  if (!cmdConfig) {
    return 'Unknown command. Use /help for available commands.';
  }

  if (command.subType && cmdConfig.subcommands) {
    const subConfig = cmdConfig.subcommands[command.subType];
    if (subConfig && subConfig.handler) {
      subConfig.handler(command.value);
      return `Executed: ${command.type} ${command.subType}`;
    }
  } else if (!command.subType && cmdConfig.handler) {
    const result = cmdConfig.handler();
    return typeof result === 'string' ? result : `Executed: ${command.type}`;
  }

  return 'Invalid command format. Use /help for available commands.';
}

// Function to filter data by criteria and send to Telegram
function filterAndSendToTelegram(criteria) {
  const sheet = getCurrentSheet();
  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    sendTelegramMessage('No data available in the sheet.');
    return;
  }

  // Remove header row
  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const khuVucIndex = headers.indexOf('Khu Vực');
  const giaIndex = headers.indexOf('Giá');
  const namSinhIndex = headers.indexOf('Năm Sinh');

  if (khuVucIndex === -1 || giaIndex === -1 || namSinhIndex === -1) {
    sendTelegramMessage('Required columns not found in the sheet.');
    return;
  }

  // Filter data based on criteria
  let filteredData = rows;

  if (criteria.location) {
    filteredData = filteredData.filter(row =>
      row[khuVucIndex] && row[khuVucIndex].toString().toLowerCase().includes(criteria.location.toLowerCase())
    );
  }

  if (criteria.maxPrice) {
    filteredData = filteredData.filter(row => {
      const priceStr = row[giaIndex] ? row[giaIndex].toString().replace(/[^\d]/g, '') : '';
      const price = parseInt(priceStr);
      return !isNaN(price) && price <= criteria.maxPrice;
    });
  }

  if (criteria.minAge && criteria.maxAge) {
    const currentYear = new Date().getFullYear();
    filteredData = filteredData.filter(row => {
      const birthYear = parseInt(row[namSinhIndex]);
      if (isNaN(birthYear)) return false;
      const age = currentYear - birthYear;
      return age >= criteria.minAge && age <= criteria.maxAge;
    });
  }

  // Send filtered results to Telegram
  if (filteredData.length === 0) {
    sendTelegramMessage('No data matches the filter criteria.');
    return;
  }

  let message = `📊 Filtered Escort Data (${filteredData.length} results):\n\n`;

  filteredData.slice(0, 10).forEach((row, index) => {
    message += `${index + 1}. 📍 ${row[khuVucIndex]}\n`;
    message += `💰 ${row[giaIndex]}\n`;
    message += `🎂 ${row[namSinhIndex]}\n`;
    message += `📞 ${row[headers.indexOf('Số điện thoại')]}\n\n`;
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

  const message = `📈 Daily Summary - ${sheetName}\n` +
    `📊 Total records: ${rowCount}\n` +
    `📅 Date: ${new Date().toLocaleDateString()}`;

  sendTelegramMessage(message);
}

// Web app function for GET requests
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({status: 'OK', message: 'Escort Data API 111'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Web app function for POST requests (Telegram webhook)
function doPost(e) {

  try {
    const update = JSON.parse(e.postData.contents);

    if (update.message && update.message.chat.id == TELEGRAM_CHAT_ID) {
      const text = update.message.text;
      if (text && text.startsWith('/')) {
        const command = parseCommand(text);
        if (command) {
          const response = executeCommand(command);
          sendTelegramMessage(response);
        }
      }
    }

    // Return simple OK response
    sendTelegramMessage("Không có lệnh phù hợp");
    return;

  } catch (error) {
    Logger.log('Error processing webhook: ' + error);
    sendTelegramMessage("Không có lệnh phù hợp");
    return 
  }
}