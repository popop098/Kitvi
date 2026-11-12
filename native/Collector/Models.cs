namespace Kitvi.Collector;

public sealed record Reading(double? Value, string Status, string? UpdatedAt)
{
    public static Reading Waiting => new(null, "loading", null);
    public static Reading At(double? value, string time, bool warmup = false) => new(value, value.HasValue ? "ready" : warmup ? "loading" : "unavailable", time);
}
public sealed record CollectionInfo(string Status, string? UpdatedAt, string? Message)
{
    public static CollectionInfo Waiting => new("loading", null, null);
    public static CollectionInfo Ready => new("ready", Clock.Now, null);
}
public sealed record CpuInfo(string? Name, int? Cores, int? Threads, Reading Usage);
public sealed record MemoryInfo(ulong? TotalBytes, ulong? UsedBytes, Reading Usage);
public sealed record GpuInfo(string Id, string Name, string Vendor, ulong? DedicatedMemoryBytes, string? DriverVersion, Reading Usage);
public sealed record OsInfo(string? Name, string? Version, string? Build, double? UptimeSeconds);
public sealed record DriveInfo(string Id, string Name, string Label, ulong? TotalBytes, ulong? FreeBytes, ulong? UsedBytes);
public sealed record DisplayInfo(string Id, string? Name, int? Width, int? Height, double? RefreshRate, bool Primary);
public sealed record DeviceInfo(string Id, string Name, string Type, string? Manufacturer, string Status, int? ErrorCode);
public sealed record Snapshot
{
    public int SchemaVersion { get; init; } = 1;
    public string CapturedAt { get; init; } = Clock.Now;
    public string? MetricsAt { get; init; }
    public CpuInfo Cpu { get; init; } = new(null, null, null, Reading.Waiting);
    public MemoryInfo Memory { get; init; } = new(null, null, Reading.Waiting);
    public GpuInfo[] Gpus { get; init; } = [];
    public OsInfo Os { get; init; } = new(null, null, null, null);
    public DriveInfo[] Storage { get; init; } = [];
    public DisplayInfo[] Displays { get; init; } = [];
    public DeviceInfo[] Devices { get; init; } = [];
    public Dictionary<string, CollectionInfo> Sections { get; init; } = new()
    {
        ["hardware"] = CollectionInfo.Waiting, ["gpus"] = CollectionInfo.Waiting, ["storage"] = CollectionInfo.Waiting,
        ["displays"] = CollectionInfo.Waiting, ["devices"] = CollectionInfo.Waiting,
    };
}
internal static class Clock { public static string Now => DateTimeOffset.UtcNow.ToString("O"); }
