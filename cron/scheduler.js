// Agentboard Cron Scheduler
// Reads job definitions from ~/.openclaw/cron/jobs.json
// Evaluates cron expressions, triggers via runner.js (direct claude -p, no gateway)

var fs = require('fs');
var path = require('path');
var { exec } = require('child_process');
var os = require('os');
var logger = require('./runtime-logger.js');
var runner = require('./runner.js');

var JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
var STATE_PATH = path.join(__dirname, 'scheduler-state.json');
var STDERR_LOG_PATH = path.join(__dirname, 'stderr.log');
var STDERR_LOG_MAX = 5000;
var TICK_MS = 60 * 1000;
var MAX_RETRIES = 3;

// Chain: job success → auto-trigger next
var CHAINS = {
  '3cfba668-6ab7-40f0-b787-6d5cec5e72f0': '591346bc-67f9-4814-beca-1df63cfe7bfa',
  '591346bc-67f9-4814-beca-1df63cfe7bfa': 'a85e2d4c-dacd-4a80-b328-efbb0d5670fb'
};

// Output files to verify after job "success" — exit code 0 is not enough.
// %USERPROFILE% and YYYY-MM-DD are resolved at check time.
var OUTPUT_FILES = {
  '3cfba668-6ab7-40f0-b787-6d5cec5e72f0': '%USERPROFILE%\\_runtime\\evopearl-data\\data\\deep-read\\YYYY-MM-DD.json',
  'a85e2d4c-dacd-4a80-b328-efbb0d5670fb': '%USERPROFILE%\\_runtime\\evopearl-data\\data\\daily-selection\\YYYY-MM-DD.json'
};

// Agent workspace resolution for runner project_dir
var AGENT_WORKSPACES = {
  'evolution-cat': 'D:\\HHH\\自媒体\\进化猫',
  'main': 'D:\\Openclaw',
  'evolution-cat-writer': 'D:\\Openclaw\\agents\\evolution-cat-writer',
  'jinhua-cat': 'D:\\Openclaw\\agents\\jinhua-cat'
};

var state = { tasks: {} };
var timer = null;

function loadState() {
  try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); }
  catch(_) { state = { tasks: {} }; }
  if (!state.tasks) state.tasks = {};
}

function saveState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8'); }
  catch(_) {}
}

function loadAllJobs() {
  try {
    var data = JSON.parse(fs.readFileSync(JOBS_PATH, 'utf-8'));
    return data.jobs || [];
  } catch(_) { return []; }
}

function loadEnabledJobs() {
  var all = loadAllJobs();
  return all.filter(function(j) {
    var ts = state.tasks[j.id];
    if (!ts) {
      ts = { id: j.id, agentboardEnabled: j.enabled };
      state.tasks[j.id] = ts;
    }
    if (ts.agentboardEnabled === undefined) {
      ts.agentboardEnabled = j.enabled;
    }
    return ts.agentboardEnabled;
  });
}

function setEnabled(jobId, enabled) {
  var ts = state.tasks[jobId] || { id: jobId };
  ts.agentboardEnabled = enabled;
  state.tasks[jobId] = ts;
  saveState();
}

function isEnabled(jobId) {
  var ts = state.tasks[jobId];
  if (!ts || ts.agentboardEnabled === undefined) {
    var all = loadAllJobs();
    var job = all.find(function(j) { return j.id === jobId; });
    return job ? job.enabled : false;
  }
  return ts.agentboardEnabled;
}

function cronMatches(expr, date) {
  var parts = expr.split(/\s+/);
  if (parts.length < 5) return false;
  var d = date || new Date();
  function fm(pattern, value) {
    if (pattern === '*') return true;
    return pattern.split(',').some(function(v) { return String(v.trim()) === String(value); });
  }
  return fm(parts[0], d.getMinutes()) && fm(parts[1], d.getHours()) &&
    fm(parts[2], d.getDate()) && fm(parts[3], d.getMonth() + 1) && fm(parts[4], d.getDay());
}

