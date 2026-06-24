import { OPENAI_API_KEY } from "../config.js";

const MODEL = "gpt-4o-mini";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10분
const MAX_CACHE_SIZE = 200; // 최대 캐시 항목 수

// 간단한 메모리 캐시
const cache = new Map(); // key → { data, expiresAt }

// 5분마다 만료된 엔트리 정리 (메모리 누수 방지)
// .unref() — 이 타이머만 남아 있어도 Node.js 프로세스가 종료될 수 있게 허용
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 5 * 60 * 1000).unref();

function cacheKey(ingredients, options) {
  return JSON.stringify({ ingredients: [...ingredients].sort(), options });
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // 최대 크기 초과 시 Map 삽입 순서 기준으로 가장 오래된 키 제거
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const SYSTEM_PROMPT = [
  "당신은 전문 요리사이자 레시피 생성 AI입니다.",
  "규칙:",
  "1. 반드시 유효한 JSON만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요.",
  "2. 모든 JSON 문자열 값은 반드시 큰따옴표로 감싸야 합니다.",
  "3. 한국어 텍스트도 반드시 큰따옴표 안에 작성하세요.",
  "4. JSON 외 어떤 텍스트도 출력하지 마세요.",
  "5. 모든 텍스트는 한국어로 작성하세요.",
].join("\n");

function buildPrompt(ingredients, options) {
  const dietary = options.dietary?.length
    ? options.dietary.join(", ")
    : "없음";
  const cookTime =
    options.max_cook_time === 999 ? "제한 없음" : `${options.max_cook_time}분 이하`;
  const allergyLine = options.allergies?.length
    ? `\n알레르기 금지 재료: ${options.allergies.join(", ")} (절대 포함 금지)`
    : "";
  const dislikedLine = options.disliked?.length
    ? `\n기피 재료: ${options.disliked.join(", ")} (가능하면 제외)`
    : "";

  return `사용 가능한 재료: ${ingredients.join(", ")}
조리 시간: ${cookTime}
인분 수: ${options.servings}인분
식단 제한: ${dietary}${allergyLine}${dislikedLine}

위 조건에 맞는 레시피 3가지를 아래 JSON 형식으로 생성해줘.
각 레시피는 주어진 재료를 최대한 활용하고, 없는 재료는 최소화해야 해.

{
  "recipes": [
    {
      "id": "recipe_001",
      "name": "레시피명",
      "description": "한 줄 소개",
      "cook_time_minutes": 20,
      "servings": 2,
      "difficulty": "쉬움",
      "ingredients": [
        { "name": "재료명", "amount": "수량", "available": true }
      ],
      "steps": [
        { "step": 1, "description": "조리 단계 설명" }
      ],
      "tips": "요리 팁 (없으면 빈 문자열)",
      "nutrition": {
        "calories": 300,
        "protein": "15g",
        "carbs": "20g",
        "fat": "10g"
      }
    }
  ]
}

"available" 필드: 사용자가 제공한 재료 목록에 있으면 true, 없으면 false.`;
}

function repairJson(str) {
  // "key": unquotedText..." → "key": "unquotedText..."
  // 모델이 문자열 값의 시작 따옴표를 누락하는 패턴 보정
  return str.replace(
    /("(?:description|name|amount|tips|difficulty|id)")\s*:\s*([^"\d\s\[\{][^"]*?")/g,
    (_, key, val) => `${key}: "${val}`
  );
}

function parseRecipes(content) {
  // 코드블록 제거
  let jsonStr = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  // { ... } 블록만 추출
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) jsonStr = match[0];

  // 1차 시도: 그대로 파싱
  try { return JSON.parse(jsonStr); } catch { /* fall through */ }

  // 2차 시도: 따옴표 누락 보정 후 파싱
  try { return JSON.parse(repairJson(jsonStr)); } catch { /* fall through */ }

  throw new Error("JSON 파싱 실패");
}

export async function generateRecipes(req, res) {
  try {
    const { ingredients, options = {}, nonce } = req.body;
    if (!ingredients?.length) {
      return res.status(400).json({ success: false, error: "재료 목록이 없습니다." });
    }

    const opts = {
      max_cook_time: options.max_cook_time ?? 30,
      servings: options.servings ?? 2,
      dietary: options.dietary ?? [],
      allergies: options.allergies ?? [],
      disliked: options.disliked ?? [],
    };

    // nonce가 있으면 캐시 우회 (재생성 요청); 없으면 일반 캐시 확인
    const baseKey = cacheKey(ingredients, opts);
    const key = nonce ? `${baseKey}:${nonce}` : baseKey;
    if (!nonce) {
      const cached = getCached(key);
      if (cached) {
        return res.json({ success: true, cached: true, ...cached });
      }
    }

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(ingredients, opts) },
        ],
        max_tokens: 2048,
      }),
    });

    if (apiRes.status === 429) {
      const retryAfter = parseInt(apiRes.headers.get("retry-after") || "60", 10);
      console.log(`[recipes] 429 rate limit, retry-after: ${retryAfter}s`);
      throw Object.assign(new Error("rate_limit"), { retryAfter });
    }

    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`OpenAI HTTP ${apiRes.status}: ${text}`);
    }

    const data = await apiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI가 응답을 반환하지 않았습니다. 잠시 후 다시 시도해주세요.");

    let parsed;
    try {
      parsed = parseRecipes(content);
    } catch {
      // 파싱 실패 시 원문을 단일 레시피로 래핑
      parsed = {
        recipes: [
          {
            id: "recipe_raw",
            name: "AI 레시피",
            description: content.slice(0, 100),
            cook_time_minutes: opts.max_cook_time,
            servings: opts.servings,
            difficulty: "보통",
            ingredients: ingredients.map((n) => ({ name: n, amount: "적당량", available: true })),
            steps: [{ step: 1, description: content }],
            tips: "",
            nutrition: { calories: 0, protein: "0g", carbs: "0g", fat: "0g" },
          },
        ],
      };
    }

    // available 필드를 서버에서 직접 체크 (모델이 잘못 반환하는 경우 보정)
    const ingSet = new Set(ingredients.map((i) => i.trim()));
    parsed.recipes = parsed.recipes.map((r) => ({
      ...r,
      ingredients: r.ingredients.map((ing) => ({
        ...ing,
        available: ingSet.has(ing.name.trim()),
      })),
    }));

    setCache(key, parsed);
    res.json({ success: true, cached: false, ...parsed });
  } catch (err) {
    console.error("[recipes] 오류:", err.message);

    if (err.message === "rate_limit") {
      return res.status(429).json({
        success: false,
        error: "AI 서비스 사용량 한도에 도달했습니다.",
        retry_after: err.retryAfter || 60,
      });
    }

    res.status(500).json({ success: false, error: "죄송합니다. 레시피 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
  }
}
