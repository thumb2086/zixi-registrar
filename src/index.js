import express from 'express';
import { chromium } from 'playwright';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;
const ROUNDER = process.env.ROUNDER_URL || 'https://zixi-dev-tool.vercel.app';

// ── 全域錯誤處理 ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
});

// ── 健康檢查 ──
app.get('/', (req, res) => {
  res.json({ success: true, name: 'registrar-backend', version: '2.0.0' });
});

// ── 選項式註冊（試瀏覽器 → 失敗就給步驟引導） ──

async function tryBrowserSignup(email, url, fillForm) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'],
    });
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1280, height: 720 },
      locale: 'zh-TW',
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
    await fillForm(page);
    await browser.close();
    return { success: true };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

// ── Groq ──

app.post('/api/groq/register', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log(`\n🚀 Groq: ${email}`);

  // 試瀏覽器自動化
  const result = await tryBrowserSignup(email, 'https://console.groq.com/signup', async (page) => {
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 8000 });
      await page.fill('input[type="email"]', email);
      await page.click('button[type="submit"]');
    } catch {
      // iframe 模式
      for (const f of page.frames()) {
        if (f.url().includes('stytch')) {
          await f.fill('input[type="email"]', email);
          await f.click('button[type="submit"]');
          break;
        }
      }
    }
  });

  if (result.success) {
    return res.json({
      success: true, method: 'browser',
      message: '✅ Groq 註冊表單已自動送出，到註冊機收驗證信',
    });
  }

  // 瀏覽器失敗 => 給手動步驟
  console.log(`⚠️ 瀏覽器模式失敗: ${result.error}, 改用手動引導`);
  res.json({
    success: true, method: 'manual',
    message: '由於 Render 環境限制，請手動完成註冊：',
    steps: [
      `1. 打開 https://console.groq.com/signup`,
      `2. 輸入 Email: ${email}`,
      `3. 到註冊機（https://zixi-dev-tool.vercel.app/registrar.html）收驗證信`,
      `4. 點驗證連結`,
      `5. 登入後去 https://console.groq.com/keys 拿 API Key`,
      `6. 把 Key 貼回註冊機儲存`,
    ],
  });
});

// ── Render ──

app.post('/api/render/register', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const result = await tryBrowserSignup(email, 'https://dashboard.render.com/register', async (page) => {
    await page.fill('input[type="email"]', email);
    const pw = 'Rdr_' + Math.random().toString(36).slice(2, 10) + '_A!';
    const passInputs = await page.$$('input[type="password"]');
    if (passInputs.length >= 2) { await passInputs[0].fill(pw); await passInputs[1].fill(pw); }
    for (const cb of await page.$$('input[type="checkbox"]')) { if (!await cb.isChecked()) await cb.check(); }
    await page.click('button[type="submit"]');
  });

  if (result.success) {
    return res.json({ success: true, method: 'browser', message: '✅ Render 註冊表單已送出' });
  }

  res.json({
    success: true, method: 'manual',
    message: '請手動完成 Render 註冊：',
    steps: [
      `1. 打開 https://dashboard.render.com/register`,
      `2. 用 ${email} 註冊`,
      `3. 到註冊機收驗證信`,
      `4. 部署服務後把 URL 貼到 Rounder 管理後台`,
    ],
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Registrar Backend v2 on port ${PORT}`);
});