function getWorkspace(job) {
  return AGENT_WORKSPACES[job.agentId] || AGENT_WORKSPACES['main'];
}

function extractTokens(result) {
  // Try to find token usage in claude output (stdout or stderr)
  var combined = (result.stdout || '') + (result.stderr || '');
  // Match Claude's usage JSON: {"input_tokens": N, "output_tokens": N}
  var m = combined.match(/"input_tokens"\s*:\s*(\d+)[^}]*"output_tokens"\s*:\s*(\d+)/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10);
  m = combined.match(/"output_tokens"\s*:\s*(\d+)[^}]*"input_tokens"\s*:\s*(\d+)/);
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10);
  // Fallback: look for standalone token counts in last 500 chars
  var tail = combined.slice(-500);
  m = tail.match(/(\d{3,6})\s*tokens/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function logStderr(jobId, jobName, stderr) {
  if (!stderr || stderr.trim().length === 0) return;
  var ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  var line = JSON.stringify({ _ts: ts, job_id: jobId, job_name: jobName, stderr: stderr.slice(-2000) }) + '\n';
  try {
    fs.appendFileSync(STDERR_LOG_PATH, line, 'utf-8');
    trimStderrLog();
  } catch(_) {}
}

function trimStderrLog() {
  try {
    var data = fs.readFileSync(STDERR_LOG_PATH, 'utf-8');
    var lines = data.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length > STDERR_LOG_MAX) {
      fs.writeFileSync(STDERR_LOG_PATH, lines.slice(-STDERR_LOG_MAX / 2).join('\n') + '\n', 'utf-8');
    }
  } catch(_) {}
}

function verifyOutput(jobId) {
  var template = OUTPUT_FILES[jobId];
  if (!template) return null; // no output file defined for this job — skip check
  var today = new Date().toISOString().slice(0, 10);
  var filePath = template
    .replace('%USERPROFILE%', os.homedir())
    .replace('YYYY-MM-DD', today);
  try {
    var stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) {
      return { ok: false, path: filePath, reason: stat.size === 0 ? 'file empty' : 'not a file' };
    }
    return { ok: true, path: filePath, size: stat.size };
  } catch(_) {
    return { ok: false, path: filePath, reason: 'file missing' };
  }
}

