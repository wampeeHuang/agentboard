// cron-runner: spawn claude -p, capture output, record to DB
// CJS module. Direct execution (no gateway dependency).
var { spawn } = require('child_process');

var CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
var TAIL_CHARS = 500;

function shellCmd() {
  return process.platform === 'win32'
    ? { bin: 'cmd', args: ['/d', '/c'] }
    : { bin: 'bash', args: ['-c'] };
}

function buildCmd(prompt) {
  var escaped = prompt.replace(/"/g, '\\"');
  return '"' + CLAUDE_BIN + '" -p --output-format text -- "' + escaped + '"';
}

function runTask(task, db) {
  var task_id = task.id;
  var project_dir = task.project_dir;
  var prompt = task.prompt;
  var timeout_sec = task.timeout_sec || 300;
  var started_at = new Date().toISOString();
  var shell = shellCmd();

  var runId = db.addRun({ task_id: task_id, started_at: started_at, pid: null });

  return new Promise(function(resolve) {
    var stdout = '';
    var stderr = '';
    var settled = false;

    var child = spawn(shell.bin, shell.args.concat([buildCmd(prompt)]), {
      cwd: project_dir,
      env: Object.assign({}, process.env, { WORKSPACE_ROOT: project_dir }),
      timeout: timeout_sec * 1000,
      windowsHide: true
    });

    child.stdout.on('data', function(d) { stdout += d.toString(); });
    child.stderr.on('data', function(d) { stderr += d.toString(); });

    function settle(status, exitCode) {
      if (settled) return;
      settled = true;
      db.finishRun(runId, {
        exit_code: exitCode !== undefined ? exitCode : (child.killed ? 124 : (child.exitCode != null ? child.exitCode : -1)),
        status: status,
        stdout_tail: stdout.slice(-TAIL_CHARS) || null,
        stderr_tail: stderr.slice(-TAIL_CHARS) || null
      });
      resolve({ runId: runId, status: status, stdout: stdout, stderr: stderr });
    }

    child.on('error', function() { settle('error', -1); });
    child.on('close', function(code) {
      if (child.killed || code === 124) settle('timeout', 124);
      else if (code === 0) settle('success', 0);
      else settle('failed', code);
    });
  });
}

module.exports = { runTask: runTask };
