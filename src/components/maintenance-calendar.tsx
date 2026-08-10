"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Clock, UserCheck, Plus, CheckCircle, AlertTriangle, ShieldCheck, X } from "lucide-react";
import toast from "react-hot-toast";

interface MaintenanceItem {
  id: string;
  title: string;
  equipment: string;
  date: string; // YYYY-MM-DD
  recurrence: "One-time" | "Weekly" | "Monthly";
  assignedTo: string;
  status: "Scheduled" | "Completed" | "Overdue";
}

const STORAGE_KEY = "shift_maintenance_schedules_v2";

const initialMaintenance: MaintenanceItem[] = [];

export function MaintenanceCalendar() {
  const [items, setItems] = React.useState<MaintenanceItem[]>(initialMaintenance);
  const [selectedDate, setSelectedDate] = React.useState<string>(new Date().toISOString().split("T")[0]);
  const [isLoaded, setIsLoaded] = React.useState(false);
  
  // Form State
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [equipment, setEquipment] = React.useState("");
  const [date, setDate] = React.useState("");
  const [recurrence, setRecurrence] = React.useState<"One-time" | "Weekly" | "Monthly">("One-time");
  const [assignedTo, setAssignedTo] = React.useState("Kwame Osei");

  const [currentYear, setCurrentYear] = React.useState(2026);
  const [currentMonth, setCurrentMonth] = React.useState(6); // July (0-indexed)

  // Load from localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  React.useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, isLoaded]);

  const handleClearMockData = () => {
    if (confirm("Would you like to clear sample mock maintenance tasks and start with a clean schedule?")) {
      setItems([]);
      toast.success("Calendar cleared! You can now add real maintenance tasks.");
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleDayClick = (day: number) => {
    const formattedMonth = String(currentMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    setSelectedDate(`${currentYear}-${formattedMonth}-${formattedDay}`);
  };

  const handleAddMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !equipment || !date) {
      toast.error("Please fill in required fields");
      return;
    }

    const newItem: MaintenanceItem = {
      id: `m-${Date.now()}`,
      title,
      equipment,
      date,
      recurrence,
      assignedTo,
      status: "Scheduled"
    };

    setItems([...items, newItem]);
    setShowAddForm(false);
    setTitle("");
    setEquipment("");
    setDate("");
    toast.success("Maintenance routine scheduled!");
  };

  const handleMarkCompleted = (id: string) => {
    setItems(items.map(item => item.id === id ? { ...item, status: "Completed" as const } : item));
    toast.success("Maintenance checked off as completed!");
  };

  // Get items for the selected day
  const selectedDayItems = items.filter(item => item.date === selectedDate);

  // Helper to check if a day has scheduled maintenance
  const getDayItems = (day: number) => {
    const formattedMonth = String(currentMonth + 1).padStart(2, "0");
    const formattedDay = String(day).padStart(2, "0");
    const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;
    return items.filter(item => item.date === dateStr);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs text-left">
      {/* Column 1 & 2: Calendar grid */}
      <div className="lg:col-span-2 glass border border-border/60 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-primary" /> NOC Scheduled Maintenance
          </h3>
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="px-2 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded font-semibold cursor-pointer">&lt;</button>
            <span className="font-bold text-foreground text-xs">{monthNames[currentMonth]} {currentYear}</span>
            <button onClick={nextMonth} className="px-2 py-1 bg-secondary hover:bg-secondary/80 text-foreground rounded font-semibold cursor-pointer">&gt;</button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Empty placeholders before first day of month */}
          {Array.from({ length: firstDay }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-14 bg-transparent" />
          ))}

          {/* Actual days */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const formattedMonth = String(currentMonth + 1).padStart(2, "0");
            const formattedDay = String(day).padStart(2, "0");
            const dateStr = `${currentYear}-${formattedMonth}-${formattedDay}`;
            const isSelected = selectedDate === dateStr;
            const dayItems = getDayItems(day);

            const hasOverdue = dayItems.some(i => i.status === "Overdue");
            const hasScheduled = dayItems.some(i => i.status === "Scheduled");

            return (
              <button
                key={`day-${day}`}
                onClick={() => handleDayClick(day)}
                className={`h-14 p-1.5 rounded-xl border text-left flex flex-col justify-between transition-colors relative cursor-pointer ${
                  isSelected 
                    ? "border-primary bg-primary/10 ring-2 ring-primary" 
                    : "border-border/60 bg-card hover:bg-secondary/50"
                }`}
              >
                <span className="font-bold text-xs text-foreground">{day}</span>
                {dayItems.length > 0 && (
                  <div className="flex gap-1">
                    {hasOverdue && <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />}
                    {hasScheduled && <span className="w-2 h-2 rounded-full bg-primary" />}
                    {!hasOverdue && !hasScheduled && <span className="w-2 h-2 rounded-full bg-success" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Column 3: Scheduled items for selected day */}
      <div className="space-y-4">
        <div className="bg-card border border-border/60 rounded-2xl p-5 md:p-6 space-y-4 shadow-xs">
          <div className="flex justify-between items-center border-b border-border pb-3">
            <h4 className="font-bold text-xs text-foreground">
              Schedules for {new Date(selectedDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
            </h4>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button
                  onClick={handleClearMockData}
                  className="px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                  title="Clear all sample tasks"
                >
                  Clear Demo Data
                </button>
              )}
              <button
                onClick={() => setShowAddForm(true)}
                className="p-1 hover:bg-secondary text-primary hover:text-primary/95 rounded-lg cursor-pointer"
                title="Schedule maintenance"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
            {selectedDayItems.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No maintenance tasks scheduled for this date.
              </div>
            ) : (
              selectedDayItems.map((item) => (
                <div key={item.id} className="p-3 border border-border/60 rounded-xl space-y-2 bg-secondary/30">
                  <div className="flex justify-between items-start gap-2">
                    <h5 className="font-bold text-foreground leading-tight">{item.title}</h5>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase shrink-0 ${
                      item.status === "Completed" ? "bg-success/20 text-success border-success/30" :
                      item.status === "Overdue" ? "bg-destructive/20 text-destructive border-destructive/30 animate-pulse" :
                      "bg-primary/20 text-primary border-primary/30"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Equipment: {item.equipment}</p>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> {item.assignedTo}</span>
                    {item.status !== "Completed" && (
                      <button
                        onClick={() => handleMarkCompleted(item.id)}
                        className="text-success hover:underline font-semibold"
                      >
                        Mark Done
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Schedule form modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-sm bg-card text-card-foreground border border-border rounded-2xl shadow-2xl p-5 relative animate-in fade-in zoom-in-95 duration-150">
              <button 
                onClick={() => setShowAddForm(false)}
                className="absolute top-4 right-4 p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h4 className="font-bold text-sm text-foreground mb-4">Schedule Preventative Maintenance</h4>

              <form onSubmit={handleAddMaintenance} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Task Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                    placeholder="e.g. Inspect UPS battery cell leakage"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Equipment Unit *</label>
                  <input
                    type="text"
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                    placeholder="e.g. APC Smart-UPS Exciter"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Scheduled Date *</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-foreground"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-foreground">Recurrence</label>
                    <select
                      value={recurrence}
                      onChange={(e) => setRecurrence(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-foreground"
                    >
                      <option value="One-time">One-time</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Assign To Technician</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-lg text-foreground"
                  >
                    <option value="Kwame Osei">Kwame Osei</option>
                    <option value="Ama Serwaa">Ama Serwaa</option>
                    <option value="Ekow Appiah">Ekow Appiah</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl"
                >
                  Schedule Routine
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default MaintenanceCalendar;
