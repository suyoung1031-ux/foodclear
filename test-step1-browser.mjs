import { chromium } from "playwright";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ headless: false, slowMo: 500 });
const page = await browser.newPage();
page.setDefaultTimeout(30000);

console.log("=== Step 1 브라우저 테스트 ===\n");

// 1. 메인 페이지 접속
await page.goto("http://localhost:3000");
console.log("✅ 1. 메인 페이지 접속");
await page.screenshot({ path: "screenshot-01-main.png", fullPage: true });

// 2. 이미지 업로드
const imagePath = resolve(__dirname, "test-fridge.jpg");
const fileInput = page.locator("#file-input");
await fileInput.setInputFiles(imagePath);
console.log("✅ 2. 이미지 업로드");
await page.waitForTimeout(1000);
await page.screenshot({ path: "screenshot-02-preview.png", fullPage: true });

// 3. 분석 버튼 클릭
await page.locator("#analyze-btn").click();
console.log("✅ 3. 재료 인식 시작 클릭");

// 4. 로딩 확인
await page.waitForSelector("#loading", { state: "visible" });
console.log("✅ 4. 로딩 스피너 표시 중...");
await page.screenshot({ path: "screenshot-03-loading.png", fullPage: true });

// 5. 결과 대기 (최대 30초)
await page.waitForSelector("#result-section", { state: "visible", timeout: 30000 });
console.log("✅ 5. 재료 인식 완료!");
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshot-04-result.png", fullPage: true });

// 6. 결과 데이터 추출
const tags = await page.locator(".tag").allTextContents();
const rawDesc = await page.locator("#raw-desc").textContent();
console.log(`\n인식된 재료 (${tags.length}개):`);
tags.forEach((t, i) => console.log(`  ${i+1}. ${t.replace("✕","").trim()}`));
console.log("\n냉장고 설명:", rawDesc?.trim());

// 7. 재료 추가 테스트
await page.locator("#add-input").fill("소금");
await page.locator("#add-btn").click();
await page.waitForTimeout(300);
console.log("\n✅ 6. 재료 '소금' 직접 추가");
await page.screenshot({ path: "screenshot-05-added.png", fullPage: true });

// 8. 레시피 추천받기 버튼 확인
const nextVisible = await page.locator("#next-btn").isVisible();
console.log(`✅ 7. '레시피 추천받기' 버튼 표시: ${nextVisible}`);

console.log("\n=== 테스트 완료 ===");
console.log("스크린샷: screenshot-01~05.png");

await page.waitForTimeout(2000);
await browser.close();