function triggerJob(job) {
  var ts = state.tasks[job.id] || { id: job.id };
  if (ts.retriesThisWindow >= MAX_RETRIES) return;
  if (ts._runningSince) {
    var runningSec = (Date.now() - new Date(ts._runningSince).getTime()) / 1000;
    if (runningSec < 600) return; // already running, skip for up to 10 min
    // stale run — clear and proceed
    ts._runningSince = null;
  }

  console.log('[cron-scheduler] Triggering:', job.name);
  logger.jobTriggered(job);
  var startTime = Date.now();
  ts.lastRun = new Date().toISOString();
  ts._runningSince = ts.lastRun;

  var isShell = (job.payload && job.payload.kind === 'shell');

  if (isShell) {
    // Direct shell command — no LLM
    runner.runShell(job.payload.command, {
      cwd: getWorkspace(job),
      timeout_sec: (job.payload && job.payload.timeoutSeconds) || 300
    }).then(function(result) {
      ts._runningSince = null;
      var durationMs = Date.now() - startTime;
      ts.lastDurationMs = durationMs;

      logStderr(job.id, job.name, result.stderr);

      if (result.status === 'success') {
        ts.lastStatus = 'success';
        ts.consecutiveErrors = 0;
        ts.retriesThisWindow = 0;
        ts.lastError = null;
        logger.jobCompleted(job.id, job.name, durationMs, 0);
        console.log('[cron-scheduler] Shell OK:', job.name);
      } else {
        ts.consecutiveErrors = (ts.consecutiveErrors || 0) + 1;
        ts.retriesThisWindow = (ts.retriesThisWindow || 0) + 1;
        ts.lastStatus = result.status || 'error';
        ts.lastError = (result.stderr || result.status || 'unknown').slice(0, 200);
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
        console.log('[cron-scheduler] Shell FAILED:', job.name, ts.lastError);
      }

      state.tasks[job.id] = ts;
      saveState();
    });
    return;
  }

  var task = {
    id: job.id,
    project_dir: getWorkspace(job),
    prompt: (job.payload && job.payload.message) || '',
    model: (job.payload && job.payload.model) || null,
    timeout_sec: (job.payload && job.payload.timeoutSeconds) || 300
  };

  runner.runTask(task, null).then(function(result) {
    ts._runningSince = null;
    var durationMs = Date.now() - startTime;
    ts.lastDurationMs = durationMs;

    if (result.status === 'success') {
      // Always persist stderr — even on "success"
      logStderr(job.id, job.name, result.stderr);

      // Verify output file exists (exit code 0 alone is not trustworthy)
      var outputCheck = verifyOutput(job.id);
      if (outputCheck && !outputCheck.ok) {
        // Job reported success but output file is missing/empty
        ts.lastStatus = 'output_missing';
        ts.lastError = 'Output file ' + outputCheck.reason + ': ' + outputCheck.path;
        ts.consecutiveErrors = (ts.consecutiveErrors || 0) + 1;
        ts.retriesThisWindow = (ts.retriesThisWindow || 0) + 1;
        var tokens = extractTokens(result);
        logger.jobFailed(job.id, job.name, ts.lastError, 'output_missing');
        console.log('[cron-scheduler] Output check FAILED:', ts.lastError);
        state.tasks[job.id] = ts;
        saveState();
        return;
      }

      ts.lastStatus = 'success';
      ts.consecutiveErrors = 0;
      ts.retriesThisWindow = 0;
      ts.lastError = null;
      var tokens = extractTokens(result);
      logger.jobCompleted(job.id, job.name, durationMs, tokens);
      if (outputCheck) {
        console.log('[cron-scheduler] Output verified:', outputCheck.path, '(' + outputCheck.size + ' bytes)');
      }

      // Post-hook: deploy after last chain job completes
      if (job.id === 'a85e2d4c-dacd-4a80-b328-efbb0d5670fb') {
        console.log('[cron-scheduler] Post-hook: deploying evopearl-data');
        logger.deployStarted();
        var deployCmd = 'cd /d D:\\workspace\\evopearl-data && git pull origin main && powershell -File deploy.ps1';
        exec(deployCmd, { timeout: 120000, shell: 'cmd' }, function(deployErr) {
          if (deployErr) { console.error('[cron-scheduler] Deploy failed:', deployErr.message); logger.deployCompleted(false, deployErr.message); }
          else { console.log('[cron-scheduler] Deploy OK'); logger.deployCompleted(true); }
        });
      }

      // Chain: auto-trigger downstream job after success
      var nextId = CHAINS[job.id];
      if (nextId && isEnabled(nextId)) {
        var nextJob = findJobById(nextId);
        if (nextJob) {
          console.log('[cron-scheduler] Chain: ' + job.name + ' -> ' + nextJob.name);
          logger.chainTriggered(job.id, job.name, nextJob.id, nextJob.name);
          setTimeout(function() { triggerJob(nextJob); }, 30000);
        }
      }
    } else {
      // Always persist stderr on failure
      logStderr(job.id, job.name, result.stderr);

      ts.consecutiveErrors = (ts.consecutiveErrors || 0) + 1;
      var errorText = result.stderr ? result.stderr.slice(-300) : result.status;

      if (/billing|credits|insufficient balance|unauthorized|402|401/i.test(errorText)) {
        ts.retriesThisWindow = MAX_RETRIES;
        ts.lastStatus = 'fatal_error';
        ts.lastError = 'Billing/Auth error - today stopped, retry tomorrow';
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
      } else {
        ts.retriesThisWindow = (ts.retriesThisWindow || 0) + 1;
        ts.lastStatus = result.status || 'error';
        ts.lastError = errorText.slice(0, 200);
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
      }
    }

    state.tasks[job.id] = ts;
    saveState();
  });
}

