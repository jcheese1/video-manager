import type { FrontendSpeechDetectorState } from "../../video-editor/use-speech-detector";

interface SilenceIndicatorProps {
  speechState: FrontendSpeechDetectorState;
}

export function SilenceIndicator({ speechState }: SilenceIndicatorProps) {
  const getStatusText = (state: FrontendSpeechDetectorState): string => {
    switch (state.type) {
      case "warming-up":
        return "INIT";
      case "speaking-detected":
        return "SPEECH";
      case "long-enough-speaking-for-clip-detected":
        return "REC";
      case "silence":
        return "SILENT";
    }
  };

  const getBarColor = (state: FrontendSpeechDetectorState): string => {
    switch (state.type) {
      case "warming-up":
        return "bg-yellow-500/80";
      case "speaking-detected":
        return "bg-blue-400";
      case "long-enough-speaking-for-clip-detected":
        return "bg-green-500";
      case "silence":
        return "bg-transparent";
    }
  };

  const getIndicatorBars = (state: FrontendSpeechDetectorState): boolean[] => {
    switch (state.type) {
      case "warming-up":
        return [true, false, false, false, false, false, false, false];
      case "speaking-detected":
        return [true, true, true, true, true, false, false, false];
      case "long-enough-speaking-for-clip-detected":
        return [true, true, true, true, true, true, true, true];
      case "silence":
        return [false, false, false, false, false, false, false, false];
    }
  };

  const statusText = getStatusText(speechState);
  const barColor = getBarColor(speechState);
  const bars = getIndicatorBars(speechState);

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-px h-5 items-end">
        {bars.map((active, index) => (
          <div
            key={index}
            className={`w-1.5 transition-all ${
              active ? barColor : "bg-white/10"
            }`}
            style={{
              height: active ? `${(index + 1) * 12.5}%` : "15%",
            }}
          />
        ))}
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-white/70">
        {statusText}
      </span>
    </div>
  );
}
