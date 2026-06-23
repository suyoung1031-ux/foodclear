import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false, slowMo: 400 });
const page = await browser.newPage();
page.setDefaultTimeout(60000);

console.log("=== Step 3 브라우저 테스트 ===\n");

// ── 1. 프로필 설정 ──────────────────────────
await page.goto("http://localhost:3000/profile.html");
console.log("✅ 1. 프로필 페이지 접속");
await page.screenshot({ path: "screenshot-s3-01-profile.png", fullPage: true });

// 이름 입력
await page.fill("#name", "테스트유저");

// 식단 선호 - 채식 클릭
await page.locator("#dietary-group label[data-val='채식']").click();

// 알레르기 입력
await page.fill("#allergy-input", "새우");
await page.keyboard.press("Enter");
await page.fill("#allergy-input", "땅콩");
await page.keyboard.press("Enter");

// 기피 재료
await page.fill("#disliked-input", "고수");
await page.keyboard.press("Enter");

// 조리 시간 설정
await page.selectOption("#cook-time", "30");
await page.selectOption("#servings", "2");

await page.screenshot({ path: "screenshot-s3-02-profile-filled.png", fullPage: true });

// 저장
await page.locator("#save-btn").click();
await page.waitForTimeout(600);
const toastText1 = await page.locator("#toast").textContent();
console.log(`✅ 2. 프로필 저장 완료 (토스트: "${toastText1.trim()}")`);
await page.screenshot({ path: "screenshot-s3-03-profile-saved.png", fullPage: true });

// ── 2. Step2에서 레시피 생성 + 저장 ──────────
await page.goto("http://localhost:3000/step2.html");
await page.evaluate(() => {
  sessionStorage.setItem("ingredients", JSON.stringify(["달걀", "우유", "당근", "양파", "감자"]));
});
await page.reload();
await page.waitForTimeout(500);

// 프로필 배너 확인
const bannerVisible = await page.locator("#profile-banner").isVisible();
console.log(`✅ 3. Step2 프로필 배너 표시: ${bannerVisible}`);

// 프로필 기본값 적용 확인
const cookTimeVal = await page.inputValue("#cook-time");
const servingsVal = await page.inputValue("#servings");
console.log(`   조리시간: ${cookTimeVal}분 이하, 인분: ${servingsVal}인분 (프로필 자동 적용)`);

// 레시피 생성
await page.locator("#generate-btn").click();
await page.waitForSelector("#loading", { state: "visible" });
console.log("✅ 4. 레시피 생성 중...");
await page.waitForSelector("#result-section", { state: "visible", timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshot-s3-04-recipes.png", fullPage: true });

const cardNames = await page.locator(".recipe-card-name").allTextContents();
console.log(`✅ 5. 레시피 ${cardNames.length}개 생성: ${cardNames.map(n => n.trim()).join(", ")}`);

// 첫 번째 레시피 상세 보기
await page.locator(".detail-btn").first().click();
await page.waitForSelector(".modal-backdrop.open");
await page.waitForTimeout(300);

const modalName = await page.locator("#m-name").textContent();
console.log(`✅ 6. 상세 모달 열기: "${modalName.trim()}"`);

// 메모 입력
const memoVisible = await page.locator("#memo-section").isVisible();
console.log(`   메모 입력 필드 표시: ${memoVisible}`);
if (memoVisible) {
  await page.fill("#m-memo", "다음엔 소금 줄이기");
}

// 저장
await page.locator("#m-save-btn").click();
await page.waitForTimeout(800);
const toastText2 = await page.locator(".toast.show").textContent().catch(() => "");
console.log(`✅ 7. 레시피 저장 완료 (토스트: "${toastText2.trim()}")`);
await page.screenshot({ path: "screenshot-s3-05-saved.png", fullPage: true });

// 중복 저장 방지 확인
const saveBtnText = await page.locator("#m-save-btn").textContent();
const saveBtnDisabled = await page.locator("#m-save-btn").isDisabled();
console.log(`✅ 8. 중복 저장 방지: "${saveBtnText.trim()}", disabled=${saveBtnDisabled}`);

// 모달 닫기
await page.locator("#modal-close").click();
await page.waitForTimeout(300);

// ── 3. Step3 보관함 확인 ─────────────────────
await page.goto("http://localhost:3000/step3.html");
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshot-s3-06-bookmarks.png", fullPage: true });

const countBadge = await page.locator("#count-badge").textContent();
console.log(`\n✅ 9. 보관함 접속: ${countBadge.trim()}`);

const cards = await page.locator(".recipe-card").count();
console.log(`   카드 ${cards}개 표시`);

// 검색 테스트
await page.fill("#search-input", "달걀");
await page.waitForTimeout(300);
const filteredCards = await page.locator(".recipe-card").count();
console.log(`✅ 10. "달걀" 검색 결과: ${filteredCards}개 카드`);
await page.screenshot({ path: "screenshot-s3-07-search.png", fullPage: true });

// 검색 초기화
await page.fill("#search-input", "");
await page.waitForTimeout(200);

// 정렬 테스트
await page.selectOption("#sort-select", "name");
await page.waitForTimeout(200);
console.log("✅ 11. 이름순 정렬 적용");

// 카드 보기 테스트
await page.locator(".btn-view").first().click();
await page.waitForSelector("#modal-backdrop.open");
await page.waitForTimeout(300);
const modalName3 = await page.locator("#m-name").textContent();
console.log(`✅ 12. 보관함 상세 모달: "${modalName3.trim()}"`);

// 메모 표시 확인
const memoWrapVisible = await page.locator("#m-memo-wrap").isVisible();
console.log(`   메모 표시: ${memoWrapVisible}`);
if (memoWrapVisible) {
  const memoContent = await page.locator("#m-memo").textContent();
  console.log(`   메모 내용: "${memoContent.trim()}"`);
}
await page.screenshot({ path: "screenshot-s3-08-bookmark-modal.png", fullPage: true });
await page.locator("#modal-close").click();
await page.waitForTimeout(300);

// 삭제 테스트 — dialog 핸들러를 click 전에 등록
const cardsBefore = await page.locator(".recipe-card").count();
page.once("dialog", async dialog => {
  console.log(`   다이얼로그: "${dialog.message().slice(0, 40)}..."`);
  await dialog.accept();
});
await page.locator(".btn-del").first().click();
await page.waitForTimeout(800);
const cardsAfter = await page.locator(".recipe-card").count();
console.log(`✅ 13. 레시피 삭제: ${cardsBefore}개 → ${cardsAfter}개`);
await page.screenshot({ path: "screenshot-s3-09-deleted.png", fullPage: true });

console.log("\n=== Step 3 테스트 완료 ===");
console.log("스크린샷: screenshot-s3-01~09.png");

await page.waitForTimeout(2000);
await browser.close();
