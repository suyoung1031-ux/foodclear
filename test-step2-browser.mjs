import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await browser.newPage();
page.setDefaultTimeout(60000);

console.log("=== Step 2 브라우저 테스트 ===\n");

// step1에서 전달되는 재료를 sessionStorage에 주입
await page.goto("http://localhost:3000/step2.html");
await page.evaluate(() => {
  sessionStorage.setItem("ingredients", JSON.stringify(["바나나", "고구마", "딸기", "배", "소금"]));
});
await page.reload();
console.log("✅ 1. step2 페이지 접속 + 재료 주입 (바나나, 고구마, 딸기, 배, 소금)");
await page.screenshot({ path: "screenshot-s2-01-options.png", fullPage: true });

// 옵션 설정
await page.selectOption("#cook-time", "30");
await page.selectOption("#servings", "2");
console.log("✅ 2. 옵션 설정: 조리 30분 이하, 2인분");

// 레시피 생성 클릭
await page.locator("#generate-btn").click();
console.log("✅ 3. 레시피 생성하기 클릭");

// 로딩 확인
await page.waitForSelector("#loading", { state: "visible" });
await page.screenshot({ path: "screenshot-s2-02-loading.png", fullPage: true });
console.log("✅ 4. 로딩 중...");

// 결과 대기
await page.waitForSelector("#result-section", { state: "visible", timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshot-s2-03-cards.png", fullPage: true });

// 카드 데이터 추출
const cards = await page.locator(".recipe-card").all();
console.log(`\n✅ 5. 레시피 ${cards.length}개 생성 완료!\n`);
for (const card of cards) {
  const name = await card.locator(".recipe-card-name").textContent();
  const desc = await card.locator(".recipe-card-desc").textContent();
  const badges = await card.locator(".meta-badge").allTextContents();
  console.log(`  📋 ${name.trim()}`);
  console.log(`     ${desc.trim()}`);
  console.log(`     ${badges.join(" | ")}\n`);
}

// 첫 번째 카드 상세 보기
await page.locator(".detail-btn").first().click();
await page.waitForSelector(".modal-backdrop.open");
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshot-s2-04-modal.png", fullPage: true });

const modalName = await page.locator("#m-name").textContent();
const steps = await page.locator(".steps-list li").count();
const ingredients = await page.locator(".ingredient-list li").count();
console.log(`✅ 6. 상세 모달 열기: "${modalName.trim()}"`);
console.log(`   재료 ${ingredients}개 · 조리 단계 ${steps}단계`);

// 레시피 저장
await page.locator("#m-save-btn").click();
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshot-s2-05-saved.png", fullPage: true });
console.log(`✅ 7. 레시피 저장 완료`);

// 토스트 메시지 확인
const toastText = await page.locator(".toast.show").textContent().catch(() => "");
if (toastText) console.log(`   토스트: "${toastText.trim()}"`);

// 모달 닫기 → 다른 레시피 보기
await page.locator("#modal-close").click();
await page.waitForTimeout(300);
await page.locator("#regen-btn").click();
console.log("\n✅ 8. '다른 레시피 보기' 클릭 (캐시 우회 재생성)");

await page.waitForSelector("#loading", { state: "visible" });
await page.waitForSelector("#result-section", { state: "visible", timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshot-s2-06-regen.png", fullPage: true });

const newCards = await page.locator(".recipe-card-name").allTextContents();
console.log(`✅ 9. 재생성 완료: ${newCards.map(n => n.trim()).join(", ")}`);

console.log("\n=== Step 2 테스트 완료 ===");
await page.waitForTimeout(2000);
await browser.close();
