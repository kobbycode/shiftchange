"use client";

import * as React from "react";
import { User as UserIcon } from "lucide-react";
import { formatPairName, getAvatarColorClass } from "@/lib/pair-utils";

interface DutyPairBadgeProps {
  name: string | undefined | null;
  role?: string;
  showAvatars?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "badge" | "inline" | "card";
  className?: string;
}

export function DutyPairBadge({
  name,
  role,
  showAvatars = true,
  size = "md",
  variant = "inline",
  className = "",
}: DutyPairBadgeProps) {
  const displayName = formatPairName(name);
  const initial = displayName ? displayName.charAt(0).toUpperCase() : "?";

  const avatarSizes = {
    sm: "w-5 h-5 text-[9px]",
    md: "w-6 h-6 text-[10px]",
    lg: "w-7 h-7 text-xs",
  };

  const nameSizes = {
    sm: "text-[11px]",
    md: "text-xs",
    lg: "text-sm font-semibold",
  };

  const color = getAvatarColorClass(0);

  if (variant === "badge") {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-foreground ${className}`}
      >
        {showAvatars && (
          <div
            className={`${avatarSizes[size]} ${color.bg} ${color.text} rounded-full flex items-center justify-center font-bold ring-2 ring-background shadow-xs`}
          >
            {initial}
          </div>
        )}
        <div className="flex flex-col leading-tight">
          <span className={`${nameSizes[size]} font-medium text-foreground`}>
            {displayName}
          </span>
          {role && <span className="text-[10px] text-muted-foreground">{role}</span>}
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`p-3 rounded-xl bg-secondary/30 border border-border/60 flex items-center gap-3 ${className}`}>
        {showAvatars ? (
          <div
            className={`${avatarSizes.lg} ${color.bg} ${color.text} rounded-full flex items-center justify-center font-bold ring-2 ring-background shadow-sm`}
          >
            {initial}
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <UserIcon className="w-4 h-4" />
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-xs font-bold text-foreground">{displayName}</span>
          {role && <span className="text-[10px] text-muted-foreground">{role}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {showAvatars && (
        <div
          className={`${avatarSizes[size]} ${color.bg} ${color.text} rounded-full flex items-center justify-center font-bold ring-2 ring-background shadow-xs`}
        >
          {initial}
        </div>
      )}
      <span className={`${nameSizes[size]} font-semibold text-foreground`}>
        {displayName}
      </span>
      {role && <span className="text-[10px] text-muted-foreground">({role})</span>}
    </div>
  );
}
