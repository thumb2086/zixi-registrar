import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ROUNDER = process.env.ROUNDER_URL || 'https://zixi-dev-tool.vercel.app';

let _browser = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
  });
  return _browser;
}

function stealthyPage(page) {
  // 隱藏自動化特徵
  page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['zh-TW', 'zh', 'en'] });
    // 覆蓋 Chrome 自動化檢測
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : originalQuery(parameters)
    );
  });
  return page;
}

async function newPage() {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
  });
  const page = await ctx.newPage();
  return stealthyPage(page);
}

// ── Groq 自動註冊 ──

export async function registerGroq(email) {
  console.log(`🤖 Groq 自動註冊: ${email}`);
  const page = await newPage();

  try {
    // 1. 去 Groq signup
    await page.goto('https://console.groq.com/signup', { waitUntil: 'networkidle', timeout: 30000 });

    // 試兩種 UI 版本: 直接填 email 或 stytch iframe
    try {
      // 等 email input 出現
      await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email"]', { timeout: 8000 });
      await page.fill('input[type="email"], input[name="email"], input[placeholder*="email"]', email);
      await page.click('button[type="submit"], button:has-text("Continue"), button:has-text("Send"), button:has-text("Log in")');
    } catch {
      // Fallback: 有些頁面用 Stytch embedded
      console.log('⚠️ Stytch iframe 模式, 手動填 email');
      // 找 iframe
      const frames = page.frames();
      for (const f of frames) {
        if (f.url().includes('stytch')) {
          await f.fill('input[type="email"]', email);
          await f.click('button[type="submit"]');
          break;
        }
      }
    }

    console.log('✅ Groq 註冊表單已送出');
    await page.close();
    return { success: true, message: 'Groq 註冊表單已送出, 請到註冊機收驗證信' };

  } catch (err) {
    console.error('❌ Groq 註冊失敗:', err.message);
    await page.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

// ── Render 自動註冊 ──

export async function registerRender(email) {
  console.log(`🤖 Render 自動註冊: ${email}`);
  const page = await newPage();

  try {
    await page.goto('https://dashboard.render.com/register', { waitUntil: 'networkidle', timeout: 30000 });

    // Render 的註冊表單
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
    await page.fill('input[type="email"], input[name="email"]', email);

    // 密碼 (自動生成)
    const password = 'Rdr_' + Math.random().toString(36).slice(2, 10) + '_Auto!';
    const passInputs = await page.$$('input[type="password"]');
    if (passInputs.length >= 2) {
      await passInputs[0].fill(password);
      await passInputs[1].fill(password);
    }

    // 勾選同意條款 (如果有)
    const checkboxes = await page.$$('input[type="checkbox"]');
    for (const cb of checkboxes) {
      const checked = await cb.isChecked();
      if (!checked) await cb.check();
    }

    // 提交
    await page.click('button[type="submit"], button:has-text("Create Account"), button:has-text("Sign Up")');

    console.log('✅ Render 註冊表單已送出');
    await page.close();
    return { success: true, message: `Render 註冊表單已送出, 密碼: ${password}\n請到註冊機收驗證信` };

  } catch (err) {
    console.error('❌ Render 註冊失敗:', err.message);
    await page.close().catch(() => {});
    return { success: false, error: err.message };
  }
}

// ── 用郵箱檢查是否有驗證信 + 自動點擊驗證連結 ──

export async function autoVerify(email, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const r = await fetch(`${ROUNDER}/api/mail/inbox?email=${encodeURIComponent(email)}`);
      const data = await r.json();
      const msgs = data?.messages || [];
      for (const msg of msgs) {
        const body = msg.html || msg.text || '';
        const links = body.match(/https?:\/\/[^\s<>"']+/g) || [];
        for (const link of links) {
          if (link.includes('stytch') || link.includes('magic_link') || link.includes('verify') || link.includes('confirm')) {
            console.log(`🔗 找到驗證連結: ${link.slice(0, 80)}...`);
            // 用瀏覽器點擊驗證連結
            const page = await newPage();
            try {
              await page.goto(link, { waitUntil: 'networkidle', timeout: 20000 });
              console.log('✅ 驗證連結已點擊');
              await page.close();
              return { success: true, message: '驗證完成' };
            } catch {
              await page.close().catch(() => {});
              return { success: true, message: '找到驗證連結，請手動點擊', link };
            }
          }
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }
  return { success: false, message: '等待超時' };
}
