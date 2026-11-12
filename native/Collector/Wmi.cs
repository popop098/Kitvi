using System.Management;

namespace Kitvi.Collector;

internal static class Wmi
{
    internal static ManagementObjectSearcher Search(string query, string scope = @"root\cimv2") =>
        new(new ManagementScope(scope), new ObjectQuery(query), new System.Management.EnumerationOptions { Timeout = TimeSpan.FromSeconds(6), ReturnImmediately = true, Rewindable = false });
    internal static string? Text(ManagementBaseObject item, string property)
    {
        try { return item[property]?.ToString()?.Trim() is { Length: > 0 } text ? text : null; } catch { return null; }
    }
    internal static int? Number(ManagementBaseObject item, string property)
    {
        try { return item[property] is { } value ? Convert.ToInt32(value) : null; } catch { return null; }
    }
}