function findJobById(id) {
  var all = loadAllJobs();
  return all.find(function(j) { return j.id === id; });
}

var lastTickDate = '';

// Check if job was missed while computer was asleep.
// Returns true if: scheduled time passed by >=5 min, not successfully completed today, retries not exhausted.
function wasMissed(job, ts, now) {
  var today = now.toISOString().slice(0, 10);
  if (ts.lastRun && ts.lastRun.slice(0, 10) === today && ts.lastStatus === 'success') return false;
  if (ts.retriesThisWindow >= MAX_RETRIES) return false;
  var parts = job.schedule.expr.split(/\s+/);
  if (parts.length < 5) return false;
  var m = parseInt(parts[0], 10);
  var h = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(h)) return false;
  return (now.getHours() * 60 + now.getMinutes()) >= (h * 60 + m + 5);
}

function tick() {
  loadState();
  var jobs = loadEnabledJobs();
  var now = new Date();
  var today = now.toISOString().slice(0, 10);
  if (lastTickDate && lastTickDate !== today) {
    logger.dailyReset(today);
  }
  lastTickDate = today;

  // Pass 1: exact cron match
  jobs.forEach(function(job) {
    if (!job.schedule || job.schedule.kind !== 'cron') return;
    if (!cronMatches(job.schedule.expr, now)) return;

    var ts = state.tasks[job.id] || { id: job.id };
    if (ts.lastRun && ts.lastRun.slice(0, 10) !== today) {
      ts.retriesThisWindow = 0;
    }
    if (ts.lastTickMinute === now.getMinutes() && ts.lastTickHour === now.getHours()) return;

    ts.lastTickMinute = now.getMinutes();
    ts.lastTickHour = now.getHours();
    state.tasks[job.id] = ts;
    saveState();

    triggerJob(job);
  });

  // Pass 2: catch-up — computer slept through scheduled time.
  // Only fires the earliest missed job; chain mechanism handles the rest.
  var missed = [];
  jobs.forEach(function(job) {
    if (!job.schedule || job.schedule.kind !== 'cron') return;
    var ts = state.tasks[job.id] || { id: job.id };
    if (wasMissed(job, ts, now)) {
      var parts = job.schedule.expr.split(/\s+/);
      var schedMin = parseInt(parts[0], 10) + parseInt(parts[1], 10) * 60;
      missed.push({ job: job, ts: ts, schedMin: schedMin });
    }
  });

  if (missed.length > 0) {
    missed.sort(function(a, b) { return a.schedMin - b.schedMin; });
    var pick = missed[0];
    console.log('[cron-scheduler] Catch-up: ' + pick.job.name + ' (woke after ' + pick.schedMin + 'min mark)');
    pick.ts.lastTickMinute = now.getMinutes();
    pick.ts.lastTickHour = now.getHours();
    state.tasks[pick.job.id] = pick.ts;
    saveState();
    triggerJob(pick.job);
  }
}

function start() {
  loadState();
  loadEnabledJobs();
  saveState();
  var n = loadEnabledJobs().length;
  console.log('[cron-scheduler] Started (runner mode), watching ' + n + ' enabled job' + (n !== 1 ? 's' : ''));
  logger.schedulerStarted(n);
  tick();
  timer = setInterval(tick, TICK_MS);
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = {
  start: start,
  stop: stop,
  tick: tick,
  loadJobs: loadEnabledJobs,
  loadAllJobs: loadAllJobs,
  getState: function() { return state; },
  loadState: loadState,
  saveState: saveState,
  setEnabled: setEnabled,
  isEnabled: isEnabled,
  MAX_RETRIES: MAX_RETRIES
};
