using System.Management;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Kitvi.Collector;

internal static class InventoryReader
{
    internal static DriveInfo[] ReadStorage()
    {
        var output = new List<DriveInfo>();
        foreach (var drive in System.IO.DriveInfo.GetDrives())
        {
            try
            {
                if (drive.DriveType is not (DriveType.Fixed or DriveType.Removable) || !drive.IsReady) continue;
                var name = drive.Name.TrimEnd('\\');
                var total = (ulong)drive.TotalSize; var free = Math.Min(total, (ulong)drive.TotalFreeSpace);
                output.Add(new(name, name, string.IsNullOrWhiteSpace(drive.VolumeLabel) ? drive.DriveType == DriveType.Removable ? "이동식 드라이브" : "로컬 디스크" : drive.VolumeLabel, total, free, total - free));
            }
            catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
        return output.ToArray();
    }

    internal static DisplayInfo[] ReadDisplays()
    {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var query = Wmi.Search("SELECT InstanceName, UserFriendlyName FROM WmiMonitorID WHERE Active = TRUE", @"root\wmi");
            using var rows = query.Get();
            foreach (ManagementObject row in rows)
            {
                using (row)
                {
                    var model = ModelKey(Wmi.Text(row, "InstanceName"));
                    var chars = row["UserFriendlyName"] as ushort[];
                    var name = chars is null ? "" : new string(chars.Where(c => c > 0).Select(c => (char)c).ToArray()).Trim();
                    if (model.Length > 0 && name.Length > 0) names[model] = name;
                }
            }
        }
        catch { } // Resolution can still be read when EDID is unavailable.
        var output = new List<DisplayInfo>();
        for (uint index = 0; ; index++)
        {
            var adapter = new DisplayDevice { Size = Marshal.SizeOf<DisplayDevice>() };
            if (!WindowsNative.EnumDisplayDevices(null, index, ref adapter, 0)) break;
            if ((adapter.StateFlags & 1) == 0 || (adapter.StateFlags & 8) != 0 || adapter.DeviceName is null) continue;
            var mode = new DisplayMode { Size = (ushort)Marshal.SizeOf<DisplayMode>() };
            var hasMode = WindowsNative.EnumDisplaySettings(adapter.DeviceName, -1, ref mode);
            var added = false;
            for (uint monitorIndex = 0; ; monitorIndex++)
            {
                var monitor = new DisplayDevice { Size = Marshal.SizeOf<DisplayDevice>() };
                if (!WindowsNative.EnumDisplayDevices(adapter.DeviceName, monitorIndex, ref monitor, 0)) break;
                if ((monitor.StateFlags & 1) == 0) continue;
                var model = ModelKey(monitor.DeviceId);
                names.TryGetValue(model, out var name);
                output.Add(new(adapter.DeviceName + "/" + monitorIndex, name,
                    hasMode && mode.PelsWidth > 0 ? (int)mode.PelsWidth : null, hasMode && mode.PelsHeight > 0 ? (int)mode.PelsHeight : null,
                    hasMode && mode.DisplayFrequency > 1 ? mode.DisplayFrequency : null, (adapter.StateFlags & 4) != 0));
                added = true;
            }
            if (!added) output.Add(new(adapter.DeviceName, null, hasMode ? (int)mode.PelsWidth : null, hasMode ? (int)mode.PelsHeight : null,
                hasMode && mode.DisplayFrequency > 1 ? mode.DisplayFrequency : null, (adapter.StateFlags & 4) != 0));
        }
        return output.OrderByDescending(d => d.Primary).ToArray();
    }

    private static string ModelKey(string? id) => id is null ? "" : Regex.Match(id, @"(?:DISPLAY|MONITOR)[\\#]([^\\#]+)", RegexOptions.IgnoreCase).Groups[1].Value;

    internal static DeviceInfo[] ReadDevices()
    {
        var output = new List<DeviceInfo>();
        using var query = Wmi.Search("SELECT Name, PNPClass, Manufacturer, Status, PNPDeviceID, ConfigManagerErrorCode FROM Win32_PnPEntity WHERE Present = TRUE");
        using var rows = query.Get();
        foreach (ManagementObject row in rows)
        {
            using (row)
            {
                var name = Wmi.Text(row, "Name"); var className = Wmi.Text(row, "PNPClass")?.ToUpperInvariant();
                if (name is null || className is null || !Classes.TryGetValue(className, out var type)) continue;
                var code = Wmi.Number(row, "ConfigManagerErrorCode");
                var status = code is > 0 ? $"문제 감지 · 코드 {code}" : code == 0 ? "정상" : Wmi.Text(row, "Status") ?? "확인 불가";
                var rawId = Wmi.Text(row, "PNPDeviceID") ?? className + "/" + name;
                var id = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawId))).ToLowerInvariant()[..20];
                output.Add(new(id, name, type, Wmi.Text(row, "Manufacturer"), status, code));
            }
        }
        return output.DistinctBy(d => d.Id).OrderBy(d => d.Type).ThenBy(d => d.Name).ToArray();
    }

    private static readonly Dictionary<string, string> Classes = new()
    {
        ["AUDIOENDPOINT"] = "오디오", ["MEDIA"] = "오디오", ["BLUETOOTH"] = "Bluetooth", ["CAMERA"] = "카메라",
        ["DISPLAY"] = "그래픽", ["HIDCLASS"] = "입력 장치", ["HID"] = "입력 장치", ["IMAGE"] = "이미징 장치", ["KEYBOARD"] = "키보드",
        ["MOUSE"] = "마우스", ["MONITOR"] = "디스플레이", ["NET"] = "네트워크", ["DISKDRIVE"] = "디스크",
        ["USB"] = "USB", ["USBDEVICE"] = "USB", ["PRINTER"] = "프린터", ["PRINTQUEUE"] = "프린터", ["PORTS"] = "포트",
        ["GAMECONTROLLER"] = "게임 컨트롤러", ["GAMEPAD"] = "게임 컨트롤러",
    };
}
