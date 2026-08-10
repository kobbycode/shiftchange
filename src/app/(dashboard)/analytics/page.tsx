"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { Fault, Task } from "@/lib/mock-db";
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2, Clock, Radio } from "lucide-react";

export default function AnalyticsPage() {
  const [stats, setStats] = React.useState({
    totalShifts: 0,
    totalFaults: 0,
    resolvedFaults: 0,
    pendingTasks: 0,
    completedTasks: 0,
    uptime: 100,
  });

  React.useEffect(() => {
    Promise.all([
      db.faults.list(),
      db.tasks.list(),
      db.shifts.list(),
      db.stations.list(),
    ]).then(([faults, tasks, shifts, stations]) => {
      const okStations = stations.filter((s) => s.current_status === "OK").length;
      setStats({
        totalShifts: shifts.length,
        totalFaults: faults.length,
        resolvedFaults: faults.filter((f: Fault) => f.status === "Resolved").length,
        pendingTasks: tasks.filter((t: Task) => t.status !== "Completed").length,
        completedTasks: tasks.filter((t: Task) => t.status === "Completed").length,
        uptime: stations.length ? Math.round((okStations / stations.length) * 100) : 100,
      });
    });
  }, []);

  const cards = [
    {
      label: "Station Uptime",
      value: `${stats.uptime}%`,
      icon: Radio,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Total Shifts",
      value: stats.totalShifts,
      icon: Clock,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Faults",
      value: stats.totalFaults,
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      label: "Resolved Faults",
      value: stats.resolvedFaults,
      icon: CheckCircle2,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Pending Tasks",
      value: stats.pendingTasks,
      icon: Clock,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Completed Tasks",
      value: stats.completedTasks,
      icon: TrendingUp,
      color: "text-info",
      bg: "bg-info/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" /> Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Operational metrics and performance overview.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="p-4 border border-border/40 rounded-xl bg-card"
            >
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="border border-border/40 rounded-xl bg-card p-6">
        <h2 className="font-semibold text-sm mb-2">Insights</h2>
        <p className="text-xs text-muted-foreground">
          {stats.totalShifts === 0
            ? "No shift data available yet. Start a shift to begin tracking."
            : `Across ${stats.totalShifts} shift${stats.totalShifts !== 1 ? "s" : ""}, ${stats.resolvedFaults} of ${stats.totalFaults} fault${stats.totalFaults !== 1 ? "s" : ""} resolved with ${stats.pendingTasks} task${stats.pendingTasks !== 1 ? "s" : ""} still pending.`}
        </p>
      </div>
    </div>
  );
}
