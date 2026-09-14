/**
 * Prompt builder and AI Query Engine integrations (Cloudflare Workers AI & Gemini)
 */

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

function makeTheRule(query, returnPromptOnly = false, traceId = null) {
    const prompt = buildPrompt(query);
    if (returnPromptOnly) return prompt;

    if (typeof logTrace === 'function') {
        logTrace(traceId, "AI_RULE_START", "Starting AI query to JSON rule translation", { query });
    }

    // 1. Prioritize Cloudflare Workers AI (Free tier & No Safety Block)
    if (getCloudflareAccountId() && getCloudflareApiToken()) {
        const cfResult = callCloudflareAI(query, traceId);
        if (cfResult) {
            if (typeof logTrace === 'function') {
                logTrace(traceId, "AI_RULE_SUCCESS", "Successfully generated rule using Cloudflare Workers AI", { rule: cfResult });
            }
            return cfResult;
        }
    }

    // 2. Fallback to Google Gemini if GEMINI_API_KEY is configured
    if (getGeminiApiKey()) {
        if (typeof logTrace === 'function') {
            logTrace(traceId, "AI_RULE_FALLBACK", "Falling back to Google Gemini API");
        }
        const geminiResult = callGemini(prompt, traceId);
        if (geminiResult) {
            if (typeof logTrace === 'function') {
                logTrace(traceId, "AI_RULE_SUCCESS", "Successfully generated rule using Google Gemini", { rule: geminiResult });
            }
            return geminiResult;
        }
    }

    if (typeof logTrace === 'function') {
        logTrace(traceId, "AI_RULE_FAILED", "Failed to generate rule from AI providers (Cloudflare / Gemini)");
    } else {
        Logger.log("❌ Failed to generate rule from AI (Neither Cloudflare nor Gemini returned valid response).");
    }
    return null;
}

function callCloudflareAI(query, traceId = null) {
    const accountId = getCloudflareAccountId() || CLOUDFLARE_ACCOUNT_ID;
    const apiToken = getCloudflareApiToken() || CLOUDFLARE_API_TOKEN;
    const model = getCloudflareModel() || CLOUDFLARE_MODEL || "@cf/qwen/qwen2.5-7b-instruct";

    if (!accountId || !apiToken) {
        if (typeof logTrace === 'function') {
            logTrace(traceId, "CF_AI_SKIP", "Cloudflare credentials not configured");
        }
        return null;
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
    const prompt = buildPrompt(query);

    const payload = {
        messages: [
            {
                role: "system",
                content: "Bạn là một AI chuyên phân tích ngôn ngữ tự nhiên tiếng Việt và chuyển đổi sang JSON rule lọc dữ liệu chính xác theo schema được yêu cầu. Phản hồi DUY NHẤT một đối tượng JSON hợp lệ, KHÔNG bao bọc trong markdown code block, KHÔNG kèm lời giải thích."
            },
            {
                role: "user",
                content: prompt
            }
        ],
        temperature: 0.1,
        max_tokens: 1024
    };

    const options = {
        method: "post",
        contentType: "application/json",
        headers: {
            "Authorization": `Bearer ${apiToken}`
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    const cfStart = Date.now();
    try {
        if (typeof logTrace === 'function') {
            logTrace(traceId, "CF_AI_REQUEST", "Sending request to Cloudflare Workers AI", { model, url });
        }
        const response = UrlFetchApp.fetch(url, options);
        const resText = response.getContentText();
        const duration = Date.now() - cfStart;
        const result = JSON.parse(resText);

        if (result.success && result.result) {
            let aiResponse = result.result.response || "";
            aiResponse = aiResponse
                .replace(/```json\s*/gi, "")
                .replace(/```\s*/gi, "")
                .trim();
            if (typeof logTrace === 'function') {
                logTrace(traceId, "CF_AI_RESPONSE", `Received response from Cloudflare in ${duration}ms`, { rawLength: aiResponse.length });
            }
            return aiResponse;
        } else {
            const errMsg = (result.errors && result.errors.length > 0) ? result.errors[0].message : "Unknown Cloudflare AI error";
            if (typeof logTrace === 'function') {
                logTrace(traceId, "CF_AI_ERROR", `Cloudflare AI returned error in ${duration}ms: ${errMsg}`, result.errors);
            }
            return null;
        }
    } catch (error) {
        const duration = Date.now() - cfStart;
        if (typeof logTrace === 'function') {
            logTrace(traceId, "CF_AI_EXCEPTION", `Exception calling Cloudflare AI in ${duration}ms: ${error.toString()}`);
        }
        return null;
    }
}

function callGemini(prompt, traceId = null) {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return null;

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

    const geminiStart = Date.now();
    try {
        if (typeof logTrace === 'function') {
            logTrace(traceId, "GEMINI_REQUEST", "Sending request to Google Gemini API", { model: modelName });
        }
        const response = UrlFetchApp.fetch(url, options);
        const duration = Date.now() - geminiStart;
        const result = JSON.parse(response.getContentText());

        if (result.error) {
            if (typeof logTrace === 'function') {
                logTrace(traceId, "GEMINI_ERROR", `Gemini API returned error in ${duration}ms: ${result.error.message}`, result.error);
            }
            return null;
        }

        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];

            if (candidate.finishReason === 'SAFETY') {
                if (typeof logTrace === 'function') {
                    logTrace(traceId, "GEMINI_SAFETY_BLOCK", `Gemini prompt blocked due to safety settings in ${duration}ms`);
                }
                return null;
            }

            let aiResponse = candidate.content.parts[0].text || "";
            aiResponse = aiResponse
                .replace(/```json\s*/gi, "")
                .replace(/```\s*/gi, "")
                .trim();

            if (typeof logTrace === 'function') {
                logTrace(traceId, "GEMINI_RESPONSE", `Received response from Gemini in ${duration}ms`, { rawLength: aiResponse.length });
            }
            return aiResponse;
        }
        return null;

    } catch (error) {
        const duration = Date.now() - geminiStart;
        if (typeof logTrace === 'function') {
            logTrace(traceId, "GEMINI_EXCEPTION", `Exception calling Gemini API in ${duration}ms: ${error.toString()}`);
        }
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        makeTheRule,
        buildPrompt,
        callCloudflareAI,
        callGemini
    };
}
