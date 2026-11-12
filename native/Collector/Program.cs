using System.Diagnostics;
using System.Text;
using System.Text.Json;
namespace Kitvi.Collector;
internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false); Console.OutputEncoding = new UTF8Encoding(false);
        using var lifetime = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; lifetime.Cancel(); };
        if (args.Length == 2 && args[0] == "--parent" && int.TryParse(args[1], out var parentId)) _ = WatchParent(parentId, lifetime);
        WindowsNative.SetProcessDpiAwarenessContext(new IntPtr(-4));
        var service = new CollectorService(lifetime.Token);
        service.Start();
        try
        {
            while (!lifetime.IsCancellationRequested)
            {
                var line = await Console.In.ReadLineAsync(lifetime.Token);
                if (line is null) break;
                if (line.Length > 4096) continue;
                try
                {
                    using var document = JsonDocument.Parse(line);
                    var root = document.RootElement;
                    var id = root.TryGetProperty("id", out var idElement) ? idElement.GetString() : null;
                    var action = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : null;
                    if (action == "shutdown") { await Wire.Write(new { type = "response", id, ok = true }); break; }
                    if (action == "refresh") _ = Refresh(service, id, lifetime.Token);
                    else await Wire.Write(new { type = "response", id, ok = false, error = "unsupported-action" });
                }
                catch (JsonException) { await Wire.Diagnostic("input", "invalid-json"); }
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (IOException) { }
        finally { lifetime.Cancel(); await service.Stop(); }
        return 0;
    }
    private static async Task Refresh(CollectorService service, string? id, CancellationToken token)
    {
        try { await service.Refresh(); if (!token.IsCancellationRequested) await Wire.Write(new { type = "response", id, ok = true }); }
        catch (OperationCanceledException) { }
        catch (IOException) { }
    }
    private static async Task WatchParent(int id, CancellationTokenSource lifetime)
    {
        try { using var parent = Process.GetProcessById(id); await parent.WaitForExitAsync(lifetime.Token); lifetime.Cancel(); }
        catch (ArgumentException) { lifetime.Cancel(); } catch (OperationCanceledException) { }
    }
}
