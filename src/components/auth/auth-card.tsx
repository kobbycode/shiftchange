"use client";

import * as React from "react";
import Link from "next/link";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-md relative z-10">
      {/* Brand */}
      <div className="text-center mb-6 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full overflow-hidden shadow-xl border border-border/50 shrink-0 mb-3 bg-white">
          <img
            src="/logo.png"
            alt="Tech Dept Logo"
            className="w-full h-full object-cover rounded-full"
            onError={(e) => {
              e.currentTarget.src =
                "https://res.cloudinary.com/dlu07cuqx/image/upload/v1784668203/ChatGPT_Image_Jul_21_2026_09_09_29_PM_xmnmek.png";
            }}
          />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Technical Department
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Shift Handover Form
        </p>
      </div>

      {/* Card */}
      <div className="bg-card text-card-foreground rounded-2xl border border-border shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        {children}
      </div>

      {/* Footer slot */}
      {footer && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  );
}
