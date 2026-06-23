"""
Bit Browser Account Panel
Unified dashboard for multi-platform matrix account management
Port: 15502  |  Dashboard: http://localhost:15502  |  API: http://localhost:15502/api
"""
import json, subprocess, asyncio, time, os, sys
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import requests
import threading

PORT = 15502
CDP_SCAN_INTERVAL = 30  # seconds between CDP rescans

# ===== Account discovery via CDP =====

PLATFORM_MAP = {
    "bilibili.com": {"name": "B站", "icon": "📺", "creator_url": "https://member.bilibili.com/platform/upload/video/frame"},
    "xiaohongshu.com": {"name": "小红书", "icon": "📕", "creator_url": "https://creator.xiaohongshu.com"},
    "creator.xiaohongshu.com": {"name": "小红书创作", "icon": "📕", "creator_url": "https://creator.xiaohongshu.com"},
    "weixin.qq.com": {"name": "公众号", "icon": "💬", "creator_url": "https://mp.weixin.qq.com"},
    "mp.weixin.qq.com": {"name": "公众号", "icon": "💬", "creator_url": "https://mp.weixin.qq.com"},
    "douyin.com": {"name": "抖音", "icon": "🎵", "creator_url": "https://creator.douyin.com"},
    "kuaishou.com": {"name": "快手", "icon": "⚡", "creator_url": "https://cp.kuaishou.com"},
}

state = {
    "accounts": [],
    "last_scan": None,
    "scan_error": None,
}

def scan_cdp_ports():
    """Scan for all CDP debugging ports and identify logged-in accounts"""
    result = subprocess.run(
        'netstat -ano | findstr "LISTENING" | findstr "127.0.0.1"',
        shell=True, capture_output=True, text=True
    )
    accounts = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        port = parts[1].rsplit(":", 1)[-1]
        try:
            r = requests.get(f"http://127.0.0.1:{port}/json", timeout=0.8)
            if r.status_code != 200:
                continue
            pages = r.json()
        except:
            continue

        # Get browser version
        try:
            vr = requests.get(f"http://127.0.0.1:{port}/json/version", timeout=0.5)
            version_info = vr.json()
            chrome_ver = version_info.get("Browser", "").replace("Chrome/", "")
        except:
            chrome_ver = "?"

        # Analyze each page for platform detection
        platform_detected = None
        page_urls = []
        for page in pages:
            url = page.get("url", "")
            title = page.get("title", "")
            page_urls.append({"url": url, "title": title})

            if platform_detected:
                continue
            for domain, info in PLATFORM_MAP.items():
                if domain in url:
                    platform_detected = info.copy()
                    break
            # Also check favicon / title
            if not platform_detected and "bilibili" in title.lower():
                platform_detected = {"name": "B站", "icon": "📺", "creator_url": "https://member.bilibili.com/platform/upload/video/frame"}
            elif not platform_detected and "小红书" in title:
                platform_detected = {"name": "小红书", "icon": "📕", "creator_url": "https://creator.xiaohongshu.com"}

        if not platform_detected:
            continue  # Skip windows without recognized platforms

        account = {
            "port": int(port),
            "chrome_version": chrome_ver,
            "platform": platform_detected,
            "pages": page_urls,
            "discovered_at": datetime.now().isoformat(),
        }
        accounts.append(account)

    return accounts


def background_scanner():
    """Periodically rescan CDP ports"""
    while True:
        try:
            state["accounts"] = scan_cdp_ports()
            state["last_scan"] = datetime.now().isoformat()
            state["scan_error"] = None
        except Exception as e:
            state["scan_error"] = str(e)
        time.sleep(CDP_SCAN_INTERVAL)


# ===== HTTP Server =====

DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>矩阵账号面板 · Bit Browser</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='12' fill='%23faf9f5'/><rect x='12' y='14' width='24' height='24' rx='4' fill='%23d97757'/><rect x='16' y='20' width='16' height='2' rx='1' fill='%23fff'/><rect x='16' y='24' width='12' height='2' rx='1' fill='%23fff' opacity='0.6'/><rect x='16' y='28' width='14' height='2' rx='1' fill='%23fff' opacity='0.5'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700&family=Outfit:wght@400;500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=IBM+Plex+Mono:wght@400;500&family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root {
  --c-bg: #faf9f5; --c-bg-alt: #f5f4ed; --c-bg-light: #ffffff;
  --c-fg: #141413; --c-fg-2: #30302e; --c-fg-3: #5e5d59;
  --c-accent: #d97757; --c-accent-2: #c06747;
  --c-green: #3b7d4b; --c-red: #c44e3e;
  --c-border: #e8e6dc; --c-border-light: #d1cfc5;
  --f-display: "Source Serif 4", "Noto Serif SC", Georgia, serif;
  --f-heading: "Outfit", "Noto Sans SC", system-ui, sans-serif;
  --f-body: "DM Sans", "Noto Sans SC", system-ui, sans-serif;
  --f-mono: "IBM Plex Mono", "JetBrains Mono", monospace;
  --radius: 8px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--c-bg); color: var(--c-fg);
  font-family: var(--f-body); font-size: 16px; line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* Topbar */
