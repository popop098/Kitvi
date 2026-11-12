using Kitvi.Collector;
var failures = new List<string>(); var checks = 0;
void Check(string name, Action action) { checks++; try { action(); Console.WriteLine("PASS " + name); } catch (Exception e) { failures.Add(name); Console.WriteLine("FAIL " + name + ": " + e.Message); } }
void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"Expected {expected}, got {actual}"); }
Check("DXGI LUID matches the PDH high/low adapter identifier", () => Equal("luid_0x00000001_0x00000002", GpuMath.AdapterId(0x0000000100000002)));
Check("known indirect display adapters are excluded even with a hardware GPU description", () => Equal(false, GpuInventory.ShouldInclude(0, 0x342)));
Check("software adapters are excluded by either DXGI or the kernel adapter type", () => {
    Equal(false, GpuInventory.ShouldInclude(2, null)); Equal(false, GpuInventory.ShouldInclude(0, 4));
});
Check("two genuine identical GPUs retain their separate adapter identities", () => {
    var adapters = new[] {
        (Id: "luid_0x00000000_0x0000000a", Name: "NVIDIA GeForce RTX 5070 Ti", Bytes: 16771973120UL, Type: (uint?)0x31b),
        (Id: "luid_0x00000000_0x0000000b", Name: "NVIDIA GeForce RTX 5070 Ti", Bytes: 16771973120UL, Type: (uint?)0x31b)
    };
    var visible = adapters.Where(adapter => GpuInventory.ShouldInclude(0, adapter.Type)).ToArray();
    Equal(2, visible.Length); Equal(2, visible.Select(adapter => adapter.Id).Distinct().Count());
});
Check("an unavailable adapter-type query preserves the GPU", () => Equal(true, GpuInventory.ShouldInclude(0, null)));
Check("unknown bits, render-only, display-only and paravirtualized adapters remain visible", () => {
    Equal(true, GpuInventory.ShouldInclude(0, 0x80000000)); Equal(true, GpuInventory.ShouldInclude(0, 1));
    Equal(true, GpuInventory.ShouldInclude(0, 2)); Equal(true, GpuInventory.ShouldInclude(0, 0x80));
});
var a = "luid_0x00000000_0x0000000a"; var b = "luid_0x00000000_0x0000000b";
Check("processes sum per engine; engines use maximum; GPUs stay independent", () => {
    var values = GpuMath.Aggregate(new[] { new EngineReading($"pid_1_{a}_phys_0_eng_0_engtype_3D", 20, true), new EngineReading($"pid_2_{a}_phys_0_eng_0_engtype_3D", 30, true), new EngineReading($"pid_3_{a}_phys_0_eng_1_engtype_Copy", 10, true), new EngineReading($"pid_4_{b}_phys_0_eng_0_engtype_3D", 90, true) }, new[] { a, b });
    Equal<double?>(50, values[a]); Equal<double?>(90, values[b]);
});
Check("zero is a measured reading; no matching engine stays unavailable", () => {
    var values = GpuMath.Aggregate(new[] { new EngineReading($"pid_1_{a}_phys_0_eng_0_engtype_3D", 0, true) }, new[] { a, b });
    Equal<double?>(0, values[a]); Equal<double?>(null, values[b]);
});
Check("unmapped, invalid and non-finite engines cannot contaminate adapters", () => {
    var values = GpuMath.Aggregate(new[] { new EngineReading($"pid_1_{b}_phys_0_eng_0_engtype_3D", 99, true), new EngineReading($"pid_1_{a}_phys_0_eng_0_engtype_3D", 99, false), new EngineReading($"pid_2_{a}_phys_0_eng_0_engtype_3D", double.NaN, true) }, new[] { a });
    Equal<double?>(null, values[a]);
});
Check("overlapping refreshes share one in-flight operation and await it", () => {
    var work = new CoalescingWork(); var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var calls = 0;
    async Task Read() { Interlocked.Increment(ref calls); await gate.Task; }
    var first = work.Run(Read); var second = work.Run(Read);
    Equal(1, calls); Equal(true, ReferenceEquals(first, second)); Equal(false, second.IsCompleted);
    gate.SetResult(); Task.WhenAll(first, second).GetAwaiter().GetResult();
    work.Run(() => { calls++; return Task.CompletedTask; }).GetAwaiter().GetResult(); Equal(2, calls);
});
Console.WriteLine($"{checks - failures.Count}/{checks} checks passed");
return failures.Count == 0 ? 0 : 1;
