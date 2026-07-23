const { chromium } = require('playwright');
const path = require('path');

const screenshotsDir = path.join(__dirname, 'screenshots');
const htmlPath = path.join(__dirname, 'index.html');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  console.log('📸 开始截图...\n');

  try {
    // 1. 首页
    console.log('1/6 - 截取首页...');
    await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded' });
    await wait(2000);
    await page.screenshot({ path: path.join(screenshotsDir, 'home.png'), fullPage: true });
    console.log('✓ 首页\n');

    // 2. 每日一练
    console.log('2/6 - 截取每日一练...');
    await page.click('[data-start="daily"]');
    await wait(1500);
    await page.screenshot({ path: path.join(screenshotsDir, 'daily-practice.png') });
    console.log('✓ 每日一练\n');

    // 3. 返回首页，模拟考试
    console.log('3/6 - 截取模拟考试配置...');
    await page.evaluate(() => window.location.reload());
    await wait(2000);
    await page.click('#goExam');
    await wait(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'exam-config.png') });
    console.log('✓ 模拟考试配置\n');

    // 4. 判断题
    console.log('4/6 - 截取判断题界面...');
    await page.evaluate(() => window.location.reload());
    await wait(2000);
    await page.click('[data-start="judge"]');
    await wait(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'quiz-judge.png') });
    console.log('✓ 判断题\n');

    // 5. 单选题
    console.log('5/6 - 截取单选题界面...');
    await page.evaluate(() => window.location.reload());
    await wait(2000);
    await page.click('[data-start="single"]');
    await wait(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'quiz-single.png') });
    console.log('✓ 单选题\n');

    // 6. 错题本
    console.log('6/6 - 截取错题本...');
    await page.evaluate(() => window.location.reload());
    await wait(2000);
    await page.click('#goWrongBook');
    await wait(1000);
    await page.screenshot({ path: path.join(screenshotsDir, 'wrong-book.png') });
    console.log('✓ 错题本\n');

  } catch (error) {
    console.error('❌ 出错:', error.message);
  } finally {
    await browser.close();
    console.log('✅ 截图完成！已保存到 screenshots/ 目录');
  }
}

captureScreenshots().catch(console.error);
