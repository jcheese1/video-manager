import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useFetcher } from "react-router";

import { Button } from "@/components/ui/button";
import { AudioLevelMeter } from "@/features/recording/components/AudioLevelMeter";
import { ClipPreview } from "@/features/recording/components/ClipPreview";
import { LiveClipsTimeline } from "@/features/recording/components/LiveClipsTimeline";
import { RecordingControls } from "@/features/recording/components/RecordingControls";
import { SilenceIndicator } from "@/features/recording/components/SilenceIndicator";
import {
  getRecording,
  getTakesForRecording,
  getClipsForRecording,
  getNextClipPosition,
  saveClipsForTake,
  archiveClip,
  restoreClip,
  reorderClips,
  type TakeRecord,
} from "@/features/recording/db";
import {
  useRecordingSession,
  type LiveClip,
} from "@/features/recording/hooks/use-recording-session";
import type { DetectedClip } from "@/features/recording/types";
import {
  useSpeechDetector,
  useWatchForSpeechDetected,
} from "@/features/video-editor/use-speech-detector";
import { useGlobalSettings } from "@/hooks/use-global-settings";
import { useToast } from "@/hooks/use-toast";

import type { Route } from "./+types/recordings.$id";
import type { RecordingsOutletContext } from "./recordings";

// --- helpers ---

function dbClipsToLiveClips(
  dbClips: Awaited<ReturnType<typeof getClipsForRecording>>,
  takes: TakeRecord[]
): LiveClip[] {
  const takeMap = new Map(takes.map((t) => [t.id, t]));
  return dbClips
    .filter((c) => takeMap.get(c.take_id)?.file_path)
    .map((c) => ({
      id: c.id,
      dbId: c.id,
      takeId: c.take_id,
      filePath: takeMap.get(c.take_id)!.file_path!,
      startTime: c.source_start_time,
      endTime: c.source_end_time,
      archived: false,
    }));
}

// --- loader: full recording data ---

export const clientLoader = async ({ params }: Route.ClientLoaderArgs) => {
  const { id } = params;

  const recording = await getRecording(id);
  if (!recording) throw new Error("Recording not found");

  const takes = await getTakesForRecording(id);
  const dbClips = await getClipsForRecording(id);
  const clips = dbClipsToLiveClips(dbClips, takes);

  return { recording, takes, clips };
};

clientLoader.hydrate = true as const;

// --- action: mutations ---

export const clientAction = async ({
  request,
  params,
}: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const recordingId = params.id;

  switch (intent) {
    case "removeClip": {
      const clipId = formData.get("clipId") as string;
      await archiveClip(clipId);
      return { ok: true };
    }

    case "undoRemove": {
      const clipId = formData.get("clipId") as string;
      await restoreClip(clipId);
      return { ok: true };
    }

    case "reorderClips": {
      const clipIds = JSON.parse(formData.get("clipIds") as string) as string[];
      await reorderClips(recordingId, clipIds);
      return { ok: true };
    }

    case "redetect":
    case "takeStopped": {
      const takeId = formData.get("takeId") as string;
      const filePath = formData.get("filePath") as string;
      const threshold = Number(formData.get("threshold"));

      const detected = await invoke<DetectedClip[]>("detect_silence", {
        filePath,
        startTime: null,
        threshold,
      });

      const startPosition = await getNextClipPosition(recordingId);
      const clips = detected.map((clip, i) => ({
        id: crypto.randomUUID(),
        startTime: clip.start_time,
        endTime: clip.end_time,
        position: startPosition + i,
      }));

      await saveClipsForTake(recordingId, takeId, clips);
      return { ok: true };
    }

    default: {
      throw new Error(`Unknown intent: ${intent}`);
    }
  }
};

