// cron-runner: spawn claude -p, capture output
// CJS module. Direct execution (no gateway dependency).
var { spawn } = require('child_process');

var path = require('path');
var fs = require('fs');
var CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
// Resolve to absolute path: npm global install location
var KNOWN_CLAUDE = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'AppData', 'Roaming', 'npm', 'claude.cmd');
if (fs.existsSync(KNOWN_CLAUDE)) { CLAUDE_BIN = KNOWN_CLAUDE; }
var TAIL_CHARS = 500;

function shellCmd() {
  return process.platform === 'win32'
    ? { bin: 'cmd', args: ['/d', '/c'] }
    : { bin: 'bash', args: ['-c'] };
}

function buildCmd(prompt, model) {
  var escaped = prompt.replace(/"/g, '\\"');
  // No quotes around CLAUDE_BIN — cmd.exe quote-stripping breaks quoted paths
  var cmd = CLAUDE_BIN + ' -p --output-format text';
  if (model) cmd += ' --model ' + model;
  cmd += ' -- "' + escaped + '"';
  return cmd;
}

// db is optional — pass null to skip DB recording
function runTask(task, db) {
  var task_id = task.id;
  var project_dir = task.project_dir || process.cwd();
  var prompt = task.prompt;
  var model = task.model || null;
  var timeout_sec = task.timeout_sec || 300;
  var started_at = new Date().toISOString();
  var shell = shellCmd();

  var runId = db ? db.addRun({ task_id: task_id, started_at: started_at, pid: null }) : null;

  return new Promise(function(resolve) {
    var stdout = '';
    var stderr = '';
    var settled = false;

    var child = spawn(shell.bin, shell.args.concat([buildCmd(prompt, model)]), {
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
      if (db) {
        db.finishRun(runId, {
          exit_code: exitCode !== undefined ? exitCode : (child.killed ? 124 : (child.exitCode != null ? child.exitCode : -1)),
          status: status,
          stdout_tail: stdout.slice(-TAIL_CHARS) || null,
          stderr_tail: stderr.slice(-TAIL_CHARS) || null
        });
      }
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

// Shell runner — direct command execution, no LLM involved.
// For backup scripts, health checks, and other non-AI tasks.
function runShell(command, opts) {
  opts = opts || {};
  var timeout_sec = opts.timeout_sec || 300;
  var cwd = opts.cwd || process.cwd();
  var shell = shellCmd();

  return new Promise(function(resolve) {
    var stdout = '';
    var stderr = '';
    var settled = false;

    var child = spawn(shell.bin, shell.args.concat([command]), {
      cwd: cwd,
      env: Object.assign({}, process.env),
      timeout: timeout_sec * 1000,
      windowsHide: true
    });

    child.stdout.on('data', function(d) { stdout += d.toString(); });
    child.stderr.on('data', function(d) { stderr += d.toString(); });

    function settle(status, exitCode) {
      if (settled) return;
      settled = true;
      resolve({ status: status, stdout: stdout, stderr: stderr, exitCode: exitCode });
    }

    child.on('error', function(e) { settle('error', -1); });
    child.on('close', function(code) {
      if (child.killed || code === 124) settle('timeout', 124);
      else if (code === 0) settle('success', 0);
      else settle('failed', code);
    });
  });
}

module.exports = { runTask: runTask, runShell: runShell };
