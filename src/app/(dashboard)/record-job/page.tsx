"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-context";
import { db } from "@/lib/firestore";
import { JobRecord, JobCategory, User } from "@/lib/mock-db";
import { useBrowsingMode } from "@/lib/browsing-mode";
import { ClipboardList, Plus, Clock, Save, X, Play, Square, Filter, Eye } from "lucide-react";
import toast from "react-hot-toast";

const categories: JobCategory[] = ["Transmission", "Equipment", "Maintenance", "Installation", "Inspection", "Other"];

export default function RecordJobPage() {
  const { user } = useAuth();
  const browsing = useBrowsingMode() && user?.role === "Technician";
  const [jobs, setJobs] = React.useState<JobRecord[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [dateFilter, setDateFilter] = React.useState("");
  const [activeTimer, setActiveTimer] = React.useState<{ start: Date } | null>(null);
  const [timerSeconds, setTimerSeconds] = React.useState(0);

  React.useEffect(() => {
    Promise.all([db.jobs.list(), db.users.list()])
      .then(([j, u]) => {
        setJobs(j);
        setUsers(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!activeTimer) { setTimerSeconds(0); return; }
    const interval = setInterval(() => {
      setTimerSeconds(Math.floor((Date.now() - activeTimer.start.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const filtered = dateFilter
    ? jobs.filter((j) => j.date === dateFilter)
    : jobs;

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const todaysJobs = jobs.filter((j) => j.date === today && j.user_id === user?.id);
  const totalMinutes = todaysJobs.reduce((sum, j) => sum + (j.duration_minutes || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> Record Job
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Log jobs performed during your shift.</p>
        </div>
        {browsing ? (
          <span className="flex items-center gap-1.5 px-3 py-2 bg-warning/10 text-warning text-[10px] font-bold rounded-lg border border-warning/30">
            <Eye className="w-3.5 h-3.5" /> Browsing — viewing only, jobs are not recorded
          </span>
        ) : (
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/95 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Job
        </button>
        )}
      </div>

      {todaysJobs.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground bg-secondary/20 border border-border/40 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-primary" />
          <span>Today&apos;s logged time: <strong className="text-foreground">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</strong></span>
          <span className="text-border/40">|</span>
          <span>Jobs today: <strong className="text-foreground">{todaysJobs.length}</strong></span>
        </div>
      )}

      {activeTimer && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono font-bold text-primary">{formatDuration(timerSeconds)}</span>
          <span className="text-xs text-muted-foreground">Timer running</span>
          <button
            onClick={() => { setActiveTimer(null); }}
            className="ml-auto p-1.5 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showForm && !browsing && (
        <JobForm
          user={user!}
          onSave={(job) => {
            setJobs((prev) => [job, ...prev]);
            setShowForm(false);
            setActiveTimer(null);
          }}
          onCancel={() => { setShowForm(false); setActiveTimer(null); }}
          timerActive={activeTimer}
          onStartTimer={(start) => setActiveTimer({ start })}
          onStopTimer={() => setActiveTimer(null)}
        />
      )}

      {jobs.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-1.5 text-xs font-mono"
          />
          {dateFilter && (
            <button onClick={() => setDateFilter("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="border border-border/40 rounded-xl bg-card p-8 text-center text-muted-foreground">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">No job records found.</p>
          </div>
        ) : (
          filtered.map((job) => {
            const u = users.find((x) => x.id === job.user_id);
            return (
              <div
                key={job.id}
                className="border border-border/40 rounded-xl bg-card p-4 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold truncate">{job.title}</h3>
                      <span className="px-1.5 py-0.5 rounded bg-secondary/30 text-[9px] font-bold uppercase text-muted-foreground">
                        {job.category}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{job.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span>{u?.name ?? "Unknown"}</span>
                      <span>{new Date(job.date).toLocaleDateString()}</span>
                      <span>{new Date(job.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {job.end_time && (
                        <span>→ {new Date(job.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                      {job.duration_minutes !== undefined && (
                        <span className="text-foreground font-mono font-semibold">
                          {Math.floor(job.duration_minutes / 60)}h {job.duration_minutes % 60}m
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        {filtered.length} record{filtered.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function JobForm({
  user, onSave, onCancel, timerActive, onStartTimer, onStopTimer,
}: {
  user: { id: string; name: string };
  onSave: (job: JobRecord) => void;
  onCancel: () => void;
  timerActive: { start: Date } | null;
  onStartTimer: (start: Date) => void;
  onStopTimer: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState<JobCategory>("Maintenance");
  const [startTime, setStartTime] = React.useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = React.useState("");
  const [useTimer, setUseTimer] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required");
      return;
    }

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;
    const duration = end ? Math.round((end.getTime() - start.getTime()) / 60000) : undefined;

    if (end && duration && duration < 0) {
      toast.error("End time must be after start time");
      return;
    }

    setSaving(true);
    try {
      const job = await db.jobs.create({
        user_id: user.id,
        title: title.trim(),
        description: description.trim(),
        category,
        start_time: start.toISOString(),
        end_time: end?.toISOString(),
        duration_minutes: duration,
        date: start.toISOString().split("T")[0],
      });
      toast.success("Job recorded");
      onSave(job);
    } catch {
      toast.error("Failed to save job");
    }
    setSaving(false);
  };

  const handleStartTimer = () => {
    const now = new Date();
    setStartTime(now.toISOString().slice(0, 16));
    onStartTimer(now);
    setUseTimer(true);
    toast.success("Timer started");
  };

  const handleStopTimer = () => {
    const now = new Date();
    setEndTime(now.toISOString().slice(0, 16));
    setUseTimer(false);
    onStopTimer();
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border/40 rounded-xl bg-card p-4 space-y-3">
      <h3 className="text-xs font-semibold flex items-center gap-1.5">
        <Plus className="w-3.5 h-3.5 text-primary" /> New Job Record
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Job title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs sm:col-span-2"
          required
        />
        <textarea
          placeholder="Describe the job performed..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs resize-none h-20 sm:col-span-2"
          required
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as JobCategory)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs"
        >
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="border-t border-border/20 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase">Time Tracking</span>
          {!useTimer ? (
            <button
              type="button"
              onClick={handleStartTimer}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
            >
              <Play className="w-3 h-3" /> Start Timer
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStopTimer}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
            >
              <Square className="w-3 h-3" /> Stop Timer
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono"
              required
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">End Time</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono"
              disabled={useTimer}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/95 transition-colors disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Job"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-4 py-2 bg-secondary/50 text-muted-foreground text-xs font-semibold rounded-lg hover:bg-secondary transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </form>
  );
}
