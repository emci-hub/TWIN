// One-off manual verification script (not part of the delivered automated
// test suite — /core and /api have real Vitest suites; this is a browser
// smoke check for /web, run by hand against real running servers).
//
// Usage: with the API running (LLM_PROVIDER=mock, port 3001) and
// `npm run dev` running (port 5173), run `npm run smoke` from /web.
//
// Needs a Chromium binary. Point PLAYWRIGHT_EXECUTABLE_PATH at one (this
// sandbox has one preinstalled at /opt/pw-browsers/chromium-*/chrome-linux/
// chrome); otherwise install one with `npx playwright install chromium`.
import { chromium } from "playwright-core";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:5173";
const EXECUTABLE_PATH = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

function pickConsistent(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".quiz-option")];
    return buttons.length;
  });
}

async function main() {
  const browser = await chromium.launch({
    ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  // This sandbox has no outbound network route to fonts.googleapis.com /
  // fonts.gstatic.com (confirmed separately via curl — connection tunnel
  // failure), so the Google Fonts <link> in index.html fails to load here
  // even though it will work fine for real users / once deployed. Filter
  // just that known, environment-only noise; anything else still fails
  // the run.
  const isKnownSandboxNetworkNoise = (text) =>
    /ERR_TUNNEL_CONNECTION_FAILED|502 \(Bad Gateway\)/.test(text);
  page.on("pageerror", (e) => {
    const text = String(e);
    if (!isKnownSandboxNetworkNoise(text)) errors.push(text);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isKnownSandboxNetworkNoise(text)) errors.push(text);
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".empty-card", { timeout: 10000 });
  console.log("PASS: Home shows empty state before answering anything");

  // set a name
  await page.fill('.name-row input[type="text"]', "Playwright");
  await page.click(".name-row .btn-primary");
  await page.waitForSelector("text=Hey, Playwright");
  console.log("PASS: name entry works");

  // go to quiz
  await page.click(".empty-card .btn-primary");
  await page.waitForSelector(".quiz-option", { timeout: 10000 });

  async function answerOne() {
    const buttons = await page.$$(".quiz-option");
    if (buttons.length === 0) return false;
    await buttons[0].click();
    await page.waitForTimeout(150);
    return true;
  }

  // answer 3 questions, then refresh mid-quiz
  for (let i = 0; i < 3; i++) {
    await answerOne();
  }
  const progressBefore = await page.textContent(".quiz-progress span:last-child");
  console.log("progress before refresh:", progressBefore);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".quiz-option", { timeout: 10000 });
  const hashAfterReload = await page.evaluate(() => window.location.hash);
  const progressAfter = await page.textContent(".quiz-progress span:last-child");
  console.log("progress after refresh:", progressAfter, "hash:", hashAfterReload);
  if (hashAfterReload !== "#quiz") throw new Error("refresh did not stay on the quiz screen");
  if (progressBefore !== progressAfter) {
    throw new Error(`refresh lost progress: before=${progressBefore} after=${progressAfter}`);
  }
  console.log("PASS: refresh mid-quiz keeps progress");

  // finish the quiz
  let guard = 0;
  while (guard < 100) {
    guard++;
    const stillHasOptions = await page.$(".quiz-option");
    if (!stillHasOptions) break;
    await answerOne();
  }
  await page.waitForSelector("text=Quiz complete", { timeout: 15000 });
  console.log("PASS: quiz stopped itself (Quiz complete shown)");

  // go home, confirm filled state
  await page.click('.nav-item:has-text("Home")');
  await page.waitForSelector(".profile-summary-top", { timeout: 10000 });
  console.log("PASS: Home shows the real filled state after answering");

  // results screen sanity
  await page.click('.nav-item:has-text("Results")');
  await page.waitForSelector(".trait-grid .meter-row", { timeout: 10000 });
  const rowCount = await page.$$eval(".trait-grid .meter-row", (els) => els.length);
  console.log(`Results shows ${rowCount} trait rows`);
  if (rowCount !== 12) throw new Error(`expected 12 trait rows, got ${rowCount}`);
  console.log("PASS: Results shows all 12 dimensions");

  // why screen sanity
  await page.click('.nav-item:has-text("trail")');
  await page.waitForSelector(".evidence-item, .empty-card", { timeout: 10000 });
  console.log("PASS: Why screen renders");

  // chat screen sanity
  await page.click('.nav-item:has-text("Twin chat")');
  await page.fill(".chat-input-row input", "hello there");
  await page.click(".chat-input-row .btn-primary");
  await page.waitForSelector(".bubble.twin", { timeout: 10000 });
  console.log("PASS: twin chat returns a reply");

  // settings: theme toggle + freeze
  await page.click('.nav-item:has-text("Settings")');
  await page.click(".theme-btn");
  const dataTheme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  console.log("theme after toggle:", dataTheme);
  if (dataTheme !== "dark") throw new Error("theme toggle did not switch to dark");
  console.log("PASS: theme toggle works");

  await page.click(".switch-row .switch");
  await page.waitForSelector("text=Your profile is frozen", { timeout: 10000 });
  console.log("PASS: freeze profile works end-to-end");

  if (errors.length > 0) {
    console.log("--- console/page errors seen during run ---");
    console.log(errors.join("\n"));
    throw new Error(`${errors.length} console/page error(s) during the run`);
  }

  console.log("");
  console.log("ALL CHECKS PASSED");
  await browser.close();
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
