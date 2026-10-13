const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Queue = require('bull');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Redis connection (Render provides REDIS_URL in env)
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Job queue
const jobQueue = new Queue('tasks', redisUrl);

// Store job status in memory (for simple version)
const jobStatus = new Map();

// ===== ENDPOINTS =====

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'job-executor-api',
    status: 'running',
    endpoints: {
      health: '/health',
      run: 'POST /run',
      status: 'GET /status/:jobId'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main endpoint - receive job and queue it
app.post('/run', async (req, res) => {
  try {
    const { task, input, callback } = req.body;

    if (!task || !callback) {
      return res.status(400).json({
        error: 'Missing required fields: task, callback'
      });
    }

    // Create unique job ID
    const jobId = uuidv4();

    // Store job metadata
    jobStatus.set(jobId, {
      id: jobId,
      task,
      status: 'queued',
      createdAt: new Date(),
      callback
    });

    // Add to queue (process in background)
    await jobQueue.add(
      { jobId, task, input, callback },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );

    // Return immediately (bot doesn't wait)
    res.json({
      jobId,
      status: 'queued',
      message: 'Job submitted. Result will be sent to callback URL'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check job status (optional)
app.get('/status/:jobId', (req, res) => {
  const status = jobStatus.get(req.params.jobId);
  res.json(status || { error: 'Job not found' });
});

// ===== JOB PROCESSOR =====

jobQueue.process(async (job) => {
  const { jobId, task, input, callback } = job.data;

  try {
    console.log(`[${jobId}] Processing: ${task}`);
    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'processing'
    });

    let result;

    // Handle different task types
    switch (task) {
      case 'ai_chat':
        result = await handleAiChat(input);
        break;

      case 'scrape':
        result = await handleScrape(input);
        break;

      case 'code_execute':
        result = await handleCodeExecute(input);
        break;

      case 'http_request':
        result = await handleHttpRequest(input);
        break;

      case 'delay':
        result = await handleDelay(input);
        break;

      default:
        throw new Error(`Unknown task type: ${task}`);
    }

    // Send result to callback URL
    await axios.post(callback, {
      jobId,
      status: 'completed',
      result,
      completedAt: new Date()
    }, { timeout: 10000 });

    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'completed',
      result
    });

    console.log(`[${jobId}] Completed`);
    return { success: true, result };

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);

    // Send error to callback
    try {
      await axios.post(callback, {
        jobId,
        status: 'failed',
        error: error.message,
        failedAt: new Date()
      }, { timeout: 10000 });
    } catch (callbackError) {
      console.error(`[${jobId}] Callback error:`, callbackError.message);
    }

    jobStatus.set(jobId, {
      ...jobStatus.get(jobId),
      status: 'failed',
      error: error.message
    });

    throw error;
  }
});

// ===== TASK HANDLERS =====

async function handleAiChat(input) {
  // Simple handler - can be extended
  if (!process.env.GROQ_API_KEY) {
    return `Echo: ${input}`;
  }

  // Placeholder for Groq API or similar
  return `Processed: ${input}`;
}

async function handleScrape(input) {
  const { url, selector } = input;
  if (!url) throw new Error('URL required for scrape task');

  // Placeholder scraping logic
  return { url, selector, message: 'Scrape task queued' };
}

async function handleCodeExecute(input) {
  const { code, language } = input;
  if (!code) throw new Error('Code required');

  // Placeholder - actual execution would need sandboxing
  return { language, message: 'Code execution placeholder' };
}

async function handleHttpRequest(input) {
  const { url, method = 'GET', body, headers } = input;
  if (!url) throw new Error('URL required');

  const response = await axios({
    url,
    method,
    data: body,
    headers: headers || {},
    timeout: 30000
  });

  return response.data;
}

async function handleDelay(input) {
  const { duration } = input;
  const ms = duration || 5000;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ delayed: true, duration: ms });
    }, ms);
  });
}

// ===== START SERVER =====

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Job Executor API running on port ${PORT}`);
  console.log(`POST https://localhost:${PORT}/run to submit jobs`);
});