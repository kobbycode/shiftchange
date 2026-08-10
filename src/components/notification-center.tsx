"use client";

import * as React from "react";
import { Bell, Check, Info, AlertTriangle, Play, ClipboardList, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { mockRealtime } from "@/lib/mock-db";
import type { Notification } from "@/lib/mock-db";
import toast from "react-hot-toast";
import { useAuth } from "@/components/auth-context";
import { useBrowsingMode } from "@/lib/browsing-mode";

function playTechieNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "triangle";

    // Techie two-tone frequency sweep (880Hz -> 1320Hz & 1760Hz)
    osc1.frequency.setValueAtTime(880, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);

    osc2.frequency.setValueAtTime(1760, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(2640, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.04);

    osc1.stop(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.25);
  } catch (e) {
    // Silent fail if browser blocks autoplay audio context before gesture
  }
}

export function NotificationCenter() {
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const browsing = useBrowsingMode() && user?.role === "Technician";

  React.useEffect(() => {
    // Initial fetch
    db.notifications.list().then((notifs) => {
      // Filter out shift notifications for browsing technicians
      if (browsing) {
        setNotifications(notifs.filter(n => n.type !== "shift_start" && n.type !== "shift_end"));
      } else {
        setNotifications(notifs);
      }
    });

    // Subscribe to mock real-time updates
    const unsubscribe = mockRealtime.subscribe("notification", (newNotif: Notification) => {
      setNotifications((prev) => [newNotif, ...prev]);

      // Browsing technicians don't get shift notifications
      if (browsing && (newNotif.type === "shift_start" || newNotif.type === "shift_end")) {
        return;
      }

      // Play futuristic techie chime sound
      playTechieNotificationSound();

      // Trigger browser toast alerts
      const toastStyles = {
        icon: "🔔",
        style: {
          background: "hsl(var(--card))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "0.75rem",
        }
      };

      if (newNotif.type === "critical_fault") {
        toast.error(`${newNotif.title}: ${newNotif.message}`, toastStyles);
      } else if (newNotif.type === "shift_start" || newNotif.type === "shift_end") {
        toast.success(`${newNotif.title}: ${newNotif.message}`, { ...toastStyles, icon: "🌅" });
      } else if (newNotif.type === "task_assign") {
        toast.success(`${newNotif.title}: ${newNotif.message}`, { ...toastStyles, icon: "📋" });
      } else if (newNotif.type === "fault_assign") {
        toast.success(`${newNotif.title}: ${newNotif.message}`, { ...toastStyles, icon: "🔧" });
      } else {
        toast(`${newNotif.title}: ${newNotif.message}`, toastStyles);
      }

      // Browser System Notification (Optional - checking permission)
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(newNotif.title, { body: newNotif.message });
      }
    });

    // Request browser notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    return () => unsubscribe();
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.notifications.markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "critical_fault":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "shift_start":
      case "shift_end":
        return <Play className="w-4 h-4 text-success" />;
      case "task_assign":
        return <ClipboardList className="w-4 h-4 text-primary" />;
      case "fault_assign":
        return <Wrench className="w-4 h-4 text-warning" />;
      default:
        return <Info className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4.5 h-4.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center pulse-primary">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-card text-card-foreground rounded-2xl border border-border shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((notif) => {
                  const clickable = notif.type === "fault_assign" || notif.type === "task_assign";
                  const handleOpen = () => {
                    setOpen(false);
                    router.push(notif.type === "fault_assign" ? "/faults" : "/tasks");
                  };
                  return (
                  <div
                    key={notif.id}
                    onClick={clickable ? handleOpen : undefined}
                    className={`flex items-start gap-3 p-3.5 text-left transition-colors ${
                      notif.is_read ? "bg-card hover:bg-secondary/30" : "bg-primary/10 border-l-2 border-primary"
                    } ${clickable ? "cursor-pointer" : ""}`}
                  >
                    <div className="p-1.5 rounded-lg bg-secondary shrink-0 mt-0.5 border border-border/40">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold leading-tight text-foreground">{notif.title}</h4>
                      <p className="text-[11px] text-muted-foreground leading-normal mt-0.5 font-medium">{notif.message}</p>
                      <span className="text-[9px] text-muted-foreground mt-1.5 font-mono font-medium block">
                        {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {!notif.is_read && (
                      <button
                        onClick={(e) => handleMarkAsRead(notif.id, e)}
                        className="text-muted-foreground hover:text-success p-1 rounded-lg hover:bg-secondary shrink-0"
                        title="Mark as Read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
          {/* Overlay to close popover */}
          <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
export default NotificationCenter;
