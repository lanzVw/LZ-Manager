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
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool SetProcessWindowStation(IntPtr hWinSta);

    [DllImport("user32.dll")]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)]
        public MOUSEINPUT mi;
        [FieldOffset(0)]
        public KEYBDINPUT ki;
        [FieldOffset(0)]
        public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const byte VK_F10 = 0x79;
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

    private class WindowCandidate {
        public IntPtr Hwnd;
        public string ProcessName;
        public uint Pid;
        public string Title;
        public string ClassName;
        public int Width;
        public int Height;
        public int Score;
    }

    private const uint WM_KEYDOWN = 0x0100;
    private const uint WM_KEYUP = 0x0101;
    private const uint WM_SYSKEYDOWN = 0x0104;
    private const uint WM_SYSKEYUP = 0x0105;

    private static void SendKeySequence(IntPtr targetHwnd, List<byte> vkList, int holdMs) {
        if (vkList.Count == 0) return;

        // 1. 发送 PostMessage 消息（直接投递至目标窗口消息队列；F10 在 Win32 属于系统键 WM_SYSKEYDOWN）
        if (targetHwnd != IntPtr.Zero) {
            foreach (byte vk in vkList) {
                uint scan = MapVirtualKey(vk, 0);
                long lparamVal = 1 | (scan << 16);
                if (IsExtendedKey(vk)) lparamVal |= (1 << 24);
                if (vk == VK_F10) {
                    PostMessage(targetHwnd, WM_SYSKEYDOWN, (IntPtr)vk, (IntPtr)lparamVal);
                }
                PostMessage(targetHwnd, WM_KEYDOWN, (IntPtr)vk, (IntPtr)lparamVal);
            }
        }

        // 2. 依次按下硬件级按键 (SendInput)
        INPUT[] downInputs = new INPUT[vkList.Count];
        for (int i = 0; i < vkList.Count; i++) {
            byte vk = vkList[i];
            ushort scan = (ushort)MapVirtualKey(vk, 0);
            uint flags = 0;
            if (IsExtendedKey(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            downInputs[i] = new INPUT {
                type = INPUT_KEYBOARD,
                u = new InputUnion {
                    ki = new KEYBDINPUT {
                        wVk = (ushort)vk,
                        wScan = scan,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            };
        }
        SendInput((uint)downInputs.Length, downInputs, Marshal.SizeOf(typeof(INPUT)));

        // 3. 保持指定毫秒（确保 3DMigoto 与游戏渲染帧检测到按键并命中 $active == 1）
        Thread.Sleep(holdMs);

        // 4. 发送 PostMessage KEYUP
        if (targetHwnd != IntPtr.Zero) {
            for (int i = vkList.Count - 1; i >= 0; i--) {
                byte vk = vkList[i];
                uint scan = MapVirtualKey(vk, 0);
                long lparamVal = 1 | (scan << 16) | (1 << 30) | (1 << 31);
                if (IsExtendedKey(vk)) lparamVal |= (1 << 24);
                if (vk == VK_F10) {
                    PostMessage(targetHwnd, WM_SYSKEYUP, (IntPtr)vk, (IntPtr)lparamVal);
                }
                PostMessage(targetHwnd, WM_KEYUP, (IntPtr)vk, (IntPtr)lparamVal);
            }
        }

        // 5. 逆序松开按键 (SendInput)
        INPUT[] upInputs = new INPUT[vkList.Count];
        for (int i = 0; i < vkList.Count; i++) {
            byte vk = vkList[vkList.Count - 1 - i];
            ushort scan = (ushort)MapVirtualKey(vk, 0);
            uint flags = KEYEVENTF_KEYUP;
            if (IsExtendedKey(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            upInputs[i] = new INPUT {
                type = INPUT_KEYBOARD,
                u = new InputUnion {
                    ki = new KEYBDINPUT {
                        wVk = (ushort)vk,
                        wScan = scan,
                        dwFlags = flags,
                        time = 0,
                        dwExtraInfo = UIntPtr.Zero
                    }
                }
            };
        }
        SendInput((uint)upInputs.Length, upInputs, Marshal.SizeOf(typeof(INPUT)));
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

        List<WindowCandidate> candidates = new List<WindowCandidate>();

        EnumWindowsProc enumCallback = (hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;

            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return true;

            try {
                var proc = Process.GetProcessById((int)pid);
                string pName = proc.ProcessName;

                bool matchesTarget = !string.IsNullOrEmpty(targetProc) && string.Equals(pName, targetProc, StringComparison.OrdinalIgnoreCase);
                bool matchesKnown = false;
                if (!matchesTarget) {
                    foreach (var kg in KNOWN_GAME_PROCESSES) {
                        if (string.Equals(pName, kg, StringComparison.OrdinalIgnoreCase)) {
                            matchesKnown = true;
                            break;
                        }
                    }
                }

                if (!matchesTarget && !matchesKnown) return true;

                RECT rect;
                GetClientRect(hWnd, out rect);
                int w = rect.Right - rect.Left;
                int h = rect.Bottom - rect.Top;

                // 排除小于 150x150 的微缩/隐藏工具窗口（如 IME 等辅助窗口）
                if (w < 150 || h < 150) return true;

                StringBuilder sbTitle = new StringBuilder(256);
                GetWindowText(hWnd, sbTitle, 256);
                string title = sbTitle.ToString();

                StringBuilder sbClass = new StringBuilder(256);
                GetClassName(hWnd, sbClass, 256);
                string className = sbClass.ToString();

                int score = matchesTarget ? 1000 : 500;
                if (className.IndexOf("UnityWndClass", StringComparison.OrdinalIgnoreCase) >= 0) score += 300;
                if (!string.IsNullOrEmpty(title)) score += 100;
                if (!IsIconic(hWnd)) score += 50;
                score += Math.Min((w * h) / 10000, 200);

                candidates.Add(new WindowCandidate {
                    Hwnd = hWnd,
                    ProcessName = pName,
                    Pid = pid,
                    Title = title,
                    ClassName = className,
                    Width = w,
                    Height = h,
                    Score = score
                });
            } catch {}

            return true;
        };

        // 1. 优先挂载交互桌面 WinSta0\default 进行跨桌面枚举（解决 Node.js 子进程 EnumWindows 隔离返回 0 的问题）
        try {
            IntPtr hWinsta = OpenWindowStation("WinSta0", false, 0x037F);
            if (hWinsta != IntPtr.Zero) SetProcessWindowStation(hWinsta);
            IntPtr hDesk = OpenDesktop("default", 0, false, 0x01FF);
            if (hDesk != IntPtr.Zero) {
                EnumDesktopWindows(hDesk, enumCallback, IntPtr.Zero);
                CloseDesktop(hDesk);
            }
        } catch {}

        // 2. 若 Desktop 枚举无结果，降级使用标准 EnumWindows
        if (candidates.Count == 0) {
            EnumWindows(enumCallback, IntPtr.Zero);
        }

        WindowCandidate best = null;
        if (candidates.Count > 0) {
            candidates.Sort((a, b) => b.Score.CompareTo(a.Score));
            best = candidates[0];
        }

        if (best != null && best.Hwnd != IntPtr.Zero) {
            IntPtr gameHwnd = best.Hwnd;

            // 关键：挂钩当前持有前台锁的窗口线程（通常为悬浮窗），以解锁 SetForegroundWindow 权限
            IntPtr fgHwnd = GetForegroundWindow();
            uint fgThread = 0;
            if (fgHwnd != IntPtr.Zero) {
                GetWindowThreadProcessId(fgHwnd, out fgThread);
            }
            uint curThread = GetCurrentThreadId();

            bool attached = false;
            if (fgThread != 0 && fgThread != curThread) {
                try {
                    attached = AttachThreadInput(curThread, fgThread, true);
                } catch {}
            }

            // 将游戏主窗口置为前台焦点
            ShowWindow(gameHwnd, SW_RESTORE);
            BringWindowToTop(gameHwnd);
            SetForegroundWindow(gameHwnd);

            if (attached) {
                try {
                    AttachThreadInput(curThread, fgThread, false);
                } catch {}
            }

            // 给游戏渲染引擎 25ms 响应前台切换
            Thread.Sleep(25);

            // 双重保险：通过底层 SendInput + PostMessage 投递硬件与消息级按键，并保持 110ms 以可靠跨多帧命中 condition = $active == 1
            SendKeySequence(gameHwnd, vkList, 110);

            Console.WriteLine("{{\"success\":true,\"process\":\"{0}\",\"pid\":{1},\"hwnd\":\"{2}\",\"keysCount\":{3}}}",
                best.ProcessName, best.Pid, gameHwnd.ToInt64(), vkList.Count);
            Environment.Exit(0);
        } else {
            // 未找到对应游戏窗口：输出明确错误并返回非零退出码，触发 Node 端优雅降级
            Console.WriteLine("{{\"success\":false,\"error\":\"game_window_not_found\",\"targetProc\":\"{0}\"}}", targetProc);
            Environment.Exit(1);
        }
    }
}
