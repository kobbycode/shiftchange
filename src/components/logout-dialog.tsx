"use client";

import * as React from "react";
import { LogOut, ShieldAlert, X } from "lucide-react";

interface LogoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutDialog({ isOpen, onClose, onConfirm }: LogoutDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 text-left space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-destructive font-bold text-sm">
            <div className="p-2 rounded-xl bg-destructive/15 border border-destructive/20">
              <LogOut className="w-5 h-5 text-destructive" />
            </div>
            <span>Confirm Sign Out</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1 text-xs">
          <p className="font-semibold text-foreground">Are you sure you want to log out?</p>
          <p className="text-muted-foreground leading-relaxed">
            Logging out will conclude your active dashboard session. Unsaved shift notes will remain cached in your local browser.
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-secondary hover:bg-secondary/80 border border-border/60 text-foreground font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="flex-1 py-2 px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-semibold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
