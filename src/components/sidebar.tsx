"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "./auth-context";
import { useTheme } from "./theme-provider";
import { db } from "@/lib/firestore";
import type { UserRole } from "@/lib/mock-db";
import { useBrowsingMode } from "@/lib/browsing-mode";
import { 
  LayoutDashboard, Play, Radio, ArrowRightLeft, AlertTriangle, 
  Tv, Compass, ClipboardList, Users2, FileBarChart, BarChart3, 
  Settings as SettingsIcon, LogOut, Sun, Moon, Laptop, Menu, Camera, PenTool
} from "lucide-react";
import React from "react";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { LogoutDialog } from "@/components/logout-dialog";

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  color: string;
  role?: UserRole;
  hideFrom?: UserRole[];
}

export const navItems: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, color: "text-blue-500 dark:text-blue-400" },
  { name: "Handover", href: "/handover", icon: ArrowRightLeft, color: "text-violet-500 dark:text-violet-400" },
  { name: "Current Shift", href: "/current-shift", icon: Radio, color: "text-amber-500 dark:text-amber-400", hideFrom: ["Admin", "Supervisor"] },
  { name: "Fault Management", href: "/faults", icon: AlertTriangle, color: "text-rose-500 dark:text-rose-400" },
  { name: "Tasks", href: "/tasks", icon: ClipboardList, color: "text-cyan-500 dark:text-cyan-400" },
  { name: "Record Job", href: "/record-job", icon: PenTool, color: "text-orange-500 dark:text-orange-400", hideFrom: ["Admin", "Supervisor"] },
  { name: "QR Scanner", href: "/scanner", icon: Camera, color: "text-teal-500 dark:text-teal-400", hideFrom: ["Admin", "Supervisor"] },
  { name: "Attendance", href: "/attendance", icon: Users2, color: "text-violet-500 dark:text-violet-400" },
  { name: "Account", href: "/account", icon: SettingsIcon, color: "text-gray-500 dark:text-gray-400" },
  { name: "Reports", href: "/reports", icon: FileBarChart, color: "text-green-500 dark:text-green-400", role: "Supervisor" },
  { name: "Analytics", href: "/analytics", icon: BarChart3, color: "text-fuchsia-500 dark:text-fuchsia-400", role: "Supervisor" },
  { name: "Admin Panel", href: "/admin", icon: Users2, color: "text-yellow-500 dark:text-yellow-400", role: "Admin" },
];

// Live count of pending (non-completed) tasks for nav badges
export function usePendingTaskCount() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const load = () => {
      db.tasks.list()
        .then(tasks => setCount(tasks.filter(t => t.status !== "Completed").length))
        .catch(() => {});
    };
    load();
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("shift_")) load(); };
    const onShiftDataChanged = () => load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener("shift_data_changed", onShiftDataChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
    };
  }, []);
  return count;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, checkPermission, hasRole } = useAuth();
  const { theme, setTheme } = useTheme();
  const browsing = useBrowsingMode() && user?.role === "Technician";
  const [showLogoutPrompt, setShowLogoutPrompt] = React.useState(false);
  const pendingTasks = usePendingTaskCount();

  if (!user) return null;

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card text-card-foreground p-4 h-screen sticky top-0 shrink-0">
        {/* Brand Header */}
        <div className="flex items-center justify-center px-2 py-3 border-b border-border mb-6">
          <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center shrink-0">
            <img 
              src="https://res.cloudinary.com/dlu07cuqx/image/upload/v1784690644/ChatGPT_Image_Jul_22_2026_03_23_26_AM_vk0gmf.png" 
              alt="App Logo" 
              className="w-full h-full object-cover rounded-full" 
              loading="eager"
              decoding="async"
            />
          </div>
        </div>

        {/* Nav Menu */}
        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.map((item, i) => {
            // If role required, check permissions
            if (item.role && !checkPermission(item.role)) return null;
            // If hideFrom specified, hide for those roles
            if (item.hideFrom && item.hideFrom.some(r => hasRole(r))) return null;
            // Hide Current Shift for browsing technicians
            if (browsing && item.href === "/current-shift") return null;

            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-primary-foreground" : item.color}`} />
                  <span>{item.name}</span>
                  {item.href === "/tasks" && pendingTasks > 0 && (
                    <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center ${
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary border border-primary/30"
                    }`}>
                      {pendingTasks}
                    </span>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Footer / User Profile & Theme Toggle */}
        <div className="border-t border-border pt-4 mt-auto space-y-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-1.5 border border-border/40">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex justify-center py-1 rounded-md transition-colors cursor-pointer ${
                theme === "light" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Light Mode"
            >
              <Sun className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex justify-center py-1 rounded-md transition-colors cursor-pointer ${
                theme === "dark" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="Dark Mode"
            >
              <Moon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme("system")}
              className={`flex-1 flex justify-center py-1 rounded-md transition-colors cursor-pointer ${
                theme === "system" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
              title="System Theme"
            >
              <Laptop className="w-4 h-4" />
            </button>
          </div>

          {/* User Card */}
          <div className="flex items-center justify-between gap-2 bg-secondary/30 border border-border/30 rounded-lg p-2.5">
            <DutyPairBadge name={user.name} role={user.role} showAvatars={true} size="md" />
            <button
              onClick={() => setShowLogoutPrompt(true)}
              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-secondary transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <LogoutDialog
        isOpen={showLogoutPrompt}
        onClose={() => setShowLogoutPrompt(false)}
        onConfirm={logout}
      />
    </>
  );
}
