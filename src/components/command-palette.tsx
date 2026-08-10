"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Radio, AlertTriangle, ClipboardList, Play, ArrowRightLeft } from "lucide-react";
import { db } from "@/lib/firestore";
import { Station, Fault, Task, User } from "@/lib/mock-db";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { formatPairName } from "@/lib/pair-utils";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  const [stations, setStations] = React.useState<Station[]>([]);
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (open) {
      db.stations.list().then(setStations);
      db.faults.list().then(setFaults);
      db.tasks.list().then(setTasks);
      db.users.list().then(setUsers);
    }
  }, [open]);

  if (!open) return null;

  const handleNavigate = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery("");
  };

  // Filter lists
  const filteredLinks = [
    { name: "Shift Handover", href: "/handover", icon: ArrowRightLeft },
    { name: "Current Shift Details", href: "/current-shift", icon: Radio },
    { name: "Report new Fault", href: "/faults?action=new", icon: AlertTriangle },
    { name: "Tasks Kanban Board", href: "/tasks", icon: ClipboardList },
  ].filter(l => l.name.toLowerCase().includes(query.toLowerCase()));

  const filteredUsers = users.filter((u) => {
    if (!query.trim()) return false;
    const qRaw = query.toLowerCase().trim();
    const formatted = formatPairName(u).toLowerCase();
    const rawName = u.name.toLowerCase();
    const email = u.email.toLowerCase();
    const role = u.role.toLowerCase();

    const blob = `${rawName} ${formatted} ${email} ${role}`;
    if (blob.includes(qRaw)) return true;

    const qTokens = qRaw.split(/[\s&,/]+/).filter((t) => t.length > 1);
    return qTokens.length > 0 && qTokens.every((t) => blob.includes(t));
  });

  const filteredStations = stations.filter(s => 
    s.name.toLowerCase().includes(query.toLowerCase())
  );

  const filteredFaults = faults.filter(f => 
    f.description.toLowerCase().includes(query.toLowerCase()) || 
    f.category.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTasks = tasks.filter(t => 
    t.task_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-xs"
      onClick={() => setOpen(false)}
    >
      <div 
        className="w-full max-w-xl glass rounded-xl border border-border/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border py-3">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent border-0 outline-hidden placeholder:text-muted-foreground text-sm"
            placeholder="Type a command, station, or fault description..."
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground border border-border bg-secondary/80 rounded px-1.5 py-0.5 font-mono select-none">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-4">
          {/* Quick Actions */}
          {filteredLinks.length > 0 && (
            <div>
              <h3 className="px-3 text-[10px] uppercase font-semibold text-muted-foreground mb-1 tracking-wider">Quick Commands</h3>
              <div className="space-y-0.5">
                {filteredLinks.map(link => {
                  const Icon = link.icon;
                  return (
                    <button
                      key={link.name}
                      onClick={() => handleNavigate(link.href)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors group"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>{link.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Engineers & Duty Staff */}
          {filteredUsers.length > 0 && (
            <div>
              <h3 className="px-3 text-[10px] uppercase font-semibold text-muted-foreground mb-1 tracking-wider">Engineers &amp; Duty Staff</h3>
              <div className="space-y-0.5">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleNavigate("/admin")}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <DutyPairBadge name={u.name} size="sm" />
                      <span className="text-xs text-muted-foreground">({u.email})</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-secondary text-muted-foreground">
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stations */}
          {filteredStations.length > 0 && (
            <div>
              <h3 className="px-3 text-[10px] uppercase font-semibold text-muted-foreground mb-1 tracking-wider">Stations</h3>
              <div className="space-y-0.5">
                {filteredStations.map(station => (
                  <button
                    key={station.id}
                    onClick={() => handleNavigate(`/current-shift?station=${station.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {station.logo_url ? (
                      <div className="w-6 h-6 rounded bg-white overflow-hidden flex items-center justify-center p-0.5 shrink-0 border border-border/40">
                        <img src={station.logo_url} alt={station.name} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <Radio className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span>{station.name}</span>
                    <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      station.current_status === "OK" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                    }`}>
                      {station.current_status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Faults */}
          {filteredFaults.length > 0 && (
            <div>
              <h3 className="px-3 text-[10px] uppercase font-semibold text-muted-foreground mb-1 tracking-wider">Active Faults</h3>
              <div className="space-y-0.5">
                {filteredFaults.slice(0, 4).map(fault => (
                  <button
                    key={fault.id}
                    onClick={() => handleNavigate(`/faults?id=${fault.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <span className="truncate flex-1">{fault.description}</span>
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase">{fault.priority}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pending Tasks */}
          {filteredTasks.length > 0 && (
            <div>
              <h3 className="px-3 text-[10px] uppercase font-semibold text-muted-foreground mb-1 tracking-wider">Tasks</h3>
              <div className="space-y-0.5">
                {filteredTasks.slice(0, 4).map(task => (
                  <button
                    key={task.id}
                    onClick={() => handleNavigate("/tasks")}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ClipboardList className="w-4 h-4 text-primary shrink-0" />
                    <span className="truncate flex-1">{task.task_name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase">{task.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredLinks.length === 0 && filteredStations.length === 0 && filteredFaults.length === 0 && filteredTasks.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default CommandPalette;
