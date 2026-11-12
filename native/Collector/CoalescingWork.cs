namespace Kitvi.Collector;
public sealed class CoalescingWork
{
    private readonly object _sync = new();
    private Task? _current;
    public Task Run(Func<Task> action)
    {
        lock (_sync) return _current is { IsCompleted: false } ? _current : _current = action();
    }
}
