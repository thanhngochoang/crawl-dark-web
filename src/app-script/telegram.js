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
 * Chuẩn hóa số điện thoại, loại bỏ ký tự rác để người dùng chạm là copy chuẩn
 */
function cleanPhoneNumber(phone) {
    if (!phone) return "";
    return String(phone).replace(/[^\d+]/g, "").trim();
}

/**
 * Định dạng 1 mục kết quả với <code>phone</code> giúp chạm 1 lần là sao chép được trên Telegram
 */
function formatResultItem(item) {
    const rawPhone = item["Số điện thoại"] || "";
    const phone = cleanPhoneNumber(rawPhone) || String(rawPhone).replace(/'/g, "").trim();
    const gia = item["Giá"] ? String(item["Giá"]).trim() : "";
    const namSinh = item["Năm Sinh"] ? `NS: ${item["Năm Sinh"]}` : "";

    const specs = [];
    if (gia) specs.push(gia);
    if (namSinh) specs.push(namSinh);

    if (item["Chiều Cao"] && item["Cân Nặng"]) {
        specs.push(`${item["Chiều Cao"]}, ${item["Cân Nặng"]}`);
    } else if (item["Chiều Cao"]) {
        specs.push(`${item["Chiều Cao"]}`);
    } else if (item["Cân Nặng"]) {
        specs.push(`${item["Cân Nặng"]}`);
    }

    if (item["Số đồ 3 vòng"]) {
        if (typeof item["Số đồ 3 vòng"] === "object") {
            const v1 = item["Số đồ 3 vòng"].bust;
            if (v1) specs.push(`V1: ${v1}`);
        } else {
            specs.push(String(item["Số đồ 3 vòng"]));
        }
    }

    const detailStr = specs.length > 0 ? ` | ${specs.map(escapeHtml).join(" | ")}` : "";
    return `• <code>${escapeHtml(phone)}</code>${detailStr}`;
}

/**
 * Gom các kết quả thành các message súc tích (tối đa 3800 ký tự/message) để tránh spam tin nhắn Telegram
 */
function buildResultMessages(filteredItems, maxDisplay = 30) {
    if (!filteredItems || filteredItems.length === 0) {
        return ["❌ Không tìm thấy dữ liệu phù hợp."];
    }

    const totalCount = filteredItems.length;
    const displayItems = filteredItems.slice(0, maxDisplay);
    const groupedData = typeof groupByKey === 'function'
        ? groupByKey(displayItems, "Khu Vực", "Khác")
        : { "Danh sách": displayItems };

    const messages = [];
    let currentMessage = `📋 <b>Tìm thấy ${totalCount} kết quả${totalCount > maxDisplay ? ` (hiển thị ${maxDisplay} đầu)` : ""}:</b>\n\n`;

    for (const [khuVuc, items] of Object.entries(groupedData)) {
        let section = `🏙️ <b>${escapeHtml(khuVuc)}:</b>\n`;
        for (const item of items) {
            section += formatResultItem(item) + "\n";
        }
        section += "\n";

        if ((currentMessage + section).length > 3800) {
            messages.push(currentMessage.trim());
            currentMessage = section;
        } else {
            currentMessage += section;
        }
    }

    if (totalCount > maxDisplay) {
        const footer = `<i>⚠️ Còn ${totalCount - maxDisplay} kết quả khác. Vui lòng thêm điều kiện để lọc chính xác hơn.</i>\n\n`;
        if ((currentMessage + footer).length > 3800) {
            messages.push(currentMessage.trim());
            currentMessage = footer;
        } else {
            currentMessage += footer;
        }
    }

    const copyTip = `<i>💡 Nhấn vào số điện thoại để sao chép nhanh.</i>`;
    if ((currentMessage + copyTip).length > 3800) {
        messages.push(currentMessage.trim());
        currentMessage = copyTip;
    } else {
        currentMessage += copyTip;
    }

    if (currentMessage.trim()) {
        messages.push(currentMessage.trim());
    }

    return messages;
}

/**
 * Gửi dữ liệu kết quả tới Telegram dưới dạng tin nhắn gộp gọn gàng
 */
function sendResultData(data) {
    const filter = typeof filterValidPhoneData === 'function' ? filterValidPhoneData(data) : data;
    if (!filter || filter.length === 0) {
        return sendTelegramMessage("❌ Không có dữ liệu phù hợp.");
    }

    const messages = buildResultMessages(filter, 30);
    for (const msg of messages) {
        sendTelegramMessage(msg);
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        formatDate,
        cleanPhoneNumber,
        formatResultItem,
        buildResultMessages,
        sendResultData,
        sendTelegramMessage,
        checkTelegramConnection,
        setWebhook,
        updateDeployedUrlAndSetWebhook,
        removeWebhook,
        setupTelegramWebhook,
        removeTelegramWebhook
    };
}
