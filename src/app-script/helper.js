// Function to query sheet data using Gemini AI

// Function to query sheet data using Gemini AI

function buildPrompt(query) {
    return `
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
- "Số đồ 3 vòng.bust"
- "Số đồ 3 vòng.hip"
- "Địa chỉ"
- "Trạng thái"

---

🧮 **Quy tắc xử lý và Quy đổi Giá trị (Confluence Rules):**

1. **Toán tử & Logic:**
   - Nếu câu chứa "và" → dùng '"logic": "and"'.
   - Nếu câu chứa "hoặc" / "hay" → dùng '"logic": "or"'.
   - So sánh "lớn hơn", "bé hơn", "cao hơn", "nhiều hơn", "trên", "dưới" → dùng các toán tử '>', '<', '>=', '<='.
   - "bằng", "là", "giống như" → dùng '=='.
   - "khác", "không phải" → dùng '!='.
   - "chứa", "khu vực", "ở", "khu", "bao gồm", "có chữ" → dùng 'contains'.
   - "trong danh sách", "thuộc nhóm", "một trong" → dùng 'in'.
   - Khoảng giá trị ("từ A đến B") → nhóm '"logic": "and"' gồm 2 điều kiện '>=' A và '<=' B.

2. **Chuyển đổi Giá ("Giá"):**
   - Đơn vị chuẩn của field "Giá" là **nghìn VNĐ** ('k' unit).
   - "500k", "500.000", "500 nghìn" → 500
   - "1 triệu", "1tr" → 1000
   - "1.5 triệu", "1tr5" → 1500

3. **Chuyển đổi Chiều Cao & Cân Nặng ("Chiều Cao", "Cân Nặng"):**
   - Chiều Cao quy về số thuần **cm**: "1m65", "165cm" → 165.
   - Cân Nặng quy về số thuần **kg**: "50kg" → 50.

4. **Chuyển đổi Tuổi sang Năm Sinh ("Năm Sinh"):**
   - Năm hiện tại tham chiếu là **2026**.
   - "dưới 25 tuổi" (trẻ hơn 25 tuổi) → {"field": "Năm Sinh", "operator": ">=", "value": 2001} (2026 - 25 = 2001)
   - "trên 20 tuổi" (lớn hơn 20 tuổi) → {"field": "Năm Sinh", "operator": "<=", "value": 2006} (2026 - 20 = 2006)
   - "từ 20 đến 25 tuổi" → nhóm '"logic": "and"' gồm {"field": "Năm Sinh", "operator": ">=", "value": 2001} và {"field": "Năm Sinh", "operator": "<=", "value": 2006}.
   - "sinh năm 2000" → {"field": "Năm Sinh", "operator": "==", "value": 2000}.

5. **Phân rã Số đồ 3 vòng ("Số đồ 3 vòng" sub-fields):**
   - "vòng 1" → field "Số đồ 3 vòng.bust" (Ví dụ: "vòng 1 trên 90" → {"field": "Số đồ 3 vòng.bust", "operator": ">=", "value": 90})
   - "vòng 3" → field "Số đồ 3 vòng.hip" (Ví dụ: "vòng 3 trên 90" → {"field": "Số đồ 3 vòng.hip", "operator": ">=", "value": 90})

6. **Chuẩn hóa Địa danh ("Khu Vực", "Địa chỉ"):**
   - "HN" → "Hà Nội"
   - "SG" hoặc "HCM" → "Hồ Chí Minh"
   - "ĐN" → "Đà Nẵng"

---

📊 **Ví dụ:**

**Input:**
> Giá từ 500k đến 1.5 triệu và Khu Vực ở HN hoặc HCM

**Output:**
{
  "logic": "and",
  "filters": [
    {
      "logic": "and",
      "filters": [
        { "field": "Giá", "operator": ">=", "value": 500 },
        { "field": "Giá", "operator": "<=", "value": 1500 }
      ]
    },
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
> Chiều Cao 1m65, Cân Nặng 50kg, dưới 25 tuổi và vòng 1 trên 90

**Output:**
{
  "logic": "and",
  "filters": [
    { "field": "Chiều Cao", "operator": "==", "value": 165 },
    { "field": "Cân Nặng", "operator": "==", "value": 50 },
    { "field": "Năm Sinh", "operator": ">=", "value": 2001 },
    { "field": "Số đồ 3 vòng.bust", "operator": ">=", "value": 90 }
  ]
}

---

Bây giờ, hãy chuyển câu tiếng Việt sau thành JSON rule đúng theo format ở trên:

${query}
Phản hồi của bạn phải là một đối tượng JSON HỢP LỆ và KHÔNG được bao bọc trong bất kỳ ký hiệu markdown code block nào (ví dụ: KHÔNG dùng markdown json);
`;
}

function makeTheRule(query, returnPromptOnly = false) {
    const prompt = buildPrompt(query);
    if (returnPromptOnly) return prompt;
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        makeTheRule,
        buildPrompt,
        callGemini
    };
}


