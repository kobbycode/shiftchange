"use client";

import * as React from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Camera, Upload, AlertTriangle, CheckCircle, WifiOff, Wifi, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firestore";
import { Task, FaultPriority, Equipment, Shift } from "@/lib/mock-db";
import { useAuth } from "@/components/auth-context";
import { useBrowsingMode } from "@/lib/browsing-mode";

const QUEUE_KEY = "equipment_report_queue";

interface QueuedReport {
  id: string;
  equipment_id: string;
  equipment_name: string;
  description: string;
  image_url: string;
  priority: FaultPriority;
  created_at: string;
  synced: boolean;
}

function getOfflineQueue(): QueuedReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch { return []; }
}

function saveOfflineQueue(queue: QueuedReport[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function removeFromQueue(id: string) {
  const queue = getOfflineQueue().filter(r => r.id !== id);
  saveOfflineQueue(queue);
}

export function QRScanner() {
  const { user } = useAuth();
  const browsing = useBrowsingMode() && user?.role === "Technician";
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [isScanning, setIsScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<string | null>(null);
  const [equipmentInfo, setEquipmentInfo] = React.useState<Equipment | null>(null);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<FaultPriority>("Medium");
  const [isOnline, setIsOnline] = React.useState(true);
  const [pendingQueue, setPendingQueue] = React.useState<QueuedReport[]>([]);
  const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Track online/offline status
  React.useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Load pending queue and active shift on mount
  React.useEffect(() => {
    setPendingQueue(getOfflineQueue());
    db.shifts.getActive().then(setActiveShift);
  }, []);

  // Sync queue when back online
  React.useEffect(() => {
    if (!isOnline) return;
    const queue = getOfflineQueue().filter(r => !r.synced);
    if (queue.length === 0) return;

    const syncAll = async () => {
      let syncedCount = 0;
      for (const report of queue) {
        try {
          await db.tasks.create({
            shift_id: activeShift?.id,
            task_name: `Equipment Fault: ${report.equipment_name}`,
            description: report.description,
            assigned_to_id: user?.id,
            priority: report.priority,
            station_id: undefined,
            status: "Todo",
            image_url: report.image_url,
            equipment_id: report.equipment_id,
            resolution_type: undefined,
          });
          const fullQueue = getOfflineQueue();
          const updated = fullQueue.map(r => r.id === report.id ? { ...r, synced: true } : r);
          saveOfflineQueue(updated);
          syncedCount++;
        } catch (err) {
          console.error("Failed to sync report:", err);
        }
      }
      setPendingQueue(getOfflineQueue());
      if (syncedCount > 0) toast.success(`Synced ${syncedCount} queued report(s)`);
    };
    syncAll();
  }, [isOnline, activeShift?.id, user?.id]);

  // Scanner setup/teardown
  React.useEffect(() => {
    if (isScanning && !scannerRef.current) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader-container",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          setScanResult(decodedText);
          setIsScanning(false);
          scanner.clear().catch(() => {});
          scannerRef.current = null;
          toast.success("QR scanned!");
          loadEquipment(decodedText);
        },
        () => {}
      );
      scannerRef.current = scanner;
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isScanning]);

  const loadEquipment = async (eqId: string) => {
    try {
      const all = await db.equipment.list();
      const found = all.find(e => e.id === eqId || e.name.toLowerCase().includes(eqId.toLowerCase()));
      if (found) {
        setEquipmentInfo(found);
      } else {
        toast.error("Equipment not recognized. Creating report anyway.");
        setEquipmentInfo({ id: eqId, name: eqId, location: "Unknown", status: "Operational", created_at: new Date().toISOString() });
      }
    } catch {
      setEquipmentInfo({ id: eqId, name: eqId, location: "Unknown", status: "Operational", created_at: new Date().toISOString() });
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Photo must be under 10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentInfo || !description.trim()) {
      toast.error("Please fill in fault description");
      return;
    }

    let uploadedUrl = photo;
    if (photo && photo.startsWith("data:") && navigator.onLine) {
      try {
        const blob = await fetch(photo).then(r => r.blob());
        const file = new File([blob], `fault-${Date.now()}.jpg`, { type: "image/jpeg" });
        uploadedUrl = await db.storage.uploadPhoto(file);
      } catch {
        // Keep the data URL as fallback
      }
    }

    const reportId = `eq-report-${Date.now()}`;

    if (!navigator.onLine) {
      const queue = getOfflineQueue();
      queue.push({
        id: reportId,
        equipment_id: equipmentInfo.id,
        equipment_name: equipmentInfo.name,
        description,
        image_url: uploadedUrl || "",
        priority,
        created_at: new Date().toISOString(),
        synced: false,
      });
      saveOfflineQueue(queue);
      setPendingQueue(queue);
      toast.success("Report queued for sync (offline mode)");
      resetForm();
      return;
    }

    try {
      await db.tasks.create({
        shift_id: activeShift?.id,
        task_name: `Equipment Fault: ${equipmentInfo.name}`,
        description,
        assigned_to_id: user?.id,
        priority,
        station_id: undefined,
        status: "Todo",
        image_url: uploadedUrl || undefined,
        equipment_id: equipmentInfo.id,
        resolution_type: undefined,
      });
      toast.success("Fault report submitted as pending task");
      resetForm();
    } catch (err) {
      toast.error("Failed to submit. Saving to offline queue.");
      const queue = getOfflineQueue();
      queue.push({
        id: reportId,
        equipment_id: equipmentInfo.id,
        equipment_name: equipmentInfo.name,
        description,
        image_url: uploadedUrl || "",
        priority,
        created_at: new Date().toISOString(),
        synced: false,
      });
      saveOfflineQueue(queue);
      setPendingQueue(queue);
      resetForm();
    }
  };

  const resetForm = () => {
    setScanResult(null);
    setEquipmentInfo(null);
    setPhoto(null);
    setDescription("");
    setPriority("Medium");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteQueued = (id: string) => {
    removeFromQueue(id);
    setPendingQueue(getOfflineQueue());
    toast.success("Removed from queue");
  };

  const priorityColors: Record<FaultPriority, string> = {
    Low: "bg-success/20 text-success border-success/30",
    Medium: "bg-warning/20 text-warning border-warning/30",
    High: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    Critical: "bg-destructive/20 text-destructive border-destructive/30",
  };

  return (
    <div className="glass border border-border/60 rounded-2xl p-5 md:p-6 text-xs text-left space-y-4 max-w-2xl mx-auto">
      {browsing ? (
        <div className="py-10 text-center space-y-3">
          <div className="h-14 w-14 bg-warning/15 border border-warning/30 text-warning rounded-full flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-sm text-foreground">Browsing — View Only</h3>
          <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
            You signed in as Just Browsing, so fault reports can&apos;t be submitted in this session.
            Nothing you do here is recorded.
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            Sign out and choose &quot;Start Shift&quot; when you&apos;re ready to log equipment faults.
          </p>
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
          <Camera className="w-4 h-4 text-primary animate-pulse" /> Equipment Fault Scanner
        </h3>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1 text-[10px] text-success"><Wifi className="w-3 h-3" /> Online</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-warning"><WifiOff className="w-3 h-3" /> Offline</span>
          )}
          {pendingQueue.filter(r => !r.synced).length > 0 && (
            <span className="px-2 py-0.5 bg-warning/20 text-warning rounded-full text-[10px] font-bold border border-warning/30">
              {pendingQueue.filter(r => !r.synced).length} queued
            </span>
          )}
        </div>
      </div>

      {/* No scan state */}
      {!isScanning && !equipmentInfo && (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 bg-primary/10 border border-primary/20 text-primary rounded-full flex items-center justify-center mx-auto">
            <Camera className="w-7 h-7" />
          </div>
          <p className="text-muted-foreground max-w-xs mx-auto leading-relaxed">
            Scan a faulty equipment QR code, snap a photo, and log the issue as a pending task for the shift pair to resolve.
          </p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <button
              onClick={() => setIsScanning(true)}
              className="w-full py-2 bg-primary hover:bg-primary/95 text-white font-semibold text-xs rounded-xl shadow-md cursor-pointer transition-colors"
            >
              Start QR Scanner
            </button>
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 py-2 justify-center">
              <span>Or demo scan:</span>
              <button onClick={() => { setScanResult("eq-tx-01"); loadEquipment("eq-tx-01"); }} className="underline hover:text-white">Transmitter</button>
              <span>|</span>
              <button onClick={() => { setScanResult("eq-console-03"); loadEquipment("eq-console-03"); }} className="underline hover:text-white">Console</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanning */}
      {isScanning && (
        <div className="space-y-4">
          <div id="qr-reader-container" className="overflow-hidden rounded-xl border border-border/80 bg-zinc-950/65" />
          <p className="text-center text-muted-foreground">Align the QR code within the camera frame.</p>
          <button
            onClick={() => { setIsScanning(false); if (scannerRef.current) { scannerRef.current.clear().catch(() => {}); scannerRef.current = null; } }}
            className="w-full py-2 bg-secondary/50 hover:bg-secondary border border-border/40 text-foreground font-semibold rounded-lg text-xs cursor-pointer"
          >
            Cancel Scan
          </button>
        </div>
      )}

      {/* Equipment info + fault form */}
      {equipmentInfo && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="flex justify-between items-start gap-4 p-4 bg-secondary/20 border border-border/40 rounded-xl">
            <div>
              <h4 className="font-bold text-sm text-white">{equipmentInfo.name}</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">Location: {equipmentInfo.location}</p>
              {equipmentInfo.station_id && <p className="text-[10px] text-zinc-400 mt-1">Station: {equipmentInfo.station_id}</p>}
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase ${priorityColors[equipmentInfo.status === "Faulty" ? "Critical" : equipmentInfo.status === "Needs Service" ? "Medium" : "Low"]}`}>
              {equipmentInfo.status}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-border/40 bg-secondary/10 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-zinc-300 block">Log Fault Details</span>

            {/* Photo capture */}
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-400">Equipment Photo</label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                  id="equipment-photo"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary border border-border/40 rounded-lg text-xs cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> {photo ? "Retake Photo" : "Take Photo"}
                </button>
                {photo && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border/60">
                    <img src={photo} alt="Fault" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-400">Severity</label>
              <div className="flex flex-wrap gap-1.5">
                {(["Low", "Medium", "High", "Critical"] as FaultPriority[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-all ${
                      priority === p
                        ? priorityColors[p]
                        : "bg-secondary/30 text-muted-foreground border-border/40 hover:bg-secondary/50"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-400">Fault Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-950/40 border border-border rounded-lg text-xs"
                rows={3}
                placeholder="Describe the issue: noise on output, dead fader, blinking error light..."
                required
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 py-2 bg-secondary/50 hover:bg-secondary border border-border/40 text-foreground font-semibold rounded-lg text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-destructive hover:bg-destructive/95 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Submit Fault Report
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Offline queue */}
      {pendingQueue.length > 0 && (
        <div className="space-y-2 mt-4">
          <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
            <WifiOff className="w-3 h-3" /> Pending Reports ({pendingQueue.filter(r => !r.synced).length} unsynced)
          </span>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {pendingQueue.map(r => (
              <div key={r.id} className={`flex items-center justify-between p-3 rounded-lg border text-[11px] ${r.synced ? "bg-success/10 border-success/30" : "bg-secondary/20 border-border/40"}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {r.synced ? (
                    <CheckCircle className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-warning shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{r.equipment_name}</p>
                    <p className="text-[9px] text-muted-foreground truncate">{r.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] text-zinc-500">{r.synced ? "Synced" : "Pending"}</span>
                  {!r.synced && (
                    <button onClick={() => handleDeleteQueued(r.id)} className="p-1 hover:bg-destructive/20 rounded cursor-pointer">
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default QRScanner;
