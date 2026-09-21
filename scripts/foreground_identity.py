"""Read-only physical desktop metadata. Never focuses, moves or controls a window."""
import ctypes
import ctypes.wintypes as wt
import json
import platform


def foreground_identity():
    user=ctypes.windll.user32
    # This process only: prevent DPI virtualization of returned display coordinates.
    user.SetProcessDPIAware()
    user.GetForegroundWindow.restype=wt.HWND
    handle=user.GetForegroundWindow()
    title=ctypes.create_unicode_buffer(4096)
    user.GetWindowTextW(handle,title,len(title))
    pid=wt.DWORD();user.GetWindowThreadProcessId(handle,ctypes.byref(pid))
    rectangle=wt.RECT();user.GetWindowRect(handle,ctypes.byref(rectangle))
    return dict(hwnd=int(handle or 0),pid=pid.value,title=title.value,
                rectangle=dict(left=rectangle.left,top=rectangle.top,right=rectangle.right,bottom=rectangle.bottom),
                physicalDesktop=dict(width=user.GetSystemMetrics(0),height=user.GetSystemMetrics(1)),
                platform=platform.platform(),method='Read-only Win32 GetForegroundWindow, GetWindowThreadProcessId, GetWindowRect, GetSystemMetrics')


if __name__=='__main__':
    print(json.dumps(foreground_identity(),ensure_ascii=True))
