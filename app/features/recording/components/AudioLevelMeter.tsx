import { useAudioLevel } from "../hooks/use-audio-level";

interface AudioLevelMeterProps {
  mediaStream: MediaStream | null;
  isRecording: boolean;
  silenceThreshold: number;
}

export function AudioLevelMeter({
  mediaStream,
  isRecording,
  silenceThreshold,
}: AudioLevelMeterProps) {
  const db = useAudioLevel({ mediaStream, isRecording });

  // Map dB range [-80, 0] → [0, 100]%
  const MIN_DB = -80;
  const MAX_DB = 0;
  const pct = Math.max(
    0,
    Math.min(100, ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 100)
  );
  const thresholdPct = Math.max(
    0,
    Math.min(100, ((silenceThreshold - MIN_DB) / (MAX_DB - MIN_DB)) * 100)
  );

  const isSpeaking = db > silenceThreshold;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 uppercase tracking-wider">
        <span>Level</span>
        <span className="font-mono">
          {db > -79 ? `${db.toFixed(0)}dB` : "--"}
        </span>
      </div>

      {/* Meter bar — sharp, no rounding */}
      <div className="relative h-2 bg-black/40">
        <div
          className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${
            isSpeaking ? "bg-green-500" : "bg-zinc-600"
          }`}
          style={{ width: `${pct}%` }}
        />

        {/* Threshold marker */}
        <div
          className="absolute inset-y-0 w-px bg-red-500/80"
          style={{ left: `${thresholdPct}%` }}
        />
      </div>

      {/* Scale */}
      <div className="flex justify-between text-[8px] text-muted-foreground/30 font-mono">
        <span>-80</span>
        <span>-60</span>
        <span>-40</span>
        <span>-20</span>
        <span>0</span>
      </div>
    </div>
  );
}
