#import <Cocoa/Cocoa.h>
#include <unistd.h>

int main(void) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        [application setActivationPolicy:NSApplicationActivationPolicyProhibited];
        // Observe mouse-down coordinates only while the owning popup is visible.
        // No keyboard events or input contents are captured or stored.
        id monitor = [NSEvent addGlobalMonitorForEventsMatchingMask:
            (NSEventMaskLeftMouseDown | NSEventMaskRightMouseDown | NSEventMaskOtherMouseDown)
            handler:^(NSEvent *event) {
                if (!event.CGEvent) return;
                CGPoint point = CGEventGetLocation(event.CGEvent);
                NSString *line = [NSString stringWithFormat:@"{\"x\":%.3f,\"y\":%.3f}\n", point.x, point.y];
                NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
                [[NSFileHandle fileHandleWithStandardOutput] writeData:data];
            }];
        if (!monitor) return 1;
        [NSTimer scheduledTimerWithTimeInterval:2 repeats:YES block:^(NSTimer *timer) {
            if (getppid() == 1) exit(0);
        }];
        [application run];
        [NSEvent removeMonitor:monitor];
    }
    return 0;
}
