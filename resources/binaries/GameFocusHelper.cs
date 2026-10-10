using System;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.IO;
using System.Diagnostics;

public class GameFocusHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    private static string GetProcessName(IntPtr hWnd, out uint pid) {
        pid = 0;
        if (hWnd == IntPtr.Zero) return "";
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == 0) return "";

        try {
            IntPtr hProc = OpenProcess(0x1000, false, pid);
            if (hProc != IntPtr.Zero) {
                StringBuilder sb = new StringBuilder(1024);
                uint size = (uint)sb.Capacity;
                bool ok = QueryFullProcessImageName(hProc, 0, sb, ref size);
                CloseHandle(hProc);
                if (ok && sb.Length > 0) {
                    return Path.GetFileName(sb.ToString());
                }
            }
        } catch {}

        try {
            var p = Process.GetProcessById((int)pid);
            if (p != null) {
                string name = p.ProcessName;
                if (!name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
                    name += ".exe";
                }
                return name;
            }
        } catch {}

        return "";
    }

    private static string GetTitle(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return "";
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(hWnd, sb, sb.Capacity);
        return sb.ToString();
    }

    public static void Main(string[] args) {
        // stdout 重定向时默认按 ANSI/OEM 代码页写出，中文窗口标题（GBK）进入
        // Node 端按 UTF-8 解析必然乱码导致"智能跟随"匹配失败，必须显式切 UTF-8
        try { Console.OutputEncoding = System.Text.Encoding.UTF8; } catch {}

        bool watch = args.Length > 0 && (args[0] == "--watch" || args[0] == "-w");

        if (!watch) {
            uint pid;
            IntPtr fg = GetForegroundWindow();
            string proc = GetProcessName(fg, out pid);
            string title = GetTitle(fg);
            Console.WriteLine("{{\"process\":\"{0}\",\"title\":\"{1}\",\"pid\":{2}}}", EscapeJson(proc), EscapeJson(title), pid);
            return;
        }

        IntPtr lastHwnd = IntPtr.Zero;
        while (true) {
            try {
                IntPtr fg = GetForegroundWindow();
                if (fg != lastHwnd) {
                    lastHwnd = fg;
                    uint pid;
                    string proc = GetProcessName(fg, out pid);
                    string title = GetTitle(fg);
                    Console.WriteLine("{{\"process\":\"{0}\",\"title\":\"{1}\",\"pid\":{2}}}", EscapeJson(proc), EscapeJson(title), pid);
                    Console.Out.Flush();
                }
            } catch {}
            Thread.Sleep(200);
        }
    }

    private static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
    }
}
