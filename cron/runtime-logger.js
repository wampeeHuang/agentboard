// Runtime event logger for evopearl-data cron system
// JSONL append-only, one line per event
// Part of Loop Engineering: 记事本 (Notepad)
var fs = require('fs');
var path = require('path');
var os = require('os');

var LOG_PATH = path.join(__dirname, 'runtime-events.jsonl');
var MAX_LINES = 10000;

function formatDate(d) {
  var iso = d.toISOString();
  return iso.replace('T', ' ').slice(0, 19);
}

function log(event) {
  event._ts = formatDate(new Date());
  var line = JSON.stringify(event) + '\n';
  try {
    fs.appendFileSync(LOG_PATH, line, 'utf-8');
    trimIfNeeded();
  } catch(_) {}
}

function trimIfNeeded() {
  try {
    var data = fs.readFileSync(LOG_PATH, 'utf-8');
    var lines = data.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length > MAX_LINES) {
      fs.writeFileSync(LOG_PATH, lines.slice(-MAX_LINES / 2).join('\n') + '\n', 'utf-8');
    }
  } catch(_) {}
}

function query(opts) {
  opts = opts || {};
  try {
    var data = fs.readFileSync(LOG_PATH, 'utf-8');
    var lines = data.split('\n').filter(function(l) { return l.trim(); });
    var events = [];
    for (var i = 0; i < lines.length; i++) {
      try { events.push(JSON.parse(lines[i])); } catch(_) {}
    }

    if (opts.since) {
      events = events.filter(function(e) { return e._ts >= opts.since; });
    }
    if (opts.type) {
      events = events.filter(function(e) { return e.event_type === opts.type; });
    }
    if (opts.jobId) {
      events = events.filter(function(e) { return e.job_id === opts.jobId; });
    }
    if (opts.last) {
      events = events.slice(-opts.last);
    }
    return events;
  } catch(_) { return []; }
}

// --- Convenience writers ---

function jobTriggered(job) {
  log({
    event_type: 'job_triggered',
    job_id: job.id,
    job_name: job.name,
    schedule: job.schedule ? job.schedule.expr : null
  });
}

function jobPolling(jobId, jobName) {
  log({
    event_type: 'job_polling',
    job_id: jobId,
    job_name: jobName
  });
}

function jobCompleted(jobId, jobName, durationMs, tokens) {
  log({
    event_type: 'job_completed',
    job_id: jobId,
    job_name: jobName,
    duration_ms: durationMs || 0,
    tokens: tokens || 0
  });
}

function jobFailed(jobId, jobName, error, status) {
  log({
    event_type: 'job_failed',
    job_id: jobId,
    job_name: jobName,
    error: (error || '').slice(0, 300),
    status: status || 'error'
  });
}

function chainTriggered(fromJobId, fromName, toJobId, toName) {
  log({
    event_type: 'chain_triggered',
    from_job_id: fromJobId,
    from_job_name: fromName,
    to_job_id: toJobId,
    to_job_name: toName
  });
}

function deployStarted() {
  log({ event_type: 'deploy_started' });
}

function deployCompleted(success, errorMsg) {
  log({
    event_type: 'deploy_completed',
    success: success,
    error: errorMsg || null
  });
}

function dailyReset(date) {
  log({
    event_type: 'daily_reset',
    date: date
  });
}

function schedulerStarted(jobCount) {
  log({
    event_type: 'scheduler_started',
    job_count: jobCount,
    pid: process.pid
  });
}

// --- Daily summary (human-readable) ---

function todaySummary() {
  var today = new Date().toISOString().slice(0, 10);
  var events = query({ since: today });
  var summary = {
    date: today,
    total_events: events.length,
    jobs_triggered: 0,
    jobs_completed: 0,
    jobs_failed: 0,
    deploy_attempted: false,
    deploy_succeeded: false,
    errors: []
  };

  events.forEach(function(e) {
    switch (e.event_type) {
      case 'job_triggered': summary.jobs_triggered++; break;
      case 'job_completed': summary.jobs_completed++; break;
      case 'job_failed':
        summary.jobs_failed++;
        summary.errors.push({ job: e.job_name, error: e.error, status: e.status });
        break;
      case 'deploy_completed':
        summary.deploy_attempted = true;
        summary.deploy_succeeded = e.success;
        if (!e.success) summary.errors.push({ job: 'deploy', error: e.error });
        break;
    }
  });

  return summary;
}

module.exports = {
  log: log,
  query: query,
  jobTriggered: jobTriggered,
  jobPolling: jobPolling,
  jobCompleted: jobCompleted,
  jobFailed: jobFailed,
  chainTriggered: chainTriggered,
  deployStarted: deployStarted,
  deployCompleted: deployCompleted,
  dailyReset: dailyReset,
  schedulerStarted: schedulerStarted,
  todaySummary: todaySummary,
  LOG_PATH: LOG_PATH
};