.topbar {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 40px; border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-light); position: sticky; top: 0; z-index: 10;
}
.topbar .logo { display: flex; align-items: center; gap: 12px; }
.topbar .brand-name {
  font-family: var(--f-display); font-size: 1.45rem; font-weight: 700;
  line-height: 1.15; letter-spacing: -0.015em;
}
.topbar .brand-desc {
  font-size: 0.8rem; color: var(--c-fg-3);
  margin-left: 4px; white-space: nowrap;
}
.topbar .scan-info { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.topbar .scan-info .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; background: var(--c-green); }
.topbar .scan-info .dot.err { background: var(--c-red); }

/* Wrap */
.wrap { max-width: 1240px; margin: 0 auto; padding: 28px 40px 80px; }

/* Hero */
.hero { margin-bottom: 24px; }
.hero h1 {
  font-family: var(--f-display); font-size: 2.6rem; font-weight: 700;
  line-height: 1.15; letter-spacing: -0.02em;
}
.hero .desc { font-size: 0.9rem; color: var(--c-fg-3); margin-top: 2px; }

/* Stats row */
.stats-row { display: flex; gap: 12px; margin-bottom: 28px; }
.stat-card {
  flex: 1; max-width: 180px; background: var(--c-bg-light);
  border: 1px solid var(--c-border); border-radius: var(--radius);
  padding: 16px 20px;
}
.stat-card .num {
  font-family: var(--f-heading); font-size: 2rem; font-weight: 700;
  color: var(--c-fg); line-height: 1.1;
}
.stat-card .lbl {
  font-size: 11px; color: var(--c-fg-3); margin-top: 4px;
  text-transform: uppercase; letter-spacing: 0.05em;
}

/* Grid */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }

/* Card */
.card {
  background: var(--c-bg-light); border: 1px solid var(--c-border);
  border-radius: var(--radius); padding: 20px 24px;
  transition: border-color 0.2s;
}
.card:hover { border-color: var(--c-border-light); }
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.platform-icon { font-size: 28px; line-height: 1; }
.platform-name {
  font-family: var(--f-heading); font-size: 1rem; font-weight: 600;
}
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--c-green);
  display: inline-block; margin-left: auto; flex-shrink: 0;
}

/* Info rows */
.info-row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; color: var(--c-fg-3); }
.info-row span:last-child { color: var(--c-fg-2); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--f-mono); font-size: 12px; }

