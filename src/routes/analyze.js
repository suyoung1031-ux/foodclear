import { OPENAI_API_KEY } from "../config.js";

const MODEL = "gpt-4o-mini";

const PROMPT_TEXT = `이 냉장고 사진을 분석해서 보이는 모든 식재료를 추출해줘.

아래 JSON 형식으로만 응답해. 마크다운, 설명, 코드블록 없이 순수 JSON만 출력해:
{
  "ingredients": [
    { "name": "재료명(한국어)", "quantity": "예상 수량(예: 3개, 1팩, 약간)", "confidence": 0.95 }
  ],
  "raw_description": "냉장고 안 전체에 대한 한국어 한 줄 설명"
}

주의:
- 보이는 식재료를 빠짐없이 추출할 것
- 이름은 반드시 한국어로 작성
- confidence는 0.0~1.0 사이 숫자
- JSON 이외의 어떤 텍스트도 출력하지 말 것`;

async function callOpenAI(base64Image, mimeType) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "auto" },
            },
            { type: "text", text: PROMPT_TEXT },
          ],
        },
      ],
      max_tokens: 1024,
    }),
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "60", 10);
    console.log(`[analyze] 429 rate limit, retry-after: ${retryAfter}s`);
    throw Object.assign(new Error("rate_limit"), { retryAfter });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

function repairJson(str) {
  // "key": 누락된 따옴표 텍스트" → "key": "텍스트"
  return str.replace(
    /("(?:name|quantity|raw_description)")\s*:\s*([^"\d\s\[\{][^"]*?")/g,
    (_, key, val) => `${key}: "${val}`
  );
}

function parseIngredients(content) {
  let s = content
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const match = s.match(/\{[\s\S]*\}/);
  if (match) s = match[0];

  // 1차: 그대로 파싱
  try { return JSON.parse(s); } catch { /* fall through */ }

  // 2차: 따옴표 누락 보정 후 파싱
  try { return JSON.parse(repairJson(s)); } catch { /* fall through */ }

  throw new Error("JSON 파싱 실패: " + s.slice(0, 120));
}

export async function analyzeImage(req, res) {
  try {
    const { image, mimeType = "image/jpeg" } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: "이미지 데이터가 없습니다." });
    }

    const base64 = image.startsWith("data:") ? image.split(",")[1] : image;

    const data = await callOpenAI(base64, mimeType);
    const content = data.choices[0].message.content;
    console.log("[analyze] 모델 원본 응답:", content.slice(0, 300));

    let parsed;
    try {
      parsed = parseIngredients(content);
    } catch (parseErr) {
      console.warn("[analyze] JSON 파싱 실패, 텍스트 줄 추출로 폴백:", parseErr.message);
      // 마지막 폴백: "-" 또는 숫자로 시작하는 줄을 재료로 취급
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.match(/^[-*•·]\s+\S/) || l.match(/^\d+[.)]\s+\S/));
      parsed = {
        ingredients: lines.map((l) => ({
          name: l.replace(/^[-*•·\d.)]\s*/, "").split(/[(:,]/)[0].trim(),
          quantity: "",
          confidence: 0.5,
        })).filter((i) => i.name.length > 0),
        raw_description: content,
      };
    }

    // ingredients 배열이 없거나 비어있으면 오류로 처리
    if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      return res.status(422).json({
        success: false,
        error: "재료를 인식하지 못했습니다. 냉장고 내부가 잘 보이는 사진으로 다시 시도해주세요.",
        raw: content,
      });
    }

    res.json({ success: true, ...parsed });
  } catch (err) {
    console.error("[analyze] 오류:", err.message);

    if (err.message === "rate_limit") {
      return res.status(429).json({
        success: false,
        error: "AI 서비스 사용량 한도에 도달했습니다.",
        retry_after: err.retryAfter || 60,
      });
    }

    res.status(500).json({ success: false, error: err.message });
  }
}
