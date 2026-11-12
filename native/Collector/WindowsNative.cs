using System.Runtime.InteropServices;

namespace Kitvi.Collector;

[StructLayout(LayoutKind.Sequential)] internal struct NativeFileTime { public uint Low; public uint High; public readonly ulong Value => ((ulong)High << 32) | Low; }
[StructLayout(LayoutKind.Sequential)] internal struct MemoryStatus
{
    public uint Length; public uint Load;
    public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, AvailableExtendedVirtual;
}
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct DisplayDevice
{
    public int Size;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string? DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? DeviceId;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? DeviceKey;
}
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct DisplayMode
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string? DeviceName;
    public ushort SpecVersion, DriverVersion, Size, DriverExtra; public uint Fields;
    public int PositionX, PositionY; public uint DisplayOrientation, DisplayFixedOutput;
    public short Color, Duplex, YResolution, TTOption, Collate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string? FormName;
    public ushort LogPixels; public uint BitsPerPel, PelsWidth, PelsHeight, DisplayFlags, DisplayFrequency, ICMMethod, ICMIntent, MediaType, DitherType, Reserved1, Reserved2, PanningWidth, PanningHeight;
}
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] internal struct AdapterDescription
{
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string? Description;
    public uint VendorId, DeviceId, SubSysId, Revision;
    public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
    public long AdapterLuid; public uint Flags;
}
[StructLayout(LayoutKind.Sequential)] internal struct KernelOpenAdapter
{
    public uint LuidLow; public int LuidHigh; public uint Adapter;
}
[StructLayout(LayoutKind.Sequential)] internal struct KernelQueryAdapter
{
    public uint Adapter; public int Type; public IntPtr Data; public uint Size;
}
[StructLayout(LayoutKind.Sequential)] internal struct KernelCloseAdapter { public uint Adapter; }
[ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IDxgiFactory
{
    [PreserveSig] int SetPrivateData(ref Guid name, uint size, IntPtr data);
    [PreserveSig] int SetPrivateDataInterface(ref Guid name, IntPtr unknown);
    [PreserveSig] int GetPrivateData(ref Guid name, ref uint size, IntPtr data);
    [PreserveSig] int GetParent(ref Guid riid, out IntPtr parent);
    [PreserveSig] int EnumAdapters(uint index, out IntPtr adapter);
    [PreserveSig] int MakeWindowAssociation(IntPtr window, uint flags);
    [PreserveSig] int GetWindowAssociation(out IntPtr window);
    [PreserveSig] int CreateSwapChain(IntPtr device, IntPtr description, out IntPtr swapChain);
    [PreserveSig] int CreateSoftwareAdapter(IntPtr module, out IntPtr adapter);
    [PreserveSig] int EnumAdapters1(uint index, out IDxgiAdapter? adapter);
    [PreserveSig] bool IsCurrent();
}
[ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IDxgiAdapter
{
    [PreserveSig] int SetPrivateData(ref Guid name, uint size, IntPtr data);
    [PreserveSig] int SetPrivateDataInterface(ref Guid name, IntPtr unknown);
    [PreserveSig] int GetPrivateData(ref Guid name, ref uint size, IntPtr data);
    [PreserveSig] int GetParent(ref Guid riid, out IntPtr parent);
    [PreserveSig] int EnumOutputs(uint index, out IntPtr output);
    [PreserveSig] int GetDesc(out IntPtr description);
    [PreserveSig] int CheckInterfaceSupport(ref Guid name, out long version);
    [PreserveSig] int GetDesc1(out AdapterDescription description);
}
internal static class WindowsNative
{
    internal const uint PdhDouble = 0x00000200, PdhNoCap = 0x00008000, MoreData = 0x800007D2;
    [DllImport("kernel32.dll")] internal static extern bool GetSystemTimes(out NativeFileTime idle, out NativeFileTime kernel, out NativeFileTime user);
    [DllImport("kernel32.dll")] internal static extern bool GlobalMemoryStatusEx(ref MemoryStatus memory);
    [DllImport("kernel32.dll")] internal static extern uint GetActiveProcessorCount(ushort group);
    [DllImport("user32.dll")] internal static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern bool EnumDisplayDevices(string? device, uint index, ref DisplayDevice result, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] internal static extern bool EnumDisplaySettings(string device, int mode, ref DisplayMode result);
    [DllImport("dxgi.dll")] internal static extern int CreateDXGIFactory1(ref Guid id, [MarshalAs(UnmanagedType.Interface)] out object factory);
    [DllImport("gdi32.dll")] internal static extern int D3DKMTOpenAdapterFromLuid(ref KernelOpenAdapter adapter);
    [DllImport("gdi32.dll")] internal static extern int D3DKMTQueryAdapterInfo(ref KernelQueryAdapter query);
    [DllImport("gdi32.dll")] internal static extern int D3DKMTCloseAdapter(ref KernelCloseAdapter adapter);
    [DllImport("pdh.dll", EntryPoint = "PdhOpenQueryW", CharSet = CharSet.Unicode)] internal static extern uint PdhOpenQuery(IntPtr source, IntPtr data, out IntPtr query);
    [DllImport("pdh.dll", EntryPoint = "PdhAddEnglishCounterW", CharSet = CharSet.Unicode)] internal static extern uint PdhAddCounter(IntPtr query, string path, IntPtr data, out IntPtr counter);
    [DllImport("pdh.dll")] internal static extern uint PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll", EntryPoint = "PdhGetFormattedCounterArrayW")] internal static extern uint PdhGetArray(IntPtr counter, uint format, ref uint bytes, ref uint count, IntPtr buffer);
    [DllImport("pdh.dll")] internal static extern uint PdhCloseQuery(IntPtr query);
}