/* Actions */
.actions { margin-top: 16px; display: flex; gap: 10px; }
.btn {
  font-family: var(--f-body); font-size: 13px; font-weight: 600;
  padding: 7px 18px; border-radius: 20px; cursor: pointer;
  transition: all 0.15s; text-decoration: none; display: inline-block;
  border: 1px solid var(--c-border-light); background: transparent; color: var(--c-fg-2);
}
.btn:hover { background: rgba(0,0,0,0.04); }
.btn-primary { background: var(--c-fg); color: var(--c-bg); border-color: var(--c-fg); }
.btn-primary:hover { opacity: 0.85; }
.btn-accent { background: var(--c-accent); color: #fff; border-color: var(--c-accent); }
.btn-accent:hover { background: var(--c-accent-2); }

/* Empty */
.empty { color: var(--c-fg-3); text-align: center; padding: 64px 24px; grid-column: 1 / -1; }
.empty .icon { font-size: 40px; margin-bottom: 12px; }
.empty .msg { font-size: 0.95rem; }
.empty .hint { font-size: 0.8rem; color: var(--c-fg-3); margin-top: 6px; }

/* Error */
.error-bar { color: var(--c-red); background: #fef6f5; border: 1px solid #fce8e5; border-radius: var(--radius); padding: 12px 16px; margin-bottom: 20px; font-size: 13px; }

/* Toast */
.toast {
  position: fixed; bottom: 24px; right: 24px;
  background: var(--c-fg); color: var(--c-bg);
  padding: 10px 20px; border-radius: 20px; font-size: 13px;
  z-index: 100; opacity: 0; transition: opacity 0.2s;
  pointer-events: none;
}
.toast.show { opacity: 1; }
</style>
</head>
<body>

<div class="topbar">
  <div class="logo">
    <svg width="28" height="28" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="var(--c-bg)"/><rect x="12" y="14" width="24" height="24" rx="4" fill="var(--c-accent)"/><rect x="16" y="21" width="16" height="2" rx="1" fill="#fff"/><rect x="16" y="25" width="12" height="2" rx="1" fill="#fff" opacity="0.6"/><rect x="16" y="29" width="14" height="2" rx="1" fill="#fff" opacity="0.5"/></svg>
    <span class="brand-name">矩阵账号面板</span>
    <span class="brand-desc">Bit Browser CDP 直连 · 多平台矩阵统一视图</span>
  </div>
  <div class="scan-info">
    <span class="dot" id="status-dot"></span>
    <span style="font-size:12px;color:var(--c-fg-3);" id="scan-label">扫描中...</span>
  </div>
</div>

<div class="wrap">
  <div class="hero">
    <h1>账号矩阵</h1>
    <p class="desc">自动发现比特浏览器中已登录的平台窗口，统一查看与操控</p>
  </div>

  <div id="error"></div>

  <div class="stats-row">
    <div class="stat-card"><div class="num" id="stat-total">0</div><div class="lbl">在线账号</div></div>
    <div class="stat-card"><div class="num" id="stat-platforms">0</div><div class="lbl">覆盖平台</div></div>
    <div class="stat-card"><div class="num" id="stat-cdp">0</div><div class="lbl">CDP 端口</div></div>
  </div>

  <div class="grid" id="grid"><div class="empty"><div class="icon">🪟</div><div class="msg">没有发现已登录的账号窗口</div><div class="hint">在比特浏览器中打开一个登录了平台的窗口即可自动发现</div></div></div>
</div>

<div class="toast" id="toast"></div>

<script>
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

async function load() {
  try {
    const r = await fetch('/api/accounts');
    const data = await r.json();
    const dt = data.last_scan ? new Date(data.last_scan) : null;
    document.getElementById('scan-label').textContent =
      dt ? '最后扫描 ' + dt.toLocaleTimeString() : '等待首次扫描';
    const dot = document.getElementById('status-dot');
    if (data.error) { dot.className = 'dot err'; }
    else { dot.className = 'dot'; }
    renderAccounts(data.accounts);
    if (data.error) {
      document.getElementById('error').innerHTML = '<div class="error-bar">扫描异常: ' + data.error + '</div>';
    } else {
      document.getElementById('error').innerHTML = '';
    }
  } catch(e) {
    document.getElementById('scan-label').textContent = '服务离线';
    document.getElementById('status-dot').className = 'dot err';
    document.getElementById('error').innerHTML = '<div class="error-bar">无法连接面板服务: ' + e.message + '</div>';
  }
}

function renderAccounts(accounts) {
  const grid = document.getElementById('grid');
  const platforms = new Set(accounts.map(a => a.platform.name));

  document.getElementById('stat-total').textContent = accounts.length;
  document.getElementById('stat-platforms').textContent = platforms.size;
  document.getElementById('stat-cdp').textContent = accounts.length;

  if (!accounts || accounts.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="icon">🪟</div><div class="msg">没有发现已登录的账号窗口</div><div class="hint">在比特浏览器中打开一个登录了平台的窗口即可自动发现</div></div>';
    return;
  }
  grid.innerHTML = accounts.map((a, i) => `
    <div class="card">
      <div class="card-header">
        <span class="platform-icon">${a.platform.icon}</span>
        <span class="platform-name">${a.platform.name}</span>
        <span style="font-size:11px;color:var(--c-fg-3);">#${i+1}</span>
        <span class="status-dot" title="在线"></span>
      </div>
      <div class="info-row"><span>CDP 端口</span><span>${a.port}</span></div>
      <div class="info-row"><span>Chrome</span><span>v${a.chrome_version}</span></div>
      <div class="info-row"><span>当前页面</span><span>${(a.pages[0]||{}).title||'-'}</span></div>
      <div class="info-row"><span>发现时间</span><span>${new Date(a.discovered_at).toLocaleTimeString()}</span></div>
      <div class="actions">
        <a class="btn btn-primary" href="${a.platform.creator_url}" target="_blank">创作中心</a>
        <span class="btn" onclick="copyPort('${a.port}', this)">复制端口</span>
      </div>
    </div>
  `).join('');
}

function copyPort(port, el) {
  navigator.clipboard.writeText(port).then(() => {
    el.textContent = '已复制';
    setTimeout(() => { el.textContent = '复制端口'; }, 1500);
  });
}

load();
setInterval(load, 10000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress logs

    def _json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _html(self, html, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/" or path == "/dashboard":
            self._html(DASHBOARD_HTML)

        elif path == "/api/accounts":
            self._json({
                "accounts": state["accounts"],
                "last_scan": state["last_scan"],
                "error": state["scan_error"],
            })

        elif path == "/api/scan":
            try:
                accounts = scan_cdp_ports()
                state["accounts"] = accounts
                state["last_scan"] = datetime.now().isoformat()
                state["scan_error"] = None
                self._json({"ok": True, "count": len(accounts), "accounts": accounts})
            except Exception as e:
                self._json({"ok": False, "error": str(e)}, 500)

        elif path == "/health":
            self._json({"ok": True, "port": PORT})

        else:
            self._json({"error": "Not found"}, 404)


def start():
    threading.Thread(target=background_scanner, daemon=True).start()
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Bit Browser Panel running at http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    start()
