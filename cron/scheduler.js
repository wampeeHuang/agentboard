// Agentboard Cron Scheduler
// Reads job definitions from ~/.openclaw/cron/jobs.json
// Evaluates cron expressions, triggers via openclaw cron run
// Gateway jobs are all enabled=false to prevent double-scheduling.
// Agentboard maintains its own enabled list in scheduler-state.json.

var fs = require('fs');
var path = require('path');
var { exec } = require('child_process');
var os = require('os');
var logger = require('./runtime-logger.js');

var JOBS_PATH = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');
var STATE_PATH = path.join(__dirname, 'scheduler-state.json');
var TICK_MS = 60 * 1000;
var MAX_RETRIES = 3;

// Chain: job success → auto-trigger next
// From gateway jobs.json prompt chain conventions:
//   认知深读 → AI信号 → 每日选题
//   个体户申报提醒 is standalone
var CHAINS = {
  '3cfba668-6ab7-40f0-b787-6d5cec5e72f0': '591346bc-67f9-4814-beca-1df63cfe7bfa',
  '591346bc-67f9-4814-beca-1df63cfe7bfa': 'a85e2d4c-dacd-4a80-b328-efbb0d5670fb'
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

// Returns jobs that agentboard should auto-schedule.
// Uses agentboard's own enabled flag (stored in scheduler-state.json),
// seeded from gateway's enabled flag on first encounter.
function loadEnabledJobs() {
  var all = loadAllJobs();
  return all.filter(function(j) {
    var ts = state.tasks[j.id];
    if (!ts) {
      // First encounter: seed from gateway config
      ts = { id: j.id, agentboardEnabled: j.enabled };
      state.tasks[j.id] = ts;
    }
    if (ts.agentboardEnabled === undefined) {
      ts.agentboardEnabled = j.enabled;
    }
    return ts.agentboardEnabled;
  });
}

// Toggle agentboard's enabled flag for a job
function setEnabled(jobId, enabled) {
  var ts = state.tasks[jobId] || { id: jobId };
  ts.agentboardEnabled = enabled;
  state.tasks[jobId] = ts;
  saveState();
}

// Check if agentboard has a job enabled
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

function triggerJob(job) {
  var ts = state.tasks[job.id] || { id: job.id };
  if (ts.retriesThisWindow >= MAX_RETRIES) return;

  console.log('[cron-scheduler] Triggering:', job.name);
  logger.jobTriggered(job);
  var triggerTime = Date.now();
  var jobTimeoutMs = ((job.payload && job.payload.timeoutSeconds) || 300) * 1000;
  var pollInterval = 15000;
  var maxPolls = Math.ceil((jobTimeoutMs + 120000) / pollInterval);
  var pollCount = 0;

  // Step 1: trigger (CLI returns immediately with {enqueued: true})
  exec('openclaw cron run ' + job.id, { timeout: 30000, shell: 'powershell' }, function(triggerErr, stdout) {
    ts.lastRun = new Date().toISOString();

    if (triggerErr) {
      console.warn('[cron-scheduler] Trigger warning:', triggerErr.message);
      // triggerErr is non-fatal, poll will report real status
    }

    // Step 2: poll for result via cron runs
    function poll() {
      pollCount++;
      if (pollCount > maxPolls) {
        ts.lastStatus = 'error';
        ts.lastError = 'Job did not complete within timeout';
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
        ts.retriesThisWindow = (ts.retriesThisWindow || 0) + 1;
        state.tasks[job.id] = ts;
        saveState();
        return;
      }

      exec('openclaw cron runs --id ' + job.id + ' --limit 1', { timeout: 15000, shell: 'powershell' }, function(pollErr, stdout) {
        if (pollErr) { setTimeout(poll, pollInterval); return; }

        try {
          var result = JSON.parse(stdout);
          var entry = (result.entries || [])[0];
          if (entry && entry.runAtMs >= triggerTime - 5000) {
            processResult(entry);
          } else {
            setTimeout(poll, pollInterval);
          }
        } catch(_) { setTimeout(poll, pollInterval); }
      });
    }

    setTimeout(poll, 8000);
    logger.jobPolling(job.id, job.name);
  });

  function processResult(entry) {
    ts.lastDurationMs = entry.durationMs || 0;
    ts.lastTokens = entry.usage ? entry.usage.total_tokens : 0;

    if (entry.status === 'ok') {
      ts.lastStatus = 'success';
      ts.consecutiveErrors = 0;
      ts.retriesThisWindow = 0;
      ts.lastError = null;
      logger.jobCompleted(job.id, job.name, ts.lastDurationMs, ts.lastTokens);

      // Chain: auto-trigger downstream job after success
	      // Post-hook: deploy after last chain job completes
	      if (job.id === 'a85e2d4c-dacd-4a80-b328-efbb0d5670fb') {
	        console.log('[cron-scheduler] Post-hook: deploying evopearl-data');
        logger.deployStarted();
	        var homedir = os.homedir();
        var deployCmd = 'cd /d ' + homedir + '\\_runtime\\evopearl-data && powershell -File deploy.ps1';
	        exec(deployCmd, { timeout: 120000, shell: 'cmd' }, function(deployErr) {
	          if (deployErr) { console.error('[cron-scheduler] Deploy failed:', deployErr.message);  logger.deployCompleted(false, deployErr.message); }
	          else { console.log('[cron-scheduler] Deploy OK');  logger.deployCompleted(true); }
	        });
	      }
      var nextId = CHAINS[job.id];
      if (nextId && isEnabled(nextId)) {
        var nextJob = findJobById(nextId);
        if (nextJob) {
          console.log('[cron-scheduler] Chain: ' + job.name + ' → ' + nextJob.name);
          logger.chainTriggered(job.id, job.name, nextJob.id, nextJob.name);
          setTimeout(function() { triggerJob(nextJob); }, 30000);
        }
      }
    } else {
      ts.consecutiveErrors = (ts.consecutiveErrors || 0) + 1;
      var errorText = entry.error || entry.summary || '';

      if (/billing|credits|insufficient balance|unauthorized|402|401/i.test(errorText)) {
        ts.retriesThisWindow = MAX_RETRIES;
        ts.lastStatus = 'fatal_error';
        ts.lastError = 'Billing/Auth error — 今日已停止，明天自动重置';
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
      } else {
        ts.retriesThisWindow = (ts.retriesThisWindow || 0) + 1;
        ts.lastStatus = 'error';
        ts.lastError = errorText.slice(0, 200);
        logger.jobFailed(job.id, job.name, ts.lastError, ts.lastStatus);
      }
    }

    state.tasks[job.id] = ts;
    saveState();
  }
}

function findJobById(id) {
  var all = loadAllJobs();
  return all.find(function(j) { return j.id === id; });
}

var lastTickDate = '';

function tick() {
  loadState();
  var jobs = loadEnabledJobs();
  var now = new Date();
  var today = now.toISOString().slice(0, 10);
  if (lastTickDate && lastTickDate !== today) {
    logger.dailyReset(today);
  }
  lastTickDate = today;

  jobs.forEach(function(job) {
    if (!job.schedule || job.schedule.kind !== 'cron') return;
    if (!cronMatches(job.schedule.expr, now)) return;

    var ts = state.tasks[job.id] || { id: job.id };
    // Reset daily counters at start of new day
    if (ts.lastRun && ts.lastRun.slice(0, 10) !== today) {
      ts.retriesThisWindow = 0;
    }
    // Don't re-trigger within same minute
    if (ts.lastTickMinute === now.getMinutes() && ts.lastTickHour === now.getHours()) return;

    ts.lastTickMinute = now.getMinutes();
    ts.lastTickHour = now.getHours();
    state.tasks[job.id] = ts;
    saveState();

    triggerJob(job);
  });
}

function start() {
  loadState();
  // Seed enabled flags from gateway on first run
  loadEnabledJobs();
  saveState();
  var n = loadEnabledJobs().length;
  console.log('[cron-scheduler] Started, watching ' + n + ' enabled job' + (n !== 1 ? 's' : ''));
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
