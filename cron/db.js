// cron-db: SQLite persistence via node:sqlite (Node 24+)
// CJS module. Companion to cron-expr.js and runner.js.
var { DatabaseSync } = require('node:sqlite');

var SCHEMA = [
'CREATE TABLE IF NOT EXISTS tasks (',
'  id INTEGER PRIMARY KEY AUTOINCREMENT,',
'  project_id TEXT NOT NULL,',
'  project_dir TEXT NOT NULL,',
'  name TEXT NOT NULL,',
'  cron_expr TEXT NOT NULL,',
'  prompt TEXT NOT NULL,',
'  description TEXT DEFAULT \'\',',
'  timeout_sec INTEGER DEFAULT 300,',
'  enabled INTEGER DEFAULT 1,',
'  created_at TEXT DEFAULT (datetime(\'now\'))',
');',
'',
'CREATE TABLE IF NOT EXISTS run_history (',
'  id INTEGER PRIMARY KEY AUTOINCREMENT,',
'  task_id INTEGER NOT NULL,',
'  started_at TEXT NOT NULL,',
'  ended_at TEXT,',
'  exit_code INTEGER,',
'  status TEXT DEFAULT \'running\',',
'  stdout_tail TEXT,',
'  stderr_tail TEXT,',
'  pid INTEGER,',
'  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE',
');',
'',
'CREATE INDEX IF NOT EXISTS idx_run_history_task_id ON run_history(task_id);',
'CREATE INDEX IF NOT EXISTS idx_run_history_started ON run_history(started_at);'
].join('\n');

function init(dbPath) {
  var db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(SCHEMA);

  // Migration: add description column (2026-06-15)
  try { db.exec('ALTER TABLE tasks ADD COLUMN description TEXT DEFAULT \'\''); } catch(e) { /* already exists */ }

  return {
    createTask: function(task) {
      var stmt = db.prepare(
        'INSERT INTO tasks (project_id, project_dir, name, cron_expr, prompt, description, timeout_sec, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      return stmt.run(
        task.project_id, task.project_dir, task.name, task.cron_expr, task.prompt,
        task.description || '', task.timeout_sec || 300, task.enabled !== undefined ? (task.enabled ? 1 : 0) : 1
      ).lastInsertRowid;
    },

    getTasks: function() {
      return db.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
    },

    getTask: function(id) {
      return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    },

    updateTask: function(id, fields) {
      var existing = this.getTask(id);
      if (!existing) return false;
      var m = {};
      for (var k in existing) m[k] = existing[k];
      for (var k in fields) m[k] = fields[k];
      db.prepare(
        'UPDATE tasks SET project_id=?, project_dir=?, name=?, cron_expr=?, prompt=?, description=?, timeout_sec=?, enabled=? WHERE id=?'
      ).run(m.project_id, m.project_dir, m.name, m.cron_expr, m.prompt, m.description || '', m.timeout_sec, m.enabled ? 1 : 0, id);
      return true;
    },

    deleteTask: function(id) {
      return db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
    },

    addRun: function(run) {
      return db.prepare(
        'INSERT INTO run_history (task_id, started_at, pid) VALUES (?, ?, ?)'
      ).run(run.task_id, run.started_at, run.pid).lastInsertRowid;
    },

    finishRun: function(id, result) {
      db.prepare(
        "UPDATE run_history SET ended_at=datetime('now'), exit_code=?, status=?, stdout_tail=?, stderr_tail=? WHERE id=?"
      ).run(result.exit_code, result.status, result.stdout_tail || null, result.stderr_tail || null, id);
    },

    getHistory: function(opts) {
      opts = opts || {};
      var limit = opts.limit || 50;
      var offset = opts.offset || 0;
      if (opts.task_id) {
        return db.prepare(
          'SELECT * FROM run_history WHERE task_id = ? ORDER BY id DESC LIMIT ? OFFSET ?'
        ).all(opts.task_id, limit, offset);
      }
      return db.prepare('SELECT * FROM run_history ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
    },

    close: function() {
      db.close();
    },

    raw: function(sql) {
      var stmt = db.prepare(sql);
      var args = Array.prototype.slice.call(arguments, 1);
      return args.length ? stmt.all.apply(stmt, args) : stmt.all();
    }
  };
}

module.exports = { init: init };
