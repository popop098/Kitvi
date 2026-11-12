using System.Globalization;
using System.Text.RegularExpressions;
namespace Kitvi.Collector;
public readonly record struct EngineReading(string Instance, double Value, bool Valid);
public static class GpuMath
{
    public static string AdapterId(long luid) => $"luid_0x{(uint)((ulong)luid >> 32):x8}_0x{(uint)luid:x8}";
    public static Dictionary<string, double?> Aggregate(IEnumerable<EngineReading> readings, IEnumerable<string> ids)
    {
        var output = ids.Distinct().ToDictionary(id => id, _ => (double?)null, StringComparer.OrdinalIgnoreCase);
        var engines = new Dictionary<(string Adapter, string Engine), double>();
        foreach (var reading in readings)
        {
            if (!reading.Valid || !double.IsFinite(reading.Value) || reading.Value < 0) continue;
            var match = Regex.Match(reading.Instance, @"luid_0x([0-9a-f]+)_0x([0-9a-f]+)_(phys_\d+_eng_\d+_engtype_[^_]+)", RegexOptions.IgnoreCase);
            if (!match.Success || !uint.TryParse(match.Groups[1].Value, NumberStyles.HexNumber, null, out var high) ||
                !uint.TryParse(match.Groups[2].Value, NumberStyles.HexNumber, null, out var low)) continue;
            var id = $"luid_0x{high:x8}_0x{low:x8}";
            if (!output.ContainsKey(id)) continue;
            var key = (id, match.Groups[3].Value.ToLowerInvariant());
            engines[key] = engines.GetValueOrDefault(key) + reading.Value;
        }
        foreach (var engine in engines)
            output[engine.Key.Adapter] = Math.Round(Math.Clamp(Math.Max(output[engine.Key.Adapter] ?? 0, engine.Value), 0, 100), 1);
        return output;
    }
}
