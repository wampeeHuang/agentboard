// 工具架 · Agentboard 托盘宿主
// 职责：保证 http://localhost:3099 永远有人监听；托盘提供打开/重启/日志/自启入口。
// 设计要点：node 服务以独立进程启动，退出托盘不影响服务；托盘只负责探测与拉起。
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    const int Port = 3099;
    const string PanelUrl = @"http://localhost:3099/";
    const string BaseDir = @"C:\Users\Administrator\.agentboard";
    const string NodePath = @"C:\Program Files\nodejs\node.exe";
    const string RunDir = @"C:\Users\Administrator\.agentboard\data\_runtime";
    const string ServiceLog = @"C:\Users\Administrator\.agentboard\data\_runtime\agentboard-3099.out.log";
    const string TrayLog = @"C:\Users\Administrator\.agentboard\data\_runtime\tray.log";
    const int ProbeTimeoutMs = 400;
    const int TickMs = 5000;
    const int MinRestartGapSec = 20;

    static Mutex _mutex;
    static NotifyIcon _tray;
    static System.Windows.Forms.Timer _timer;
    static ToolStripMenuItem _statusItem;
    static ToolStripMenuItem _autostartItem;
    static DateTime _lastStart = DateTime.MinValue;
    static bool _lastKnownUp = false;
    static int _consecutiveFailures = 0;
    static Icon _icon;

    static string StartupLnk
    {
        get
        {
            return Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Startup),
                "工具架.lnk");
        }
    }

    [STAThread]
    static void Main(string[] args)
    {
        bool isNew;
        _mutex = new Mutex(true, @"Local\AgentboardTray_3099", out isNew);
        if (!isNew)
        {
            // 第二个实例：当作"打开工具架"
            Log("second instance -> open panel");
            OpenPanel();
            return;
        }

        Directory.CreateDirectory(RunDir);
        Log("tray start, pid=" + Process.GetCurrentProcess().Id);

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        BuildTray();
        EnsureService("startup");

        _timer = new System.Windows.Forms.Timer();
        _timer.Interval = TickMs;
        _timer.Tick += delegate { Watchdog(); };
        _timer.Start();

        Application.Run(new ApplicationContext());
    }

    // ---------------- 托盘 ----------------

    static void BuildTray()
    {
        try { _icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        if (_icon == null) _icon = SystemIcons.Application;

        var menu = new ContextMenuStrip();

        var open = new ToolStripMenuItem("打开工具架");
        open.Font = new Font(open.Font, FontStyle.Bold);
        open.Click += delegate { OpenPanel(); };
        menu.Items.Add(open);

        _statusItem = new ToolStripMenuItem("状态探测中…");
        _statusItem.Enabled = false;
        menu.Items.Add(_statusItem);

        var restart = new ToolStripMenuItem("重启服务");
        restart.Click += delegate { RestartService(); };
        menu.Items.Add(restart);

        var logs = new ToolStripMenuItem("打开日志目录");
        logs.Click += delegate { try { Process.Start("explorer.exe", RunDir); } catch { } };
        menu.Items.Add(logs);

        menu.Items.Add(new ToolStripSeparator());

        _autostartItem = new ToolStripMenuItem("开机自动启动");
        _autostartItem.Checked = File.Exists(StartupLnk);
        _autostartItem.Click += delegate { ToggleAutostart(); };
        menu.Items.Add(_autostartItem);

        menu.Items.Add(new ToolStripSeparator());

        var quit = new ToolStripMenuItem("退出托盘（服务继续运行）");
        quit.Click += delegate
        {
            Log("tray exit by user");
            if (_tray != null) { _tray.Visible = false; _tray.Dispose(); }
            Application.Exit();
        };
        menu.Items.Add(quit);

        _tray = new NotifyIcon();
        _tray.Icon = _icon;
        _tray.Text = "工具架 · Agentboard";
        _tray.ContextMenuStrip = menu;
        _tray.Visible = true;
        _tray.DoubleClick += delegate { OpenPanel(); };
    }

    static void UpdateStatus(bool up)
    {
        if (_statusItem == null) return;
        _statusItem.Text = up
            ? "服务运行中 · 127.0.0.1:" + Port
            : "服务已停止 · 等待拉起";
        if (_tray != null)
            _tray.Text = up ? "工具架 · 运行中 (:3099)" : "工具架 · 已停止";
    }

    // ---------------- 服务探测与拉起 ----------------

    static bool PortOpen()
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", Port, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(ProbeTimeoutMs)) return false;
                c.EndConnect(ar);
                return true;
            }
        }
        catch { return false; }
    }

    static void EnsureService(string reason)
    {
        if (PortOpen()) return;
        if ((DateTime.Now - _lastStart).TotalSeconds < MinRestartGapSec)
        {
            Log("skip start (" + reason + "): too soon since last attempt");
            return;
        }
        _lastStart = DateTime.Now;

        if (!File.Exists(NodePath))
        {
            Log("ERROR node not found: " + NodePath);
            Balloon("找不到 node", "预期的 node 路径不存在：" + NodePath);
            return;
        }
        if (!File.Exists(Path.Combine(BaseDir, "server.js")))
        {
            Log("ERROR server.js not found in " + BaseDir);
            Balloon("找不到 server.js", "目录：" + BaseDir);
            return;
        }

        try
        {
            var psi = new ProcessStartInfo(NodePath, "server.js");
            psi.WorkingDirectory = BaseDir;
            psi.UseShellExecute = true;
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            var p = Process.Start(psi);
            Log("started node pid=" + (p != null ? p.Id : 0) + " reason=" + reason);
        }
        catch (Exception ex)
        {
            Log("start failed: " + ex.Message);
            Balloon("启动失败", ex.Message);
        }
    }

    static void Watchdog()
    {
        bool up = PortOpen();
        UpdateStatus(up);

        if (up)
        {
            _consecutiveFailures = 0;
            if (!_lastKnownUp)
            {
                Log("service is up");
                if (_lastKnownUp != up && _everDown) Balloon("工具架已恢复", "127.0.0.1:" + Port + " 可以访问了");
            }
            _lastKnownUp = true;
            return;
        }

        _lastKnownUp = false;
        _everDown = true;
        _consecutiveFailures++;
        Log("service down (failure #" + _consecutiveFailures + "), trying to start");
        EnsureService("watchdog");
    }

    static bool _everDown = false;

    static void RestartService()
    {
        Log("manual restart requested");
        // 找到占用端口的 node 并结束，再由 EnsureService 拉起
        try
        {
            var psi = new ProcessStartInfo("cmd.exe",
                "/c for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :" + Port + " ^| findstr LISTENING') do taskkill /F /PID %a");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.WorkingDirectory = RunDir;
            Process.Start(psi);
        }
        catch (Exception ex) { Log("kill port failed: " + ex.Message); }

        ThreadPool.QueueUserWorkItem(delegate
        {
            for (int i = 0; i < 20 && PortOpen(); i++) Thread.Sleep(200);
            _lastStart = DateTime.MinValue;
            EnsureService("manual-restart");
        });
    }

    static void OpenPanel()
    {
        try
        {
            if (!PortOpen()) EnsureService("open-panel");
            Process.Start(new ProcessStartInfo(PanelUrl) { UseShellExecute = true });
        }
        catch (Exception ex) { Log("open panel failed: " + ex.Message); }
    }

    // ---------------- 自启 ----------------

    static void ToggleAutostart()
    {
        try
        {
            if (File.Exists(StartupLnk))
            {
                File.Delete(StartupLnk);
                Log("autostart disabled");
            }
            else
            {
                var t = Type.GetTypeFromProgID("WScript.Shell");
                object sh = Activator.CreateInstance(t);
                object lnk = t.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod,
                    null, sh, new object[] { StartupLnk });
                var lt = lnk.GetType();
                lt.InvokeMember("TargetPath", System.Reflection.BindingFlags.SetProperty, null, lnk,
                    new object[] { Application.ExecutablePath });
                lt.InvokeMember("WorkingDirectory", System.Reflection.BindingFlags.SetProperty, null, lnk,
                    new object[] { Path.GetDirectoryName(Application.ExecutablePath) });
                lt.InvokeMember("IconLocation", System.Reflection.BindingFlags.SetProperty, null, lnk,
                    new object[] { Application.ExecutablePath + ",0" });
                lt.InvokeMember("Description", System.Reflection.BindingFlags.SetProperty, null, lnk,
                    new object[] { "工具架 · Agentboard 托盘宿主" });
                lt.InvokeMember("Save", System.Reflection.BindingFlags.InvokeMethod, null, lnk, null);
                Log("autostart enabled -> " + StartupLnk);
            }
        }
        catch (Exception ex) { Log("toggle autostart failed: " + ex.Message); }

        if (_autostartItem != null) _autostartItem.Checked = File.Exists(StartupLnk);
    }

    // ---------------- 杂项 ----------------

    static void Balloon(string title, string text)
    {
        try
        {
            if (_tray == null) return;
            _tray.BalloonTipTitle = title;
            _tray.BalloonTipText = text;
            _tray.ShowBalloonTip(4000);
        }
        catch { }
    }

    static void Log(string msg)
    {
        try
        {
            Directory.CreateDirectory(RunDir);
            File.AppendAllText(TrayLog,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + msg + Environment.NewLine,
                new UTF8Encoding(false));
        }
        catch { }
    }
}
