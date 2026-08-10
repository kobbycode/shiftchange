"use client";

import * as React from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

interface VoiceNotesProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceNotes({ onTranscript, className = "" }: VoiceNotesProps) {
  const [isRecording, setIsRecording] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const recognitionRef = React.useRef<any>(null);

  React.useEffect(() => {
    // Check Web Speech API support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => {
      setIsRecording(true);
      toast("Voice dictation listening...", { icon: "🎙️" });
    };

    rec.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript;
      if (transcript) {
        onTranscript(transcript);
      }
    };

    rec.onerror = (event: any) => {
      console.error("Speech recognition error", event);
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied. Enable permissions to dictate.");
      } else {
        toast.error(`Dictation error: ${event.error}`);
      }
      setIsRecording(false);
    };

    rec.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [onTranscript]);

  const toggleRecording = () => {
    if (!supported) {
      toast.error("Voice dictation is not supported by your current browser. Try Chrome/Edge.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
        recognitionRef.current.stop();
      }
    }
  };

  if (!supported) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground p-1.5 border border-border/40 rounded-lg bg-secondary/20">
        <AlertCircle className="w-3.5 h-3.5 text-zinc-500" />
        <span>Voice dictation unsupported in this browser</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleRecording}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
        isRecording
          ? "bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
          : "bg-secondary/40 text-muted-foreground hover:text-foreground border-border/40 hover:border-border"
      } ${className}`}
      title={isRecording ? "Stop Dictating" : "Dictate Notes (Speech-to-Text)"}
    >
      {isRecording ? (
        <>
          <MicOff className="w-3.5 h-3.5" />
          <span>Stop Dictating</span>
        </>
      ) : (
        <>
          <Mic className="w-3.5 h-3.5 text-primary" />
          <span>Dictate Notes</span>
        </>
      )}
    </button>
  );
}
export default VoiceNotes;
