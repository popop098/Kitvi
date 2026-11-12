using System.Text.Json;
using System.Threading.Channels;

namespace Kitvi.Collector;

internal sealed class CollectorService(CancellationToken token)
{
    private readonly object _sync = new();
    private Snapshot _snapshot = new();
    private readonly MetricsReader _metrics = new();
    private readonly Channel<Snapshot> _updates = Channel.CreateBounded<Snapshot>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
    private readonly Dictionary<string, CoalescingWork> _work = new() { ["fixed"] = new(), ["gpu"] = new(), ["storage"] = new(), ["displays"] = new(), ["devices"] = new() };
    private Task[] _tasks = [];
    internal void Start()
    {
        Change(s => s);
        _tasks = [Pump(), Periodic(Metrics, 1), Periodic(Fixed, 0), Periodic(Gpus, 15), Periodic(Storage, 5), Periodic(Displays, 15), Periodic(Devices, 15)];
    }
    internal Task Refresh() => Task.WhenAll(Fixed(), Gpus(), Storage(), Displays(), Devices());
    private async Task Periodic(Func<Task> action, int seconds)
    {
        try
        {
            do { await action(); if (seconds == 0) return; await Task.Delay(TimeSpan.FromSeconds(seconds), token); } while (!token.IsCancellationRequested);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
    }
    private Task Metrics()
    {
        string[] ids; lock (_sync) ids = _snapshot.Gpus.Select(g => g.Id).ToArray();
        var time = Clock.Now;
        var values = _metrics.Read(ids, time);
        Change(s => s with { MetricsAt = time, Cpu = s.Cpu with { Usage = values.Cpu }, Memory = values.Memory,
            Gpus = s.Gpus.Select(g => g with { Usage = Reading.At(values.Gpus.GetValueOrDefault(g.Id), time, values.Warmup) }).ToArray(),
            Os = s.Os with { UptimeSeconds = Math.Max(0, Environment.TickCount64 / 1000d) } });
        return Task.CompletedTask;
    }
    private Task Fixed() => Gather("fixed", "hardware", HardwareReader.ReadFixed,
        (s, value) => s with { Cpu = value.Cpu with { Usage = s.Cpu.Usage }, Os = value.Os with { UptimeSeconds = s.Os.UptimeSeconds ?? value.Os.UptimeSeconds } });
    private Task Gpus() => Gather("gpu", "gpus", HardwareReader.ReadGpus, (s, values) =>
    {
        if (!s.Gpus.Select(g => g.Id).SequenceEqual(values.Select(g => g.Id))) _metrics.Reset();
        var existing = s.Gpus.ToDictionary(g => g.Id);
        return s with { Gpus = values.Select(g => g with { Usage = existing.GetValueOrDefault(g.Id)?.Usage ?? Reading.Waiting }).ToArray() };
    });
    private Task Storage() => Gather("storage", "storage", InventoryReader.ReadStorage, (s, values) => s with { Storage = values });
    private Task Displays() => Gather("displays", "displays", InventoryReader.ReadDisplays, (s, values) => s with { Displays = values });
    private Task Devices() => Gather("devices", "devices", InventoryReader.ReadDevices, (s, values) => s with { Devices = values });
    private Task Gather<T>(string key, string section, Func<T> read, Func<Snapshot, T, Snapshot> apply) =>
        _work[key].Run(() => GatherCore(key, section, read, apply));
    private async Task GatherCore<T>(string key, string section, Func<T> read, Func<Snapshot, T, Snapshot> apply)
    {
        try
        {
            var value = await Task.Run(read, token);
            if (!token.IsCancellationRequested) Change(s => WithSection(apply(s, value), section, CollectionInfo.Ready));
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception e)
        {
            await Wire.Diagnostic(key, e.GetType().Name);
            if (!token.IsCancellationRequested) Change(s => WithSection(s, section,
                new("error", s.Sections[section].UpdatedAt, "Windows에서 일부 정보를 읽지 못했어요. 새로고침으로 다시 확인할 수 있어요.")));
        }
    }
    private static Snapshot WithSection(Snapshot snapshot, string key, CollectionInfo info) => snapshot with { Sections = new(snapshot.Sections) { [key] = info } };
    private void Change(Func<Snapshot, Snapshot> update)
    {
        lock (_sync) { _snapshot = update(_snapshot) with { CapturedAt = Clock.Now }; _updates.Writer.TryWrite(_snapshot); }
    }
    private async Task Pump()
    {
        try { await foreach (var snapshot in _updates.Reader.ReadAllAsync(token)) await Wire.Write(new { type = "snapshot", snapshot }); }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (IOException) { }
    }
    internal async Task Stop()
    {
        try { await Task.WhenAll(_tasks).WaitAsync(TimeSpan.FromSeconds(2)); }
        catch (OperationCanceledException) { } catch (TimeoutException) { }
        if (_tasks.All(t => t.IsCompleted)) _metrics.Dispose();
    }
}

internal static class Wire
{
    private static readonly SemaphoreSlim Gate = new(1);
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    internal static async Task Write(object value)
    {
        await Gate.WaitAsync();
        try { await Console.Out.WriteLineAsync(JsonSerializer.Serialize(value, Json)); }
        finally { Gate.Release(); }
    }
    internal static Task Diagnostic(string scope, string code) => Console.Error.WriteLineAsync(JsonSerializer.Serialize(new { scope, code }));
}
