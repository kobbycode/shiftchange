"use client";

import * as React from "react";
import { QRScanner } from "@/components/qr-scanner";

export default function ScannerPage() {
  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-xl font-bold tracking-tight">QR Equipment Scanner</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Scan equipment barcode labels to view field maintenance logs.</p>
      </div>
      <QRScanner />
    </div>
  );
}
