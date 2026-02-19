import { Button } from "@/components/ui/button";
import { Circle, Square } from "lucide-react";
import type { OBSConnectionStatus } from "../types";

interface RecordingControlsProps {
  connectionStatus: OBSConnectionStatus;
  isRecording: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingControls({
  connectionStatus,
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
}: RecordingControlsProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-card border border-border relative">
      {/* Left: connection status */}
      <div className="flex items-center gap-2">
        <div
          className={`h-1.5 w-1.5 ${
            connectionStatus.connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {connectionStatus.connected ? "OBS Online" : "OBS Offline"}
        </span>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-medium text-red-400">
              {formatDuration(recordingDuration)}
            </span>
          </div>
        )}

        {!isRecording ? (
          <Button
            onClick={onStartRecording}
            disabled={!connectionStatus.connected}
            size="sm"
            className="gap-1.5 h-8 bg-red-600 hover:bg-red-700 text-white text-[10px] uppercase tracking-wider font-semibold"
          >
            <Circle className="h-3 w-3 fill-current" />
            Record
          </Button>
        ) : (
          <Button
            onClick={onStopRecording}
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-[10px] uppercase tracking-wider font-semibold border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </Button>
        )}
      </div>

      {/* Error */}
      {connectionStatus.error && (
        <div className="absolute -bottom-8 left-0 right-0">
          <div className="bg-destructive/10 border border-destructive/20 p-2">
            <p className="text-[10px] text-destructive font-mono">
              {connectionStatus.error}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
