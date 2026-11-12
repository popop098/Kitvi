using System.Runtime.InteropServices;

namespace Kitvi.Collector;

internal sealed class MetricsReader : IDisposable
{
    private IntPtr _query, _gpuCounter, _cpuCounter;
    private bool _primed;
    private ulong? _idle, _total;
    private long _lastTick;
    private int _reset;
    internal void Reset() => Interlocked.Exchange(ref _reset, 1);

    internal (Reading Cpu, MemoryInfo Memory, Dictionary<string, double?> Gpus, bool Warmup) Read(IEnumerable<string> gpuIds, string time)
    {
        if (Interlocked.Exchange(ref _reset, 0) == 1 || (_lastTick > 0 && Environment.TickCount64 - _lastTick > 5000)) ResetQuery();
        _lastTick = Environment.TickCount64;
        var fallback = ReadCpuFallback();
        var memory = new MemoryStatus { Length = (uint)Marshal.SizeOf<MemoryStatus>() };
        var validMemory = WindowsNative.GlobalMemoryStatusEx(ref memory) && memory.TotalPhysical > 0;
        var used = validMemory ? memory.TotalPhysical - Math.Min(memory.TotalPhysical, memory.AvailablePhysical) : (ulong?)null;
        var ram = new MemoryInfo(validMemory ? memory.TotalPhysical : null, used,
            Reading.At(used.HasValue ? Math.Round(used.Value * 100d / memory.TotalPhysical, 1) : null, time));
        var wasPrimed = _primed;
        var gpuValues = gpuIds.ToDictionary(id => id, _ => (double?)null);
        double? cpu = null;
        try
        {
            if (_query == IntPtr.Zero && WindowsNative.PdhOpenQuery(IntPtr.Zero, IntPtr.Zero, out _query) == 0)
            {
                WindowsNative.PdhAddCounter(_query, @"\GPU Engine(*)\Utilization Percentage", IntPtr.Zero, out _gpuCounter);
                WindowsNative.PdhAddCounter(_query, @"\Processor Information(*)\% Processor Time", IntPtr.Zero, out _cpuCounter);
            }
            if (_query != IntPtr.Zero && WindowsNative.PdhCollectQueryData(_query) == 0)
            {
                if (_primed)
                {
                    gpuValues = GpuMath.Aggregate(ReadCounter(_gpuCounter), gpuValues.Keys);
                    var total = ReadCounter(_cpuCounter).FirstOrDefault(item => item.Instance == "_Total" && item.Valid && double.IsFinite(item.Value));
                    if (total.Instance is not null) cpu = Math.Round(Math.Clamp(total.Value, 0, 100), 1);
                }
                _primed = true;
            }
        }
        catch { Reset(); }
        // GetSystemTimes covers one processor group; only use this fallback on <=64 logical CPUs.
        if (cpu is null && WindowsNative.GetActiveProcessorCount(0xffff) <= 64) cpu = fallback;
        return (Reading.At(cpu, time, !wasPrimed), ram, gpuValues, !wasPrimed);
    }

    private double? ReadCpuFallback()
    {
        if (!WindowsNative.GetSystemTimes(out var idle, out var kernel, out var user)) return null;
        var total = kernel.Value + user.Value; double? result = null;
        if (_idle.HasValue && _total.HasValue && total > _total && idle.Value >= _idle)
        {
            var elapsed = total - _total.Value; var idleElapsed = idle.Value - _idle.Value;
            if (idleElapsed <= elapsed) result = Math.Round((elapsed - idleElapsed) * 100d / elapsed, 1);
        }
        _idle = idle.Value; _total = total;
        return result;
    }

    private static List<EngineReading> ReadCounter(IntPtr counter)
    {
        var readings = new List<EngineReading>();
        if (counter == IntPtr.Zero) return readings;
        uint bytes = 0, count = 0;
        var result = WindowsNative.PdhGetArray(counter, WindowsNative.PdhDouble | WindowsNative.PdhNoCap, ref bytes, ref count, IntPtr.Zero);
        if (result != WindowsNative.MoreData || bytes == 0 || bytes > 32 * 1024 * 1024) return readings;
        var buffer = Marshal.AllocHGlobal((int)bytes);
        try
        {
            result = WindowsNative.PdhGetArray(counter, WindowsNative.PdhDouble | WindowsNative.PdhNoCap, ref bytes, ref count, buffer);
            if (result != 0) return readings;
            var stride = IntPtr.Size + 16;
            for (uint i = 0; i < count && ((ulong)i + 1) * (uint)stride <= bytes; i++)
            {
                var entry = IntPtr.Add(buffer, checked((int)i * stride));
                var name = Marshal.PtrToStringUni(Marshal.ReadIntPtr(entry));
                if (name is null) continue;
                var status = Marshal.ReadInt32(entry, IntPtr.Size);
                var value = Marshal.PtrToStructure<double>(IntPtr.Add(entry, IntPtr.Size + 8));
                readings.Add(new(name, value, status is 0 or 1));
            }
        }
        finally { Marshal.FreeHGlobal(buffer); }
        return readings;
    }

    private void ResetQuery()
    {
        if (_query != IntPtr.Zero) WindowsNative.PdhCloseQuery(_query);
        _query = _gpuCounter = _cpuCounter = IntPtr.Zero; _primed = false; _idle = _total = null;
    }
    public void Dispose() => ResetQuery();
}
