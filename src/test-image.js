import { OPENAI_API_KEY } from "./config.js";

console.log("=== 이미지 인식 테스트 (gpt-4o-mini) ===\n");

const imageUrl = "https://picsum.photos/seed/237/800/600";

console.log("이미지 다운로드 중...");
const imgRes = await fetch(imageUrl, {
  headers: { "User-Agent": "Mozilla/5.0" },
});
if (!imgRes.ok) throw new Error(`이미지 다운로드 실패: ${imgRes.status}`);
const imgBuffer = await imgRes.arrayBuffer();
const base64Image = Buffer.from(imgBuffer).toString("base64");
console.log(`이미지 준비 완료 (${(imgBuffer.byteLength / 1024).toFixed(1)} KB)\n`);

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
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: "auto" },
          },
          {
            type: "text",
            text: "이 이미지를 자세히 설명해줘. 무엇이 보이는지, 어떤 특징이 있는지 한국어로 답해줘.",
          },
        ],
      },
    ],
    max_tokens: 1024,
  }),
});

if (!response.ok) {
  const error = await response.text();
  throw new Error(`HTTP ${response.status}: ${error}`);
}

const data = await response.json();
console.log("모델:", data.model);
console.log("원본 이미지:", imageUrl);
console.log("\n응답:\n", data.choices[0].message.content);
console.log("\n토큰:", data.usage?.total_tokens ?? "N/A");
