"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { Announcement } from "@/lib/mock-db";
import { Megaphone, X } from "lucide-react";

// Latest station-wide announcement, shown as a dismissible strip on every
// dashboard page. Dismissal is remembered per announcement on this device.
export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = React.useState<Announcement | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    db.announcements.list().then((items) => {
      if (cancelled || items.length === 0) return;
      const latest = items[0];
      if (!latest) return;
      let isDismissed = false;
      try {
        isDismissed = localStorage.getItem(`shift_announcement_dismissed_${latest.id}`) === "1";
      } catch {}
      if (!cancelled) {
        setAnnouncement(latest);
        setDismissed(isDismissed);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!announcement || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(`shift_announcement_dismissed_${announcement.id}`, "1"); } catch {}
  };

  const time = new Date(announcement.created_at);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 md:px-6 pt-4">
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200">
        <Megaphone className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-relaxed whitespace-pre-wrap">{announcement.text}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {announcement.author_name ? `— ${announcement.author_name} · ` : ""}
            {time.toLocaleDateString()} {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={dismiss}
          title="Dismiss"
          className="p-1 rounded-md hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 cursor-pointer transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
