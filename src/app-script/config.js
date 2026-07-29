function getConfig(key) {
    return PropertiesService.getScriptProperties().getProperty(key) ?? "";
}

function getGeminiApiKey() {
    return getConfig("GEMINI_API_KEY");
}

function getTelegramApiKey() {
    return getConfig("TELEGRAM_BOT_TOKEN");
}

function getTelegramChatId() {
    return getConfig("TELEGRAM_CHAT_ID");
}

function getSpreadsheetId() {
    return getConfig("SPREADSHEET_ID");
}

function getDeployedUrl() {
    return getConfig("DEPLOYED_URL");
}

const TELEGRAM_BOT_TOKEN = getTelegramApiKey();
const TELEGRAM_CHAT_ID = getTelegramChatId();
const GEMINI_API_KEY = getGeminiApiKey();
const SPREADSHEET_ID = getSpreadsheetId();
const DEPLOYED_URL = getDeployedUrl();