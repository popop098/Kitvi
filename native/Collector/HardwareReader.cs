using Microsoft.Win32;
using System.Management;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace Kitvi.Collector;

internal static class HardwareReader
{
    internal static (CpuInfo Cpu, OsInfo Os) ReadFixed()
    {
        var names = new List<string>(); int cores = 0, threads = 0;
        try
        {
            using var query = Wmi.Search("SELECT Name, NumberOfCores, NumberOfLogicalProcessors FROM Win32_Processor");
            using var rows = query.Get();
            foreach (ManagementObject row in rows)
            {
                using (row)
                {
                    if (Wmi.Text(row, "Name") is { } name) names.Add(name);
                    cores += Wmi.Number(row, "NumberOfCores") ?? 0; threads += Wmi.Number(row, "NumberOfLogicalProcessors") ?? 0;
                }
            }
        }
        catch { }
        if (threads == 0) threads = (int)WindowsNative.GetActiveProcessorCount(0xffff);
        var cpu = new CpuInfo(names.Count == 0 ? null : string.Join(" / ", names), cores > 0 ? cores : null, threads > 0 ? threads : null, Reading.Waiting);
        var os = new OsInfo(null, null, null, Environment.TickCount64 / 1000d);
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
            var name = key?.GetValue("ProductName")?.ToString();
            var version = key?.GetValue("DisplayVersion")?.ToString();
            var build = key?.GetValue("CurrentBuildNumber")?.ToString();
            var revision = key?.GetValue("UBR")?.ToString();
            if (int.TryParse(build, out var number) && number >= 22000 && name?.StartsWith("Windows 10", StringComparison.OrdinalIgnoreCase) == true) name = "Windows 11" + name[10..];
            os = os with { Name = name, Version = version, Build = build is null ? null : revision is null ? build : build + "." + revision };
        }
        catch { }
        return (cpu, os);
    }

    internal static GpuInfo[] ReadGpus()
    {
        var drivers = new List<(string? Name, string? Pnp, string? Version)>();
        try
        {
            using var query = Wmi.Search("SELECT Name, PNPDeviceID, DriverVersion FROM Win32_VideoController");
            using var rows = query.Get();
            foreach (ManagementObject row in rows) using (row) drivers.Add((Wmi.Text(row, "Name"), Wmi.Text(row, "PNPDeviceID"), Wmi.Text(row, "DriverVersion")));
        }
        catch { } // DXGI inventory remains usable when the optional driver query is unavailable.
        var output = new List<GpuInfo>();
        var factoryId = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
        Marshal.ThrowExceptionForHR(WindowsNative.CreateDXGIFactory1(ref factoryId, out var factoryObject));
        try
        {
            var factory = (IDxgiFactory)factoryObject;
            for (uint index = 0; ; index++)
            {
                var result = factory.EnumAdapters1(index, out var adapter);
                if (result == unchecked((int)0x887A0002)) break;
                Marshal.ThrowExceptionForHR(result);
                if (adapter is null) continue;
                try
                {
                    Marshal.ThrowExceptionForHR(adapter.GetDesc1(out var info));
                    if (!GpuInventory.ShouldInclude(info.Flags, GpuInventory.ReadAdapterType(info.AdapterLuid))) continue;
                    var name = info.Description?.TrimEnd('\0').Trim();
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    var exact = drivers.Where(driver => string.Equals(driver.Name, name, StringComparison.OrdinalIgnoreCase)).ToArray();
                    var pci = drivers.Where(driver => driver.Pnp is { } pnp &&
                        Regex.IsMatch(pnp, $"VEN_{info.VendorId:X4}&DEV_{info.DeviceId:X4}", RegexOptions.IgnoreCase)).ToArray();
                    var matching = exact.Length > 0 ? exact : pci;
                    var versions = matching.Select(d => d.Version).Where(v => v is not null).Distinct().ToArray();
                    var bytes = info.DedicatedVideoMemory.ToUInt64();
                    output.Add(new(GpuMath.AdapterId(info.AdapterLuid), name,
                        info.VendorId switch { 0x10de => "NVIDIA", 0x1002 => "AMD", 0x8086 => "Intel", _ => $"PCI {info.VendorId:X4}" },
                        bytes > 0 ? bytes : null, versions.Length == 1 ? versions[0] : null, Reading.Waiting));
                }
                finally { Marshal.ReleaseComObject(adapter); }
            }
        }
        finally { Marshal.ReleaseComObject(factoryObject); }
        return output.OrderByDescending(g => g.DedicatedMemoryBytes ?? 0).ThenBy(g => g.Name).ToArray();
    }
}
