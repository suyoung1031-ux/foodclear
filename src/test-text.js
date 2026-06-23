import { OPENAI_API_KEY } from "./config.js";

console.log("=== 텍스트 인식 테스트 (gpt-4o-mini) ===\n");

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: "다음 문장에서 감정을 분석하고 핵심 키워드 3개를 추출해줘: '오늘 날씨가 너무 맑아서 기분이 최고야! 친구들과 공원에서 즐거운 시간을 보냈어.'",
      },
    ],
  }),
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(`HTTP ${response.status}: ${error}`);
}

const data = await response.json();
console.log("모델:", data.model);
console.log("응답:\n", data.choices[0].message.content);
console.log("\n토큰:", data.usage?.total_tokens ?? "N/A");
