// Function to query sheet data using Gemini AI

function makeTheRule(query) {
    const prompt = `
Bạn là một bộ chuyển đổi từ ngôn ngữ tự nhiên sang cấu trúc JSON rule.

Yêu cầu:
- Đầu vào là câu mô tả điều kiện lọc (bằng tiếng Việt tự nhiên).
- Đầu ra phải là JSON đúng **schema** dưới đây.
- Chỉ sử dụng các field trong danh sách cho phép.

---

📘 **Cấu trúc JSON phải theo mẫu:**

{
  "logic": "and" | "or",
  "filters": [
    {
      "field": string,
      "operator": "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "in",
      "value": any
    } 
    | {
      "logic": "and" | "or",
      "filters": [ ...same structure recursively... ]
    }
  ]
}

---

📌 **Danh sách field hợp lệ (chỉ dùng các tên sau, không tự tạo mới):**

- "URL"
- "Giá"
- "Số điện thoại"
- "Năm Sinh"
- "Ngày Tạo"
- "Lượt Xem"
- "Khu Vực"
- "Cân Nặng"
- "Chiều Cao"
- "Xuất xứ"
- "Số đồ 3 vòng"
- "Địa chỉ"

---

🧮 **Quy tắc xử lý:**

- Nếu câu chứa "và" → dùng '"logic": "and"'.
- Nếu câu chứa "hoặc" / "hay" → dùng '"logic": "or"'.
- Nếu câu có so sánh như “lớn hơn”, “bé hơn”, “cao hơn”, “nhiều hơn” → dùng các toán tử \`>\`, \`<\`, \`>=\`, \`<=\`.
- Nếu câu có “bằng”, “là”, “giống như” → dùng \`==\`.
- Nếu câu có “khác”, “không phải” → dùng \`!=\`.
- Nếu câu có “chứa”, "khu vực", "ở", "khu", “bao gồm”, “có chữ” → dùng \`contains\`.
- Nếu câu có “trong danh sách”, “thuộc nhóm”, “một trong” → dùng \`in\`.
- Luôn giữ giá trị ("value") ở dạng gốc, không dịch hoặc viết tắt.
- Nếu có khoảng giá trị (“từ 100 đến 500”) → chuyển thành nhóm '"logic": "and"' gồm hai điều kiện '>= ' và '<= '.

---

📊 **Ví dụ:**

**Input:**
> Giá lớn hơn 500 và Khu Vực là Hà Nội hoặc Hồ Chí Minh

**Output:**
{
  "logic": "and",
  "filters": [
    { "field": "Giá", "operator": ">", "value": 500 },
    {
      "logic": "or",
      "filters": [
        { "field": "Khu Vực", "operator": "contains", "value": "Hà Nội" },
        { "field": "Khu Vực", "operator": "contains", "value": "Hồ Chí Minh" }
      ]
    }
  ]
}

---

**Input:**
> Cân Nặng từ 50 đến 60 và Chiều Cao lớn hơn 165

**Output:**
{
  "logic": "and",
  "filters": [
    {
      "logic": "and",
      "filters": [
        { "field": "Cân Nặng", "operator": ">=", "value": 50 },
        { "field": "Cân Nặng", "operator": "<=", "value": 60 }
      ]
    },
    { "field": "Chiều Cao", "operator": ">", "value": 165 }
  ]
}

---

Bây giờ, hãy chuyển câu tiếng Việt sau thành JSON rule đúng theo format ở trên:

${query}
Phản hồi của bạn phải là một đối tượng JSON HỢP LỆ và KHÔNG được bao bọc trong bất kỳ ký hiệu markdown code block nào (ví dụ: KHÔNG dùng markdown json);
`;

    return callGemini(prompt);
}

function callGemini(prompt) {
    const apiKey = getGeminiApiKey();
    const modelName = 'gemini-2.5-flash';
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
            return null;
        }

        // 2. Check for candidates (successful generation)
        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];

            // 3. Check for blocked content
            if (candidate.finishReason === 'SAFETY') {
                sendTelegramMessage("🚫 Câu hỏi bị chặn do thiết lập an toàn. Vui lòng thử lại với câu hỏi khác.");
                return null;
            }

            // 4. Extract the text & clean Markdown code blocks
            let aiResponse = candidate.content.parts[0].text || "";
            aiResponse = aiResponse
                .replace(/```json\s*/gi, "")
                .replace(/```\s*/gi, "")
                .trim();

            return aiResponse;

        } else {
            Logger.log("Gemini Error: Received an empty response.");
            sendTelegramMessage("🤖 Gemini Error: Phản hồi trống hoặc không hợp lệ.");
            return null;
        }

    } catch (error) {
        Logger.log("Error querying Gemini: " + error.toString());
        sendTelegramMessage("⚠️ Lỗi khi kết nối với Gemini: " + error.toString());
        return null;
    }
}

