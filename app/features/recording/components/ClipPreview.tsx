import { useRef, useEffect, useCallback, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { LiveClip } from "../hooks/use-recording-session";

interface ClipPreviewProps {
  clips: LiveClip[];
  selectedClipId: string | null;
  playingClipId: string | null;
  onClipEnded: () => void;
  onSelectClip: (clipId: string | null) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ClipPreview({
  clips,
  selectedClipId,
  playingClipId,
  onClipEnded,
  onSelectClip,
}: ClipPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const selectedClip = selectedClipId
    ? clips.find((c) => c.id === selectedClipId)
    : null;

  const selectedIndex = selectedClipId
    ? clips.findIndex((c) => c.id === selectedClipId)
    : -1;

  const videoSrc = selectedClip?.filePath
    ? convertFileSrc(selectedClip.filePath)
    : null;

  // When clip or src changes: load video and seek to clip start
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip || !videoSrc) return;

    const seekToStart = () => {
      video.currentTime = selectedClip.startTime;
      setCurrentTime(selectedClip.startTime);
    };

    // If src is different, set it and wait for load
    if (video.src !== videoSrc) {
      video.src = videoSrc;
      video.addEventListener("loadeddata", seekToStart, { once: true });
      video.load();
    } else {
      // Same src, just seek
      seekToStart();
    }
  }, [selectedClipId, videoSrc]);

  // Auto-play when playingClipId is set
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playingClipId) return;

    const clip = clips.find((c) => c.id === playingClipId);
    if (!clip || clip.endTime === null) return;

    const src = clip.filePath ? convertFileSrc(clip.filePath) : null;
    if (!src) return;

    const startPlay = () => {
      video.currentTime = clip.startTime;
      video.play().catch(console.error);
      setIsPlaying(true);
    };

    if (video.src !== src) {
      video.src = src;
      video.addEventListener("loadeddata", startPlay, { once: true });
      video.load();
    } else if (video.readyState >= 1) {
      startPlay();
    } else {
      video.addEventListener("loadeddata", startPlay, { once: true });
    }
  }, [playingClipId, clips]);

  // Monitor playback — pause at clip end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkTime = () => {
      setCurrentTime(video.currentTime);

      const activeClip = playingClipId
        ? clips.find((c) => c.id === playingClipId)
        : selectedClip;

      if (activeClip && activeClip.endTime !== null && !video.paused) {
        if (video.currentTime >= activeClip.endTime) {
          video.pause();
          setIsPlaying(false);
          onClipEnded();
        }
      }

      animFrameRef.current = requestAnimationFrame(checkTime);
    };

    animFrameRef.current = requestAnimationFrame(checkTime);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [playingClipId, selectedClip, clips, onClipEnded]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      const clip = selectedClip;
      if (clip && clip.endTime !== null && video.currentTime >= clip.endTime) {
        video.currentTime = clip.startTime;
      }
      video.play().catch(console.error);
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [selectedClip]);

  const goToPrevClip = useCallback(() => {
    if (selectedIndex <= 0) return;
    const prevClip = clips[selectedIndex - 1];
    if (prevClip) onSelectClip(prevClip.id);
  }, [selectedIndex, clips, onSelectClip]);

  const goToNextClip = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= clips.length - 1) return;
    const nextClip = clips[selectedIndex + 1];
    if (nextClip) onSelectClip(nextClip.id);
  }, [selectedIndex, clips, onSelectClip]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goToPrevClip();
          break;
        case "ArrowRight":
          e.preventDefault();
          goToNextClip();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, goToPrevClip, goToNextClip]);

  const clipProgress =
    selectedClip && selectedClip.endTime !== null
      ? Math.min(
          Math.max(
            (currentTime - selectedClip.startTime) /
              (selectedClip.endTime - selectedClip.startTime),
            0
          ),
          1
        )
      : 0;

  return (
    <div className="border border-border bg-card">
      {/* Video */}
      <div className="aspect-video bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          preload="auto"
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      </div>

      {selectedClip ? (
        <div className="p-3 space-y-2 border-t border-border">
          {/* Progress bar — sharp, no rounding */}
          <div className="w-full h-1 bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-100"
              style={{ width: `${clipProgress * 100}%` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
              {selectedIndex + 1}/{clips.length}
            </span>

            <div className="flex items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={goToPrevClip}
                disabled={selectedIndex <= 0}
              >
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={goToNextClip}
                disabled={selectedIndex >= clips.length - 1}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            </div>

            <span className="text-[10px] text-muted-foreground font-mono">
              {formatTime(currentTime)}/
              {selectedClip.endTime !== null
                ? formatTime(selectedClip.endTime)
                : "--:--"}
            </span>
          </div>

          <p className="text-[9px] text-center text-muted-foreground/40 uppercase tracking-wider">
            Space play/pause // Arrows navigate
          </p>
        </div>
      ) : (
        <div className="p-4 border-t border-border">
          <p className="text-[10px] text-center text-muted-foreground/40 uppercase tracking-wider">
            Select a clip to preview
          </p>
        </div>
      )}
    </div>
  );
}
