using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class ReloadHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    private const uint WM_KEYDOWN = 0x0100;
    private const uint WM_KEYUP = 0x0101;
    private const byte VK_F10 = 0x79;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const int SW_RESTORE = 9;

    private static readonly string[] KNOWN_GAME_PROCESSES = new string[] {
        "ZenlessZoneZero", "ZZZ", "ZenlessZoneZero_Data",
        "Endfield", "EndfieldGame",
        "Client-Win64-Shipping", "Wuthering Waves", "WutheringWaves",
        "StarRail", "StarRailBase",
        "HTGame", "NTELauncher", "NevernessToEverness",
        "YuanShen", "GenshinImpact",
        "BH3"
    };

    private static bool IsExtendedKey(byte vk) {
        return vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 || // Arrow keys
               vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 || // PageUp, PageDown, End, Home
               vk == 0x2D || vk == 0x2E ||                             // Insert, Delete
               vk == 0xA1 || vk == 0xA3 || vk == 0xA5;                 // Right Shift/Ctrl/Alt
    }

    private static byte ResolveVk(string s) {
        if (string.IsNullOrEmpty(s)) return 0;
        s = s.Trim().ToUpperInvariant();
        if (s.StartsWith("0X")) {
            try { return Convert.ToByte(s.Substring(2), 16); } catch {}
        }
        byte parsed;
        if (byte.TryParse(s, out parsed)) return parsed;

        switch (s) {
            case "VK_CONTROL": case "CONTROL": case "CTRL": case "LCTRL": return 0x11;
            case "VK_RCONTROL": case "RCTRL": return 0xA3;
            case "VK_MENU": case "MENU": case "ALT": case "LALT": return 0x12;
            case "VK_RMENU": case "RALT": return 0xA5;
            case "VK_SHIFT": case "SHIFT": case "LSHIFT": return 0x10;
            case "VK_RSHIFT": case "R-SHIFT": case "RSHIFT": return 0xA1;
            case "VK_UP": case "UP": case "↑": return 0x26;
            case "VK_DOWN": case "DOWN": case "↓": return 0x28;
            case "VK_LEFT": case "LEFT": case "←": return 0x25;
            case "VK_RIGHT": case "RIGHT": case "→": return 0x27;
            case "VK_SPACE": case "SPACE": return 0x20;
            case "VK_RETURN": case "RETURN": case "ENTER": return 0x0D;
            case "VK_ESCAPE": case "ESCAPE": case "ESC": return 0x1B;
            case "VK_TAB": case "TAB": return 0x09;
            case "VK_BACK": case "BACKSPACE": case "BACK": return 0x08;
            case "VK_PRIOR": case "PAGEUP": return 0x21;
            case "VK_NEXT": case "PAGEDOWN": return 0x22;
            case "VK_HOME": case "HOME": return 0x24;
            case "VK_END": case "END": return 0x23;
            case "VK_INSERT": case "INSERT": return 0x2D;
            case "VK_DELETE": case "DELETE": case "DEL": return 0x2E;
            case "VK_CAPITAL": case "CAPS": case "CAPITAL": return 0x14;
        }

        if (s.StartsWith("VK_")) {
            string rest = s.Substring(3);
            if (rest.Length == 1 && rest[0] >= 'A' && rest[0] <= 'Z') return (byte)rest[0];
            if (rest.Length == 1 && rest[0] >= '0' && rest[0] <= '9') return (byte)rest[0];
            if (rest.StartsWith("F")) {
                int fNum;
                if (int.TryParse(rest.Substring(1), out fNum) && fNum >= 1 && fNum <= 24) {
                    return (byte)(0x6F + fNum);
                }
            }
        }

        if (s.StartsWith("F")) {
            int fn;
            if (int.TryParse(s.Substring(1), out fn) && fn >= 1 && fn <= 24) {
                return (byte)(0x6F + fn);
            }
        }

        if (s.Length == 1 && s[0] >= 'A' && s[0] <= 'Z') return (byte)s[0];
        if (s.Length == 1 && s[0] >= '0' && s[0] <= '9') return (byte)s[0];

        return 0;
    }

    public static void Main(string[] args) {
        string targetProc = "";
        List<byte> vkList = new List<byte>();

        for (int i = 0; i < args.Length; i++) {
            string arg = args[i].Trim();
            if (arg.Equals("--keys", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length) {
                string keysRaw = args[++i];
                string[] parts = keysRaw.Split(new char[] { ',', '+', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string p in parts) {
                    byte b = ResolveVk(p);
                    if (b != 0) vkList.Add(b);
                }
            } else if (arg.StartsWith("--keys=", StringComparison.OrdinalIgnoreCase)) {
                string keysRaw = arg.Substring(7);
                string[] parts = keysRaw.Split(new char[] { ',', '+', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string p in parts) {
                    byte b = ResolveVk(p);
                    if (b != 0) vkList.Add(b);
                }
            } else if (!arg.StartsWith("-")) {
                targetProc = arg;
            }
        }

        if (targetProc.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) {
            targetProc = targetProc.Substring(0, targetProc.Length - 4);
        }

        // 默认若未指定具体按键，则为 F10
        if (vkList.Count == 0) {
            vkList.Add(VK_F10);
        }

        IntPtr gameHwnd = IntPtr.Zero;
        string foundProcName = "";
        uint foundPid = 0;

        // 1. 查找游戏主窗口
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return true;

            try {
                var proc = Process.GetProcessById((int)pid);
                string pName = proc.ProcessName;

                // 若指定了目标进程，优先匹配
                if (!string.IsNullOrEmpty(targetProc)) {
                    if (string.Equals(pName, targetProc, StringComparison.OrdinalIgnoreCase)) {
                        gameHwnd = hWnd;
                        foundProcName = pName;
                        foundPid = pid;
                        return false;
                    }
                }

                // 匹配已知主流游戏进程
                foreach (var kg in KNOWN_GAME_PROCESSES) {
                    if (string.Equals(pName, kg, StringComparison.OrdinalIgnoreCase)) {
                        gameHwnd = hWnd;
                        foundProcName = pName;
                        foundPid = pid;
                        return false;
                    }
                }
            } catch {}

            return true;
        }, IntPtr.Zero);

        if (gameHwnd != IntPtr.Zero) {
            uint curThread = GetCurrentThreadId();
            uint gameThread = 0;
            GetWindowThreadProcessId(gameHwnd, out gameThread);

            try {
                if (gameThread != 0 && curThread != 0) {
                    AttachThreadInput(curThread, gameThread, true);
                }
            } catch {}

            // 将游戏窗口置为前台焦点
            ShowWindow(gameHwnd, SW_RESTORE);
            SetForegroundWindow(gameHwnd);
            BringWindowToTop(gameHwnd);

            // 1. 依次按下所有组合按键
            for (int i = 0; i < vkList.Count; i++) {
                byte vk = vkList[i];
                byte scan = (byte)MapVirtualKey(vk, 0);
                uint flags = IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u;

                PostMessage(gameHwnd, WM_KEYDOWN, (IntPtr)vk, IntPtr.Zero);
                keybd_event(vk, scan, flags, UIntPtr.Zero);
                Thread.Sleep(15);
            }

            // 保持按下状态 50ms
            Thread.Sleep(50);

            // 2. 逆序松开所有按键
            for (int i = vkList.Count - 1; i >= 0; i--) {
                byte vk = vkList[i];
                byte scan = (byte)MapVirtualKey(vk, 0);
                uint flags = (IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u) | KEYEVENTF_KEYUP;

                PostMessage(gameHwnd, WM_KEYUP, (IntPtr)vk, (IntPtr)0xC0000001);
                keybd_event(vk, scan, flags, UIntPtr.Zero);
                Thread.Sleep(15);
            }

            try {
                if (gameThread != 0 && curThread != 0) {
                    AttachThreadInput(curThread, gameThread, false);
                }
            } catch {}

            Console.WriteLine("{{\"success\":true,\"process\":\"{0}\",\"pid\":{1},\"hwnd\":\"{2}\",\"keysCount\":{3}}}", foundProcName, foundPid, gameHwnd.ToInt64(), vkList.Count);
        } else {
            // 降级兜底：未匹配到具体游戏窗口时，发送全局前台击键
            for (int i = 0; i < vkList.Count; i++) {
                byte vk = vkList[i];
                byte scan = (byte)MapVirtualKey(vk, 0);
                uint flags = IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u;
                keybd_event(vk, scan, flags, UIntPtr.Zero);
                Thread.Sleep(15);
            }

            Thread.Sleep(50);

            for (int i = vkList.Count - 1; i >= 0; i--) {
                byte vk = vkList[i];
                byte scan = (byte)MapVirtualKey(vk, 0);
                uint flags = (IsExtendedKey(vk) ? KEYEVENTF_EXTENDEDKEY : 0u) | KEYEVENTF_KEYUP;
                keybd_event(vk, scan, flags, UIntPtr.Zero);
                Thread.Sleep(15);
            }

            Console.WriteLine("{{\"success\":true,\"fallback\":true,\"keysCount\":{0}}}", vkList.Count);
        }
    }
}
