function getConfig(key) {
    return PropertiesService.getScriptProperties().getProperty(key) ?? "";
}

function setConfig(key, value) {
    PropertiesService.getScriptProperties().setProperty(key, value);
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
    let url = getConfig("DEPLOYED_URL");
    if (!url && typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
        try {
            url = ScriptApp.getService().getUrl();
        } catch (e) {
            // Ignore error if service is not deployed as Web App
        }
    }
    return url;
}

function setDeployedUrl(url) {
    setConfig("DEPLOYED_URL", url);
}

function getCloudflareAccountId() {
    return getConfig("CLOUDFLARE_ACCOUNT_ID");
}

function getCloudflareApiToken() {
    return getConfig("CLOUDFLARE_API_TOKEN");
}

function getCloudflareModel() {
    return getConfig("CLOUDFLARE_MODEL") || "@cf/qwen/qwen2.5-7b-instruct";
}

const TELEGRAM_BOT_TOKEN = getTelegramApiKey();
const TELEGRAM_CHAT_ID = getTelegramChatId();
const GEMINI_API_KEY = getGeminiApiKey();
const CLOUDFLARE_ACCOUNT_ID = getCloudflareAccountId();
const CLOUDFLARE_API_TOKEN = getCloudflareApiToken();
const CLOUDFLARE_MODEL = getCloudflareModel();
const SPREADSHEET_ID = getSpreadsheetId();
const DEPLOYED_URL = getDeployedUrl();