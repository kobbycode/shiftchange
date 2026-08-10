"use client";

import * as React from "react";
import { RotateCcw, Check } from "lucide-react";
import toast from "react-hot-toast";

interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  title: string;
}

export function SignatureCanvas({ onSave, title }: SignatureCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [hasSigned, setHasSigned] = React.useState(false);

  // Reactively detect dark mode via the `dark` class on <html>
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Signature stroke color set to white
  const strokeColor = "#ffffff";

  // Re-initialise canvas dimensions & styles when theme changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 320;
    canvas.height = 140;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
  }, [strokeColor]);

  const getCoordinates = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // Always re-apply stroke style before drawing so theme switches mid-session work too
  const applyStroke = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStroke(ctx);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSigned(true);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStroke(ctx);
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    toast("Signature pad cleared", { icon: "🔄" });
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSigned) {
      toast.error("Please sign on the pad before saving!");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    toast.success("Signature captured!");
  };

  return (
    <div className="space-y-3 p-4 border border-border/40 rounded-xl bg-secondary/15 text-left text-xs max-w-sm">
      <span className="font-semibold text-zinc-400 block">{title}</span>

      <div className="border border-border/60 bg-zinc-950 rounded-lg overflow-hidden h-[140px] relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="cursor-crosshair touch-none w-full h-full"
        />
        {!hasSigned && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-zinc-600 text-[10px] uppercase font-bold tracking-widest">
            Draw Signature Here
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="flex-1 py-1.5 bg-secondary/50 hover:bg-secondary border border-border/40 hover:border-border text-foreground font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear
        </button>
        <button
          type="button"
          onClick={saveSignature}
          className="flex-1 py-1.5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" /> Capture
        </button>
      </div>
    </div>
  );
}

export default SignatureCanvas;
