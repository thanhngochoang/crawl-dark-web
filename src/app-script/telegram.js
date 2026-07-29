/**
 * Escape HTML special characters to prevent Telegram HTML parser errors
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Định dạng ngày về dạng dd/MM/yyyy
 */
function formatDate(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

/**
 * Tạo tin nhắn dạng bảng HTML cho 1 batch dữ liệu của 1 khu vực
 */
function buildGroupMessageChunk(khuVuc, items, isFirstBatch = true) {
    let message = "";
    if (isFirstBatch) {
        message += `🏙️ <b>Khu vực:</b> ${escapeHtml(khuVuc)}\n`;
    }
    message += "<pre>";
    message += "Giá     | SĐT           | NS   | Ngày tạo\n";
    message += "------------------------------------------\n";

    for (const item of items) {
        const gia = String(item["Giá"] || "-").padEnd(7);
        const sdt = String(item["Số điện thoại"] || "-").padEnd(13);
        const namSinh = String(item["Năm Sinh"] || "-").padEnd(4);
        const ngayTao = formatDate(item["Ngày Tạo"]).padEnd(10);
        message += `${gia} | ${sdt} | ${namSinh} | ${ngayTao}\n`;
    }

    message += "</pre>";
    return message;
}

/**
 * Gửi dữ liệu kết quả tới Telegram, chia batch nhỏ để tránh tin quá dài (>4096 chars)
 */
function sendResultData(data) {
    const filter = filterValidPhoneData(data);
    if (!filter || filter.length === 0) {
        return sendTelegramMessage("❌ Không có dữ liệu phù hợp.");
    }

    const groupedData = groupByKey(filter, "Khu Vực", "Không xác định");

    for (const [khuVuc, items] of Object.entries(groupedData)) {
        const BATCH_SIZE = 15;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            const batch = items.slice(i, i + BATCH_SIZE);
            const message = buildGroupMessageChunk(khuVuc, batch, i === 0);
            sendTelegramMessage(message);
        }
    }
}


// Function to send message to Telegram
function sendTelegramMessage(message) {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
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