export default function RecordingDetail({ loaderData }: Route.ComponentProps) {
  const { recording, takes: loaderTakes, clips: loaderClips } = loaderData;
  const { obsRecording } = useOutletContext<RecordingsOutletContext>();
  const session = useRecordingSession();
  const fetcher = useFetcher();

  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const { settings: globalSettings } = useGlobalSettings();
  const toast = useToast();
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [archiveStack, setArchiveStack] = useState<string[]>([]);

  const recordingIntervalRef = useRef<number | null>(null);
  const wasRecordingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const currentSpeechStartTimeRef = useRef<number | null>(null);

  // Merge loader clips with any live (non-persisted) clips from the session

  const clips = session.mergedClips(loaderClips);

  const isDetecting =
    fetcher.state !== "idle" &&
    (fetcher.formData?.get("intent") === "redetect" ||
      fetcher.formData?.get("intent") === "takeStopped");

  // --- OBS camera stream ---

  useEffect(() => {
    if (!obsRecording.state.connectionStatus.connected) {
      setMediaStream(null);
      return;
    }

    let unmounted = false;

    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const obsCamera = devices.find(
          (d) =>
            d.kind === "videoinput" && d.label.includes("OBS Virtual Camera")
        );

        const stream = await navigator.mediaDevices.getUserMedia({
          video: obsCamera ? { deviceId: obsCamera.deviceId } : true,
          audio: true,
        });
        if (!unmounted) setMediaStream(stream);
      } catch {
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (!unmounted) setMediaStream(fallback);
        } catch {
          toast.add({
            title: "Failed to access camera/mic",
            type: "error",
          });
        }
      }
    })();

    return () => {
      unmounted = true;
    };
  }, [obsRecording.state.connectionStatus.connected]);

  const liveVideoRefCallback = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el && mediaStream) {
        el.srcObject = mediaStream;
        el.play().catch(console.error);
      }
    },
    [mediaStream]
  );

  // --- Speech detection ---

  const speechDetectorState = useSpeechDetector({
    mediaStream,
    isRecording: obsRecording.state.isRecording,
  });

  useEffect(() => {
    if (
      speechDetectorState.type === "speaking-detected" &&
      currentSpeechStartTimeRef.current === null
    ) {
      if (recordingStartTimeRef.current) {
        currentSpeechStartTimeRef.current =
          (Date.now() - recordingStartTimeRef.current) / 1000;
      }
    } else if (
      speechDetectorState.type === "silence" ||
      speechDetectorState.type === "warming-up"
    ) {
      currentSpeechStartTimeRef.current = null;
    }
  }, [speechDetectorState]);

  useWatchForSpeechDetected({
    state: speechDetectorState,
    onSpeechPartStarted: (soundDetectionId) => {
      if (
        !recordingStartTimeRef.current ||
        currentSpeechStartTimeRef.current === null
      )
        return;

      session.addLiveClip({
        id: soundDetectionId,
        startTime: currentSpeechStartTimeRef.current,
        endTime: null,
      });
    },
    onSpeechPartEnded: () => {
      if (!recordingStartTimeRef.current) return;
      const currentTime = (Date.now() - recordingStartTimeRef.current) / 1000;
      session.closeLiveClip(currentTime);
      currentSpeechStartTimeRef.current = null;
    },
  });

  // --- Recording lifecycle ---

  useEffect(() => {
    if (obsRecording.state.isRecording) {
      setRecordingDuration(0);
      recordingStartTimeRef.current = Date.now();
      wasRecordingRef.current = true;

      session.startNewTake(recording.id, loaderTakes.length + 1).catch(() => {
        toast.add({ title: "Failed to start take", type: "error" });
      });

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      recordingStartTimeRef.current = null;
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }

    return () => {
      if (recordingIntervalRef.current)
        clearInterval(recordingIntervalRef.current);
    };
  }, [obsRecording.state.isRecording]);

  // When recording stops → submit takeStopped action for clip detection
  useEffect(() => {
    if (
      !obsRecording.state.isRecording &&
      wasRecordingRef.current &&
      obsRecording.state.currentVideoPath
    ) {
      wasRecordingRef.current = false;
      const takeId = session.currentTakeId;
      if (!takeId) return;

      // Clear live clips — loader will have the real ones after revalidation
      session.clearLiveClips();

      // Ensure take has file path saved (race condition guard)
      session
        .onTakeFilePathReceived(obsRecording.state.currentVideoPath)
        .then(() => {
          fetcher.submit(
            {
              intent: "takeStopped",
              takeId,
              filePath: obsRecording.state.currentVideoPath!,
              threshold: String(globalSettings.silenceThreshold),
            },
            { method: "post" }
          );
        })
        .catch((error) => {
          toast.add({
            title: "Clip detection failed",
            description: error instanceof Error ? error.message : String(error),
            type: "error",
          });
        });
    }
  }, [obsRecording.state.isRecording]);

  // --- Handlers ---

  const handleStartRecording = useCallback(async () => {
    try {
      await obsRecording.startRecording();
    } catch {
      toast.add({ title: "Failed to start recording", type: "error" });
    }
  }, [obsRecording]);

  const handleStopRecording = useCallback(async () => {
    try {
      await obsRecording.stopRecording();
    } catch {
      toast.add({ title: "Failed to stop recording", type: "error" });
    }
  }, [obsRecording]);

  const handleExport = useCallback(async () => {
    if (clips.length === 0) return;

    const clipsToExport: DetectedClip[] = clips
      .filter((c: LiveClip) => c.endTime !== null && c.filePath)
      .map((c: LiveClip) => ({
        input_video: c.filePath,
        start_time: c.startTime,
        end_time: c.endTime!,
      }));

    if (clipsToExport.length === 0) return;

    try {
      setIsExporting(true);
      const outputPath = await save({
        defaultPath: `${recording.name ?? "export"}.mp4`,
        filters: [{ name: "Video", extensions: ["mp4"] }],
      });
      if (!outputPath) {
        setIsExporting(false);
        return;
      }

      await invoke("export_video_clips", {
        clipsJson: JSON.stringify(clipsToExport),
        outputPath,
      });

      toast.add({ title: "Export complete", type: "success" });
    } catch (error) {
      toast.add({
        title: "Export failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }, [clips, recording]);

  const handleRedetect = useCallback(() => {
    const takeId = session.currentTakeId;
    if (!takeId) return;

    const take = loaderTakes.find((t) => t.id === takeId);
    if (!take?.file_path) return;

    fetcher.submit(
      {
        intent: "redetect",
        takeId,
        filePath: take.file_path,
        threshold: String(globalSettings.silenceThreshold),
      },
      { method: "post" }
    );
  }, [session.currentTakeId, loaderTakes, globalSettings.silenceThreshold]);

  const handleRemoveClip = useCallback(
    (clipId: string) => {
      const clip = clips.find((c: LiveClip) => c.id === clipId);
      if (!clip?.dbId) return;

      fetcher.submit(
        { intent: "removeClip", clipId: clip.dbId },
        { method: "post" }
      );
      setArchiveStack((prev) => [...prev, clip.dbId!]);

      if (session.selectedClipId === clipId) session.setSelectedClipId(null);
    },
    [clips, session.selectedClipId]
  );

  const handleUndoRemove = useCallback(() => {
    const lastArchived = archiveStack.at(-1);
    if (!lastArchived) return;

    fetcher.submit(
      { intent: "undoRemove", clipId: lastArchived },
      { method: "post" }
    );
    setArchiveStack((prev) => prev.slice(0, -1));
  }, [archiveStack]);

  const handleReorderClips = useCallback((reorderedClips: LiveClip[]) => {
    const dbClipIds = reorderedClips.filter((c) => c.dbId).map((c) => c.dbId!);
    if (dbClipIds.length === 0) return;

    fetcher.submit(
      { intent: "reorderClips", clipIds: JSON.stringify(dbClipIds) },
      { method: "post" }
    );
  }, []);

  const handlePlayClip = useCallback(
    (clipId: string) => {
      session.setSelectedClipId(clipId);
      setPlayingClipId(clipId);
    },
    [session]
  );

  const handleClipEnded = useCallback(() => {
    setPlayingClipId(null);
  }, []);

  // --- Computed ---

  const totalDuration = clips
    .filter((c: LiveClip) => c.endTime !== null)
    .reduce((sum: number, c: LiveClip) => sum + (c.endTime! - c.startTime), 0);

  const hasCompletedTakes = loaderTakes.length > 0;
  const showPreview = !obsRecording.state.isRecording && hasCompletedTakes;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main panel */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {/* Recording header */}
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-wider">
              {recording.name}
            </h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
              {loaderTakes.length} take
              {loaderTakes.length !== 1 && "s"}
              {clips.length > 0 &&
                ` // ${clips.length} clip${clips.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        {/* Video area */}
        {obsRecording.state.isRecording || !showPreview ? (
          <div className="border border-border bg-card">
            <div className="aspect-video bg-black relative">
              {mediaStream ? (
                <video
                  ref={liveVideoRefCallback}
                  className="w-full h-full object-contain"
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground/40">
                  <p className="text-xs uppercase tracking-wider">
                    Waiting for OBS...
                  </p>
                </div>
              )}

              {obsRecording.state.isRecording && (
                <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <SilenceIndicator speechState={speechDetectorState} />
                  <div className="flex-1 max-w-xs">
                    <AudioLevelMeter
                      mediaStream={mediaStream}
                      isRecording={obsRecording.state.isRecording}
                      silenceThreshold={globalSettings.silenceThreshold}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <ClipPreview
            clips={clips}
            selectedClipId={session.selectedClipId}
            playingClipId={playingClipId}
            onClipEnded={handleClipEnded}
            onSelectClip={session.setSelectedClipId}
          />
        )}

        {/* Recording controls */}
        <RecordingControls
          connectionStatus={obsRecording.state.connectionStatus}
          isRecording={obsRecording.state.isRecording}
          recordingDuration={recordingDuration}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />

        {/* Re-detect clips with current global threshold */}
        {!obsRecording.state.isRecording && session.currentTakeId && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRedetect}
              disabled={isDetecting}
              className="gap-1.5 h-7 text-[10px] uppercase tracking-wider"
            >
              <RefreshCw className="h-3 w-3" />
              Re-detect clips ({globalSettings.silenceThreshold}dB)
            </Button>
          </div>
        )}
      </div>

      {/* Right panel: clip timeline */}
      <div className="w-[340px] border-l border-border overflow-y-auto shrink-0 bg-sidebar">
        <LiveClipsTimeline
          clips={clips}
          isRecording={obsRecording.state.isRecording}
          isExporting={isExporting}
          isDetecting={isDetecting}
          selectedClipId={session.selectedClipId}
          canUndo={archiveStack.length > 0}
          onReorderClips={handleReorderClips}
          onRemoveClip={handleRemoveClip}
          onUndoRemove={handleUndoRemove}
          onSelectClip={session.setSelectedClipId}
          onPlayClip={handlePlayClip}
          onExport={handleExport}
          totalDuration={totalDuration}
        />
      </div>
    </div>
  );
}
