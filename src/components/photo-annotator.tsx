"use client";

import * as React from "react";
import { Upload, Check, RotateCcw, Palette, ArrowRightLeft, Scissors } from "lucide-react";
import toast from "react-hot-toast";

interface PhotoAnnotatorProps {
  onSave: (annotatedDataUrl: string) => void;
}

export function PhotoAnnotator({ onSave }: PhotoAnnotatorProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [drawColor, setDrawColor] = React.useState("#ef4444"); // Red marker default
  const [lineWidth, setLineWidth] = React.useState(4);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const isDrawingRef = React.useRef(false);
  const lastPosRef = React.useRef({ x: 0, y: 0 });
  const originalImageRef = React.useRef<HTMLImageElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        originalImageRef.current = img;
        initCanvas(img);
        setImageLoaded(true);
        toast.success("Photo uploaded! Use touch/mouse to draw highlights.");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const initCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale canvas to match image aspect ratio inside container limits
    const maxW = 500;
    const maxH = 400;
    let w = img.width;
    let h = img.height;

    if (w > maxW) {
      h = (maxW / w) * h;
      w = maxW;
    }
    if (h > maxH) {
      w = (maxH / h) * w;
      h = maxH;
    }

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(img, 0, 0, w, h);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    isDrawingRef.current = true;
    lastPosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastPosRef.current = { x: currentX, y: currentY };
  };

  const handleMouseUpOrLeave = () => {
    isDrawingRef.current = false;
  };

  // Touch Support for Mobile Engineers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    isDrawingRef.current = true;
    const touch = e.touches[0];
    lastPosRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || e.touches.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const currentX = touch.clientX - rect.left;
    const currentY = touch.clientY - rect.top;

    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    lastPosRef.current = { x: currentX, y: currentY };
  };

  const handleReset = () => {
    if (originalImageRef.current) {
      initCanvas(originalImageRef.current);
      toast("Highlights cleared", { icon: "🔄" });
    }
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // JPEG instead of PNG — annotated photos shrink ~10x (canvas is a photo,
    // so lossy is visually identical) and keeps localStorage well under quota.
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onSave(dataUrl);
    toast.success("Annotated image saved and attached to fault report!");
    setImageLoaded(false);
  };

  return (
    <div className="space-y-4 border border-border/40 p-4 rounded-xl bg-secondary/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-400">Photo Evidence & Marker</span>
        {imageLoaded && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleReset}
              className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded"
              title="Reset Drawing"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <input
              type="color"
              value={drawColor}
              onChange={(e) => setDrawColor(e.target.value)}
              className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
              title="Marker Color"
            />
          </div>
        )}
      </div>

      {!imageLoaded ? (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="h-32 border border-dashed border-border hover:border-primary rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer bg-secondary/25 hover:bg-secondary/40 transition-colors"
        >
          <Upload className="w-6 h-6 text-zinc-500" />
          <span className="text-xs text-muted-foreground">Upload Equipment / Fault Image</span>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="border border-border/60 rounded-lg overflow-hidden bg-zinc-950">
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUpOrLeave}
              className="cursor-crosshair touch-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-primary hover:bg-primary/95 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" /> Save Highlighted Photo
          </button>
        </div>
      )}
    </div>
  );
}
export default PhotoAnnotator;
