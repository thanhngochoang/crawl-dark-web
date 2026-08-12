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
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId() || TELEGRAM_CHAT_ID;

    if (!token) {
        Logger.log("❌ Error sending message: TELEGRAM_BOT_TOKEN is not configured.");
        return false;
    }

    if (!chatId) {
        Logger.log("❌ Error sending message: TELEGRAM_CHAT_ID is not configured.");
        return false;
    }

    const url = "https://api.telegram.org/bot" + token + "/sendMessage";
    const payload = {
        chat_id: chatId,
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
        const resText = response.getContentText();
        Logger.log("Telegram message response: " + resText);
        const resJson = JSON.parse(resText);
        return resJson && resJson.ok === true;
    } catch (error) {
        Logger.log("Error sending Telegram message: " + error);
        return false;
    }
}

/**
 * Function to test and verify Telegram Bot API connection
 * Checks:
 * 1. Bot token validity via /getMe
 * 2. Ability to send a test message to TELEGRAM_CHAT_ID via /sendMessage
 * 3. Current Webhook status via /getWebhookInfo
 * 
 * Returns an object with test results.
 */
function checkTelegramConnection() {
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const chatId = getTelegramChatId() || TELEGRAM_CHAT_ID;

    const results = {
        success: false,
        botInfo: null,
        messageSent: false,
        webhookInfo: null,
        errors: []
    };

    if (!token) {
        results.errors.push("TELEGRAM_BOT_TOKEN is not configured in Script Properties.");
        Logger.log("❌ Connection Check Failed: TELEGRAM_BOT_TOKEN missing.");
        return results;
    }

    // Step 1: Test Bot Token via /getMe
    try {
        const getMeUrl = "https://api.telegram.org/bot" + token + "/getMe";
        const res = UrlFetchApp.fetch(getMeUrl, { muteHttpExceptions: true });
        const data = JSON.parse(res.getContentText());
        
        if (data.ok) {
            results.botInfo = data.result;
            Logger.log("✅ Bot Verified: @" + data.result.username + " (" + data.result.first_name + ")");
        } else {
            results.errors.push("Bot token error: " + (data.description || "Invalid token"));
            Logger.log("❌ Bot Token Verification Failed: " + res.getContentText());
            return results;
        }
    } catch (err) {
        results.errors.push("Failed to connect to Telegram getMe API: " + err.toString());
        Logger.log("❌ Network/API Error on getMe: " + err.toString());
        return results;
    }

    // Step 2: Test sending a message to TELEGRAM_CHAT_ID
    if (!chatId) {
        results.errors.push("TELEGRAM_CHAT_ID is not configured in Script Properties.");
        Logger.log("⚠️ TELEGRAM_CHAT_ID missing. Skipping test message.");
    } else {
        const testMsg = "🤖 <b>Kiểm tra kết nối Telegram Bot</b>\n\n✅ Bot kết nối thành công với Google Apps Script!\n⏰ Thời gian: " + new Date().toLocaleString("vi-VN");
        const sent = sendTelegramMessage(testMsg);
        results.messageSent = sent;
        if (!sent) {
            results.errors.push("Không thể gửi tin nhắn thử tới Telegram Chat ID: " + chatId);
        }
    }

    // Step 3: Check Webhook Info via /getWebhookInfo
    try {
        const getWebhookUrl = "https://api.telegram.org/bot" + token + "/getWebhookInfo";
        const res = UrlFetchApp.fetch(getWebhookUrl, { muteHttpExceptions: true });
        const data = JSON.parse(res.getContentText());
        if (data.ok) {
            results.webhookInfo = data.result;
        }
    } catch (err) {
        Logger.log("⚠️ Error fetching webhook info: " + err.toString());
    }

    results.success = (results.botInfo !== null) && (chatId ? results.messageSent : true);
    return results;
}

// Function to set webhook for Telegram
function setWebhook(customUrl) {
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const targetUrl = customUrl || getDeployedUrl() || DEPLOYED_URL;

    if (!token) {
        Logger.log("❌ Error setting webhook: TELEGRAM_BOT_TOKEN is not configured.");
        return false;
    }

    if (!targetUrl) {
        Logger.log("❌ Error setting webhook: DEPLOYED_URL is empty.");
        return false;
    }

    const url = "https://api.telegram.org/bot" + token + "/setWebhook";
    const payload = {
        url: targetUrl,
    };

    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        const resultText = response.getContentText();
        Logger.log("Webhook set for URL (" + targetUrl + "): " + resultText);
        return true;
    } catch (error) {
        Logger.log("Error setting webhook: " + error);
        return false;
    }
}

/**
 * Cập nhật DEPLOYED_URL trong Script Properties và tự động gọi setWebhook.
 * Nếu không truyền newUrl, hàm sẽ tự động lấy Web App URL qua ScriptApp.getService().getUrl() (nếu có).
 */
function updateDeployedUrlAndSetWebhook(newUrl) {
    let targetUrl = newUrl;

    if (!targetUrl && typeof ScriptApp !== 'undefined' && ScriptApp.getService) {
        try {
            targetUrl = ScriptApp.getService().getUrl();
        } catch (e) {
            Logger.log("Không thể tự động lấy Web App URL: " + e);
        }
    }

    if (targetUrl) {
        setDeployedUrl(targetUrl);
        Logger.log("Đã cập nhật DEPLOYED_URL trong Script Properties: " + targetUrl);
    } else {
        targetUrl = getDeployedUrl();
    }

    if (!targetUrl) {
        Logger.log("❌ Không tìm thấy DEPLOYED_URL. Vui lòng truyền URL hoặc thiết lập DEPLOYED_URL trong Script Properties.");
        return false;
    }

    return setWebhook(targetUrl);
}

// Function to remove webhook
function removeWebhook() {
    const token = getTelegramApiKey() || TELEGRAM_BOT_TOKEN;
    const url = "https://api.telegram.org/bot" + token + "/deleteWebhook";

    const options = {
        method: "post",
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        Logger.log("Webhook removed: " + response.getContentText());
    } catch (error) {
        Logger.log("Error removing webhook: " + error);
    }
}

// Function to setup Telegram webhook
function setupTelegramWebhook(newUrl) {
    const result = updateDeployedUrlAndSetWebhook(newUrl);
    Logger.log("Telegram webhook setup completed.");
    return result;
}

// Function to remove Telegram webhook
function removeTelegramWebhook() {
    removeWebhook();
    Logger.log("Telegram webhook removed.");
}
