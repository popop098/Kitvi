using System.Runtime.InteropServices;

namespace Kitvi.Collector;

public static class GpuInventory
{
    private const uint DxgiSoftwareAdapter = 0x2, KernelSoftwareDevice = 0x4, KernelIndirectDisplayDevice = 0x40;
    private const int KernelAdapterType = 15;

    // Indirect display adapters can reuse their render GPU's DXGI name and memory size.
    // Keep unknown adapters: missing type information or usage does not make a GPU virtual.
    public static bool ShouldInclude(uint dxgiFlags, uint? adapterType) =>
        (dxgiFlags & DxgiSoftwareAdapter) == 0 &&
        (!adapterType.HasValue || (adapterType.Value & (KernelSoftwareDevice | KernelIndirectDisplayDevice)) == 0);

    internal static uint? ReadAdapterType(long luid)
    {
        try
        {
            var open = new KernelOpenAdapter { LuidLow = (uint)luid, LuidHigh = (int)(luid >> 32) };
            if (WindowsNative.D3DKMTOpenAdapterFromLuid(ref open) != 0) return null;
            try
            {
                var data = Marshal.AllocHGlobal(sizeof(uint));
                try
                {
                    var query = new KernelQueryAdapter { Adapter = open.Adapter, Type = KernelAdapterType, Data = data, Size = sizeof(uint) };
                    return WindowsNative.D3DKMTQueryAdapterInfo(ref query) == 0 ? unchecked((uint)Marshal.ReadInt32(data)) : null;
                }
                finally { Marshal.FreeHGlobal(data); }
            }
            finally
            {
                var close = new KernelCloseAdapter { Adapter = open.Adapter };
                WindowsNative.D3DKMTCloseAdapter(ref close);
            }
        }
        catch (DllNotFoundException) { return null; }
        catch (EntryPointNotFoundException) { return null; }
    }
}
