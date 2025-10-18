/**
 * Hàm định dạng dữ liệu thành bảng Markdown để gửi Telegram
 * @param {Array} data - Danh sách dữ liệu (object)
 * @param {number} startIndex - Số thứ tự bắt đầu (dùng khi chia batch)
 * @returns {string} - Chuỗi dạng bảng Markdown
 */
function formatDataAsTable(data, startIndex = 0) {
    let table = "```\n";
    table += `#  | Khu Vực           | SĐT           | Giá        | Năm Sinh | Ngày Tạo\n`;
    table += `---|--------------------|---------------|------------|-----------|------------\n`;

    data.forEach((item, idx) => {
        const row = [
            String(startIndex + idx + 1).padEnd(2),
            (item["Khu Vực"] || "-").padEnd(18),
            (item["Số điện thoại"] || "-").padEnd(13),
            (item["Giá"] || "-").toString().padEnd(10),
            (item["Năm Sinh"] || "-").toString().padEnd(9),
            formatDate(item["Ngày Tạo"])
        ];
        table += `${row.join(" | ")}\n`;
    });

    table += "```";
    return table;
}
/**
 * Định dạng ngày về dạng dd/MM/yyyy
 * @param {string|Date} dateValue - Chuỗi hoặc đối tượng Date
 * @returns {string} - Chuỗi ngày định dạng dd/MM/yyyy hoặc "-" nếu không hợp lệ
 */
function formatDate(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (isNaN(date)) return "-"; // kiểm tra giá trị hợp lệ

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}
/**
 * Gửi dữ liệu kết quả tới Telegram, chia batch để tránh tin quá dài
 * @param {Array} data - Danh sách dữ liệu kết quả
 */
function sendResultData(data) {
    const filter = filterValidPhoneData(data);
    if (!filter || filter.length === 0) {
        return sendTelegramMessage("❌ Không có dữ liệu phù hợp.");
    }

    sendTelegramMessage("🍽 Ra món phù hợp cho quý dị:\n");

    const batchSize = 3;
    for (let i = 0; i < filter.length; i += batchSize) {
        const batch = filter.slice(i, i + batchSize);
        const message = formatDataAsTable(batch, i);
        sendTelegramMessage(message);
        break;
    }
}

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
