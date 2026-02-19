import { useState, useCallback, useRef } from "react";
import { createTake, updateTakeFilePath } from "../db";

export interface LiveClip {
  id: string;
  dbId: string | null;
  takeId: string;
  /** file path of the take this clip belongs to */
  filePath: string;
  startTime: number;
  endTime: number | null;
  archived: boolean;
}

interface UseRecordingSessionReturn {
  // Live clip management (during recording, before persistence)
  addLiveClip: (clip: {
    id: string;
    startTime: number;
    endTime: number | null;
  }) => void;
  closeLiveClip: (endTime: number) => void;

  /** Append any unpersisted live clips onto loader clips. */
  mergedClips: (loaderClips: LiveClip[]) => LiveClip[];

  // Take lifecycle
  startNewTake: (recordingId: string, takeNumber: number) => Promise<string>;
  onTakeFilePathReceived: (filePath: string) => Promise<void>;
  clearLiveClips: () => void;

  // Selection
  selectedClipId: string | null;
  setSelectedClipId: (id: string | null) => void;

  // Current take
  currentTakeId: string | null;
}

export function useRecordingSession(): UseRecordingSessionReturn {
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentTakeId, setCurrentTakeId] = useState<string | null>(null);
  const [liveClips, setLiveClips] = useState<LiveClip[]>([]);

  const currentTakeIdRef = useRef(currentTakeId);
  currentTakeIdRef.current = currentTakeId;

  const pendingFilePathRef = useRef<string | null>(null);

  // --- Merged clips ---

  const mergedClips = useCallback(
    (loaderClips: LiveClip[]): LiveClip[] => {
      if (liveClips.length === 0) return loaderClips;

      const loaderIds = new Set(loaderClips.map((c) => c.id));
      const unpersisted = liveClips.filter(
        (c) => !c.dbId && !loaderIds.has(c.id),
      );
      return [...loaderClips, ...unpersisted];
    },
    [liveClips],
  );

  // --- Take lifecycle ---

  const startNewTake = useCallback(
    async (recordingId: string, takeNumber: number) => {
      const takeId = crypto.randomUUID();

      await createTake({
        id: takeId,
        recordingId,
        filePath: null,
        takeNumber,
      });

      setCurrentTakeId(takeId);
      currentTakeIdRef.current = takeId;
      setLiveClips([]);

      const pendingPath = pendingFilePathRef.current;
      pendingFilePathRef.current = null;

      if (pendingPath) {
        await updateTakeFilePath(takeId, pendingPath);
      }

      return takeId;
    },
    [],
  );

  const onTakeFilePathReceived = useCallback(async (filePath: string) => {
    const takeId = currentTakeIdRef.current;

    if (!takeId) {
      pendingFilePathRef.current = filePath;
      return;
    }

    await updateTakeFilePath(takeId, filePath);

    setLiveClips((prev) =>
      prev.map((c) => (c.takeId === takeId ? { ...c, filePath } : c)),
    );
  }, []);

  // --- Live clip management ---

  const addLiveClip = useCallback(
    (clip: { id: string; startTime: number; endTime: number | null }) => {
      const takeId = currentTakeIdRef.current;
      if (!takeId) return;

      setLiveClips((prev) => [
        ...prev,
        {
          id: clip.id,
          dbId: null,
          takeId,
          filePath: "",
          startTime: clip.startTime,
          endTime: clip.endTime,
          archived: false,
        },
      ]);
    },
    [],
  );

  const closeLiveClip = useCallback((endTime: number) => {
    setLiveClips((prev) => {
      const lastClip = prev.at(-1);
      if (!lastClip || lastClip.endTime !== null) return prev;

      const updated = [...prev];
      updated[updated.length - 1] = { ...lastClip, endTime };
      return updated;
    });
  }, []);

  const clearLiveClips = useCallback(() => {
    setLiveClips([]);
  }, []);

  return {
    addLiveClip,
    closeLiveClip,
    clearLiveClips,
    mergedClips,
    startNewTake,
    onTakeFilePathReceived,
    selectedClipId,
    setSelectedClipId,
    currentTakeId,
  };
}
