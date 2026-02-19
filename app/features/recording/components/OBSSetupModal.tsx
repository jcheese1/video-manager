import { Check, ExternalLink, Loader2, MonitorPlay } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface OBSSetupModalProps {
  open: boolean;
  isConnected: boolean;
  isVirtualCameraActive: boolean;
  onDismiss: () => void;
}

const STEPS = [
  {
    title: "Install OBS Studio",
    description: "Download and install OBS Studio if you haven't already.",
    detail: "https://obsproject.com/download",
  },
  {
    title: "Enable WebSocket Server",
    description:
      'Open OBS → Tools → WebSocket Server Settings → Enable "Enable WebSocket Server".',
    detail: "Port must be 4455 (default). Disable authentication.",
  },
  {
    title: "Start Virtual Camera",
    description:
      'In OBS, click "Start Virtual Camera" in the Controls dock (bottom-right).',
    detail:
      "This lets the app preview your camera feed and detect speech in real-time.",
  },
  {
    title: "Configure Recording Output",
    description:
      "Settings → Output → Recording → set format to MP4 or MKV (remux to MP4).",
    detail:
      'Recommended: "Output Mode: Advanced", Encoder: x264 or hardware, Rate Control: CRF 18-23.',
  },
] as const;

export function OBSSetupModal({
  open,
  isConnected,
  isVirtualCameraActive,
  onDismiss,
}: OBSSetupModalProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const isReady = isConnected && isVirtualCameraActive;

  return (
    <Dialog
      open={open}
      modal
      onOpenChange={() => {
        /* non-dismissable */
      }}
    >
      <DialogContent className="max-w-lg gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center h-9 w-9 border border-border bg-card">
            <MonitorPlay className="h-4 w-4 text-primary" />
          </div>
          <div>
            <DialogTitle>OBS Studio Setup</DialogTitle>
            <DialogDescription className="mt-0.5">
              Connect OBS to start recording.
            </DialogDescription>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-1 mb-5">
          {STEPS.map((step, i) => {
            const done =
              (i === 0 && isConnected) ||
              (i === 1 && isConnected) ||
              (i === 2 && isVirtualCameraActive);

            return (
              <button
                key={i}
                type="button"
                onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                className="w-full text-left"
              >
                <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30 transition-colors">
                  <span
                    className={`text-[10px] font-mono mt-0.5 w-4 shrink-0 ${done ? "text-green-500" : "text-muted-foreground/60"}`}
                  >
                    {done ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11px] font-medium uppercase tracking-wider ${done ? "text-muted-foreground" : ""}`}
                    >
                      {step.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      {step.description}
                    </p>
                    {expandedStep === i && (
                      <p className="text-[10px] text-muted-foreground/70 font-mono mt-1.5 leading-relaxed">
                        {step.detail.startsWith("http") ? (
                          <a
                            href={step.detail}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {step.detail}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          step.detail
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Connection status */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={`h-1.5 w-1.5 ${isConnected ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {isConnected ? "WebSocket Connected" : "Waiting for OBS..."}
            </span>
            {!isConnected && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>

          {isConnected && (
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 ${isVirtualCameraActive ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {isVirtualCameraActive
                  ? "Virtual Camera Active"
                  : "Virtual Camera Off — start it in OBS"}
              </span>
            </div>
          )}

          {isReady && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={onDismiss}
                className="gap-1.5 h-8 text-[10px] uppercase tracking-wider font-semibold"
              >
                <Check className="h-3 w-3" />
                Continue
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
