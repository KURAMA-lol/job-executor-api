# Job Executor API

Universal async job executor for Telegram bots running on **telebothost.com**

Solves the 15-second execution limit by offloading long-running tasks to a background worker.

---

## How It Works

```
Your Bot (telebothost - 15s limit)
    ↓
POST /run {task, input, callback}
    ↓
API responds immediately ✅
    ↓
Bot exits (15s limit satisfied)
    ↓
Backend processes task (no time limit)
    ↓
Backend calls callback URL with result
    ↓
Bot receives result and sends to user
```

---

## API Endpoint

```
POST https://your-api.onrender.com/run
```

**Request:**
```json
{
  "task": "ai_chat",
  "input": "hello world",
  "callback": "https://your-bot-webhook-url"
}
```

**Response (immediate):**
```json
{
  "jobId": "uuid-here",
  "status": "queued",
  "message": "Job submitted. Result will be sent to callback URL"
}
```

---

## Supported Tasks

| Task | Input | Example |
|------|-------|---------|
| `ai_chat` | `string` | `{ "input": "hello" }` |
| `scrape` | `{ url, selector }` | `{ "url": "https://...", "selector": ".data" }` |
| `code_execute` | `{ code, language }` | `{ "code": "console.log(2+2)", "language": "javascript" }` |
| `http_request` | `{ url, method, body }` | `{ "url": "https://...", "method": "POST", "body": {} }` |
| `delay` | `{ duration }` | `{ "duration": 5000 }` |

---

## Bot Integration (telebothost)

Copy this code into your telebothost bot:

```javascript
const API_URL = 'https://your-api.onrender.com/run';
const BOT_WEBHOOK = 'https://your-telebothost-webhook-url';

bot.on('message', async (msg) => {
  // For long-running tasks:
  
  // 1. Send to job executor
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'ai_chat',
        input: msg.text,
        callback: BOT_WEBHOOK
      })
    });
    
    const { jobId } = await response.json();
    
    // 2. Acknowledge user immediately
    await bot.sendMessage(msg.chat.id, `⏳ Processing request ${jobId}...`);
    
  } catch (error) {
    await bot.sendMessage(msg.chat.id, `Error: ${error.message}`);
  }
});

// 3. Handle callback from backend
app.post('/webhook', (req, res) => {
  const { jobId, status, result, error } = req.body;
  
  if (status === 'completed') {
    bot.sendMessage(CHAT_ID, `✅ Result:\n${result}`);
  } else if (status === 'failed') {
    bot.sendMessage(CHAT_ID, `❌ Error: ${error}`);
  }
  
  res.sendStatus(200);
});
```

---

## Different Task Examples

**AI Chat:**
```javascript
fetch(API_URL, {
  method: 'POST',
  body: JSON.stringify({
    task: 'ai_chat',
    input: userMessage,
    callback: BOT_WEBHOOK
  })
});
```

**Web Scraping:**
```javascript
fetch(API_URL, {
  method: 'POST',
  body: JSON.stringify({
    task: 'scrape',
    input: {
      url: 'https://example.com',
      selector: '.product-title'
    },
    callback: BOT_WEBHOOK
  })
});
```

**Code Execution:**
```javascript
fetch(API_URL, {
  method: 'POST',
  body: JSON.stringify({
    task: 'code_execute',
    input: {
      code: 'console.log(2 + 2)',
      language: 'javascript'
    },
    callback: BOT_WEBHOOK
  })
});
```

**HTTP Request:**
```javascript
fetch(API_URL, {
  method: 'POST',
  body: JSON.stringify({
    task: 'http_request',
    input: {
      url: 'https://api.example.com/data',
      method: 'POST',
      body: { key: 'value' }
    },
    callback: BOT_WEBHOOK
  })
});
```

---

## Deployment

### 1. Push to GitHub
```bash
git add .
git commit -m "Job executor API"
git push origin main
```

### 2. Deploy to Render
- Go to https://dashboard.render.com/new/web
- Connect GitHub
- Select this repo
- Render auto-detects `render.yaml`
- Deploy

### 3. Get Your API URL
```
https://job-executor-XXXX.onrender.com
```

---

## Check Status

```bash
curl https://your-api.onrender.com/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-10-12T08:00:00.000Z"
}
```

---

## How It Solves 15s Limit

1. **Bot calls /run** (takes ~100ms)
2. **API returns jobId** (within 15s) ✅
3. **Bot exits** (telebothost happy)
4. **Backend processes** (5 minutes? 1 hour? doesn't matter)
5. **Backend calls bot's webhook** with result
6. **Bot sends result to user**

No timeout. No limits. Works forever.

---

## Notes

- Free Render tier sleeps after 15min inactivity (first request = 2-3s delay)
- Redis included in Render deployment
- Jobs auto-retry on failure
- Max 3 retry attempts with exponential backoff

---

## Your Agent's Checklist

1. ✅ Copy bot code snippet
2. ✅ Replace `API_URL` with your Render URL
3. ✅ Replace `BOT_WEBHOOK` with telebothost webhook
4. ✅ Paste into bot code
5. ✅ For long tasks: use `task: 'ai_chat'` or other task type
6. ✅ Done

That's it.
