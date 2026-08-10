"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { User, Shift, getShiftTypeForTime, isLateCheckIn } from "@/lib/mock-db";
import { Users, KeyRound, CheckCircle2, X, UserCheck } from "lucide-react";
import toast from "react-hot-toast";

interface ClockInPartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: Shift | null;
  currentUserId: string;
  alreadyCheckedInUserIds: string[];
  absentUserIds?: string[];   // technicians marked absent — not clockable partners
  onSuccess?: () => void;
}

export function ClockInPartnerModal({
  isOpen,
  onClose,
  activeShift,
  currentUserId,
  alreadyCheckedInUserIds,
  absentUserIds = [],
  onSuccess,
}: ClockInPartnerModalProps) {
  const [users, setUsers] = React.useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (isOpen) {
      db.users.list().then(setUsers);
      setSelectedUserId("");
      setPin("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter users who are not Admin, not already checked in, and not absent
  const checkedInSet = new Set(alreadyCheckedInUserIds);
  const absentSet = new Set(absentUserIds);
  const eligibleUsers = users.filter(
    (u) => u.role !== "Admin" && !checkedInSet.has(u.id) && !absentSet.has(u.id)
  );

  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleConfirmClockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedUserId) {
      setError("Please select the technician to clock in.");
      return;
    }
    if (!pin || pin.length !== 4) {
      setError("Please enter the 4-digit security PIN.");
      return;
    }
    if (selectedUser && selectedUser.pin !== pin) {
      setError("Invalid Security PIN for " + selectedUser.name);
      return;
    }

    setLoading(true);
    try {
      let targetShiftId = activeShift?.id;

      // If no active shift is running, start one with the selected user
      if (!targetShiftId) {
        const newShift = await db.shifts.start(
          getShiftTypeForTime(),
          "Radio Engineering",
          selectedUserId,
          "Shift started via Partner Clock-In"
        );
        targetShiftId = newShift.id;
      } else {
        // Record attendance for the active shift
        const now = new Date();
        const isLate = isLateCheckIn(now, activeShift!);

        await db.attendance.create({
          shift_id: targetShiftId,
          user_id: selectedUserId,
          time_reported: now.toISOString(),
          hours_worked: 0,
          is_late: isLate,
          late_reason: isLate ? "Duty partner check-in" : undefined,
        });
      }

      toast.success(`✓ ${selectedUser?.name} successfully clocked in for duty!`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shift_data_changed"));
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to clock in technician");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="bg-card border border-border/80 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative text-left">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Clock In Duty Partner</h2>
            <p className="text-xs text-muted-foreground">Add a co-worker to the active shift on this shared terminal.</p>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleConfirmClockIn} className="space-y-4 text-xs">
          {/* Select Technician */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground block">
              Select Duty Technician <span className="text-destructive">*</span>
            </label>
            {eligibleUsers.length === 0 ? (
              <p className="text-muted-foreground italic py-2">
                All duty technicians are already checked in for this shift.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {eligibleUsers.map((u) => {
                  const selected = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setError("");
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                        selected
                          ? "bg-primary/15 border-primary text-foreground font-bold shadow-xs"
                          : "bg-secondary/40 border-border/40 hover:bg-secondary text-muted-foreground"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selected ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-xs truncate">{u.name}</p>
                        <p className="text-[10px] opacity-75">{u.role}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* PIN Input */}
          {selectedUserId && (
            <div className="space-y-1.5 pt-2 border-t border-border/40">
              <label className="font-semibold text-foreground flex items-center justify-between">
                <span>{selectedUser?.name}&apos;s 4-Digit Security PIN</span>
                <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    setError("");
                  }}
                  placeholder="••••"
                  className="w-full pl-9 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl font-mono text-center text-lg tracking-widest text-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic text-center">
                Technician confirms check-in with their personal PIN.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedUserId || eligibleUsers.length === 0}
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/95 disabled:opacity-50 text-white font-semibold text-xs cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? "Clocking in..." : "Confirm Check-In"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
