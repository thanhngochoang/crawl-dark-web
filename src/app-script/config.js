const TELEGRAM_BOT_TOKEN = "8410839050:AAHT-AyHw-Q_gv7qSXnE2Pw6rx_tagAXYoE";
const TELEGRAM_CHAT_ID = "1021278066";
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"; // Replace with your actual Gemini API key
const SPREADSHEET_ID = "1cbCBWczW85kFIHKmDGAYwdNj1WPGpkDlTt_jRB8s0zQ";
const DEPLOYED_URL = "https://script.google.com/macros/s/AKfycbxOrj1JvBaDVH_34mgS76OsN__Dnjiekme0UVr_TvIvlGqOKYLo3YMn-H5-1LKtI-_J0Q/exec";

function getGeminiApiKey() {
    const key = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
    return getConfig("GEMINI_API_KEY");
}
function getTelegramApiKey() {
    return getConfig("TELEGRAM_BOT_TOKEN");
}
function getConfig(key) {
    return PropertiesService.getScriptProperties().getProperty(key) ?? "";
}