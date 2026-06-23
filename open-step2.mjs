import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
  args: ["--start-maximized"],
});

const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

// step2로 이동 후 step1 재료 주입
await page.goto("http://localhost:3000/step2.html");
await page.evaluate(() => {
  sessionStorage.setItem(
    "ingredients",
    JSON.stringify(["달걀", "우유", "당근", "양파", "감자", "버터"])
  );
});
await page.reload();

console.log("브라우저가 열렸습니다.");
console.log("주입된 재료: 달걀, 우유, 당근, 양파, 감자, 버터");
console.log("브라우저를 직접 사용해서 테스트하세요.");
console.log("(이 창을 닫으면 브라우저도 종료됩니다)");

// 브라우저를 닫지 않고 대기
await new Promise(() => {});
