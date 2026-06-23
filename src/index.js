import express from 'express';
import { registerGroq, registerRender, autoVerify } from './automate.js';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3001;

// ── 健康檢查 ──
app.get('/', (req, res) => {
  res.json({ success: true, name: 'registrar-backend', version: '2.0.0' });
});

// ── Groq 自動註冊 ──
app.post('/api/groq/register', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log(`\n🚀 Groq 註冊開始: ${email}`);

  // 1. 用瀏覽器填表單
  const regResult = await registerGroq(email);
  if (!regResult.success) {
    return res.json(regResult);
  }

  // 2. 等驗證信 + 自動點驗證連結 (非阻塞)
  autoVerify(email).then(result => {
    console.log('📬 驗證結果:', result);
  });

  res.json(regResult);
});

// ── Render 自動註冊 ──
app.post('/api/render/register', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  console.log(`\n🚀 Render 註冊開始: ${email}`);

  const regResult = await registerRender(email);
  if (!regResult.success) {
    return res.json(regResult);
  }

  // 自動等驗證信
  autoVerify(email).then(result => {
    console.log('📬 Render 驗證結果:', result);
  });

  res.json(regResult);
});

// ── 查詢驗證狀態 ──
app.get('/api/verify/:email', async (req, res) => {
  const result = await autoVerify(req.params.email, 5000);
  res.json(result);
});

// ── 啟動 ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Registrar Backend v2`);
  console.log(`   Port: ${PORT}`);
  console.log(`   POST /api/groq/register   — 自動註冊 Groq`);
  console.log(`   POST /api/render/register — 自動註冊 Render`);
  console.log(`\n`);
});
