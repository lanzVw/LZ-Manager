# QAQManager FlairX - XInput Native Gamepad Helper (PowerShell)
# Polls XInput controllers and foreground process for Back+Start hotkey.

$ErrorActionPreference = 'SilentlyContinue'

if (-not ('FlairXXInputNative' -as [type])) {
$nativeCode = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class FlairXXInputNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_GAMEPAD {
        public ushort wButtons;
        public byte bLeftTrigger;
        public byte bRightTrigger;
        public short sThumbLX;
        public short sThumbLY;
        public short sThumbRX;
        public short sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_STATE {
        public uint dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    private static extern int XInputGetState14(int dwUserIndex, ref XINPUT_STATE pState);

    [DllImport("xinput1_3.dll", EntryPoint = "XInputGetState")]
    private static extern int XInputGetState13(int dwUserIndex, ref XINPUT_STATE pState);

    [DllImport("xinput9_1_0.dll", EntryPoint = "XInputGetState")]
    private static extern int XInputGetState910(int dwUserIndex, ref XINPUT_STATE pState);

    private static int dllVersion = 0; // 0 = uninit, 14, 13, 910, -1 = none

    public static int GetState(int dwUserIndex, ref XINPUT_STATE pState) {
        if (dllVersion == 0) {
            try {
                int res = XInputGetState14(dwUserIndex, ref pState);
                dllVersion = 14;
                return res;
            } catch {
                try {
                    int res = XInputGetState13(dwUserIndex, ref pState);
                    dllVersion = 13;
                    return res;
                } catch {
                    try {
                        int res = XInputGetState910(dwUserIndex, ref pState);
                        dllVersion = 910;
                        return res;
                    } catch {
                        dllVersion = -1;
                        return 1167; // ERROR_DEVICE_NOT_CONNECTED
                    }
                }
            }
        } else if (dllVersion == 14) {
            return XInputGetState14(dwUserIndex, ref pState);
        } else if (dllVersion == 13) {
            return XInputGetState13(dwUserIndex, ref pState);
        } else if (dllVersion == 910) {
            return XInputGetState910(dwUserIndex, ref pState);
        }
        return 1167;
    }

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, StringBuilder lpExeName, ref uint lpdwSize);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr hObject);

    public static string GetForegroundProcessName() {
        IntPtr hWnd = GetForegroundWindow();
        if (hWnd == IntPtr.Zero) return "";
        uint pid = 0;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid == 0) return "";
        IntPtr hProc = OpenProcess(0x1000, false, pid);
        if (hProc == IntPtr.Zero) return "";
        StringBuilder sb = new StringBuilder(1024);
        uint size = (uint)sb.Capacity;
        bool ok = QueryFullProcessImageName(hProc, 0, sb, ref size);
        CloseHandle(hProc);
        if (ok && sb.Length > 0) {
            return System.IO.Path.GetFileName(sb.ToString());
        }
        return "";
    }
}
"@
Add-Type -TypeDefinition $nativeCode
}

$state = New-Object FlairXXInputNative+XINPUT_STATE
$COMBO_MASK = 0x0030
$heldSince = 0
$triggered = $false
$cooldownUntil = 0
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

Write-Output '{"status":"ready","engine":"powershell"}'

while ($true) {
    $now = $stopwatch.ElapsedMilliseconds
    $comboPressed = $false

    for ($i = 0; $i -lt 4; $i++) {
        $res = [FlairXXInputNative]::GetState($i, [ref]$state)
        if ($res -eq 0) {
            if (($state.Gamepad.wButtons -band $COMBO_MASK) -eq $COMBO_MASK) {
                $comboPressed = $true
                break
            }
        }
    }

    if ($comboPressed) {
        if ($heldSince -eq 0) {
            $heldSince = $now
        }
        $duration = $now - $heldSince
        if ($duration -ge 150 -and -not $triggered) {
            if ($now -ge $cooldownUntil) {
                $triggered = $true
                $cooldownUntil = $now + 500
                $fgExe = [FlairXXInputNative]::GetForegroundProcessName()
                $json = @{
                    event = "combo"
                    buttons = "Back+Start"
                    duration = [math]::Round($duration)
                    foregroundExe = $fgExe
                } | ConvertTo-Json -Compress
                Write-Output $json
            }
        }
    } else {
        $heldSince = 0
        $triggered = $false
    }

    Start-Sleep -Milliseconds 20
}
