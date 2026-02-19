import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  Download,
  Loader2,
  Undo2,
  Play,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { LiveClip } from "../hooks/use-recording-session";

interface LiveClipsTimelineProps {
  clips: LiveClip[];
  isRecording: boolean;
  isExporting: boolean;
  isDetecting?: boolean;
  selectedClipId: string | null;
  canUndo: boolean;
  onReorderClips: (clips: LiveClip[]) => void;
  onRemoveClip: (clipId: string) => void;
  onUndoRemove: () => void;
  onSelectClip: (clipId: string | null) => void;
  onPlayClip: (clipId: string) => void;
  onExport: () => void;
  totalDuration: number;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatDuration(startTime: number, endTime: number | null): string {
  if (endTime === null) return "...";
  const duration = endTime - startTime;
  return `${duration.toFixed(1)}s`;
}

// -- Clip item content (shared between sortable and overlay) --

interface ClipContentProps {
  clip: LiveClip;
  index: number;
  isRecording: boolean;
  isSelected: boolean;
  isDragOverlay?: boolean;
  onRemove?: () => void;
  onSelect?: () => void;
  onPlay?: () => void;
}

function ClipContent({
  clip,
  index,
  isRecording,
  isSelected,
  isDragOverlay,
  onRemove,
  onSelect,
  onPlay,
}: ClipContentProps) {
  const isComplete = clip.endTime !== null;

  return (
    <div
      className={`flex items-center justify-between px-2.5 py-2 border transition-colors ${
        isDragOverlay
          ? "bg-accent shadow-lg ring-1 ring-primary/50 border-primary/40"
          : isSelected
            ? "bg-primary/8 border-primary/30"
            : isComplete
              ? "bg-transparent border-border hover:bg-accent/40"
              : "bg-green-500/5 border-green-500/20"
      }`}
      onClick={isComplete && !isRecording ? onSelect : undefined}
      role={isComplete && !isRecording ? "button" : undefined}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Index number */}
        <span className="text-[10px] font-mono text-muted-foreground w-5 text-right shrink-0">
          {isComplete ? String(index + 1).padStart(2, "0") : "--"}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium">
              {isComplete ? `Clip ${index + 1}` : "Recording..."}
            </span>
            {isComplete && clip.takeId && (
              <span className="text-[8px] px-1 py-px bg-muted text-muted-foreground font-mono uppercase tracking-wider">
                T{clip.takeId.slice(0, 3)}
              </span>
            )}
            {!isComplete && (
              <span className="h-1 w-1 bg-green-500 animate-pulse" />
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/60 font-mono">
            {formatTime(clip.startTime)}
            {isComplete && ` > ${formatTime(clip.endTime!)}`}
            {" // "}
            {formatDuration(clip.startTime, clip.endTime)}
          </div>
        </div>
      </div>

      {!isRecording && isComplete && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
          >
            <Play className="h-3 w-3" />
          </button>
          <button
            className="h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-destructive transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// -- Sortable wrapper --

interface SortableLiveClipProps {
  clip: LiveClip;
  index: number;
  isRecording: boolean;
  isSelected: boolean;
  onRemove: () => void;
  onSelect: () => void;
  onPlay: () => void;
}

function SortableLiveClip({
  clip,
  index,
  isRecording,
  isSelected,
  onRemove,
  onSelect,
  onPlay,
}: SortableLiveClipProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const isComplete = clip.endTime !== null;

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-0.5">
      {!isRecording && isComplete && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 hover:text-primary text-muted-foreground/30 transition-colors shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      <div className="flex-1">
        <ClipContent
          clip={clip}
          index={index}
          isRecording={isRecording}
          isSelected={isSelected}
          onRemove={onRemove}
          onSelect={onSelect}
          onPlay={onPlay}
        />
      </div>
    </div>
  );
}

// -- Main component --

export function LiveClipsTimeline({
  clips,
  isRecording,
  isExporting,
  isDetecting,
  selectedClipId,
  canUndo,
  onReorderClips,
  onRemoveClip,
  onUndoRemove,
  onSelectClip,
  onPlayClip,
  onExport,
  totalDuration,
}: LiveClipsTimelineProps) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = clips.findIndex((c) => c.id === active.id);
      const newIndex = clips.findIndex((c) => c.id === over.id);
      const reordered = arrayMove(clips, oldIndex, newIndex);
      onReorderClips(reordered);
    }
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
  };

  const activeClip = activeDragId
    ? clips.find((c) => c.id === activeDragId)
    : null;
  const activeClipIndex = activeDragId
    ? clips.findIndex((c) => c.id === activeDragId)
    : -1;

  if (!isRecording && clips.length === 0 && !isDetecting) {
    return null;
  }

  const completedClips = clips.filter((c) => c.endTime !== null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Clips
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/50">
              {completedClips.length}
              {totalDuration > 0 && ` // ${formatTime(totalDuration)}`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {canUndo && !isRecording && (
              <button
                onClick={onUndoRemove}
                className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-1.5 py-1"
              >
                <Undo2 className="h-3 w-3" />
                Undo
              </button>
            )}

            {isRecording ? (
              <div className="flex items-center gap-1.5 text-[9px] text-green-400 uppercase tracking-wider">
                <span className="h-1 w-1 bg-green-500 animate-pulse" />
                Live
              </div>
            ) : isDetecting ? (
              <div className="flex items-center gap-1.5 text-[9px] text-blue-400 uppercase tracking-wider">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing
              </div>
            ) : (
              <Button
                onClick={onExport}
                size="sm"
                disabled={completedClips.length === 0 || isExporting}
                className="gap-1 h-6 text-[9px] uppercase tracking-wider font-semibold"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Export
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3" />
                    Export
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">
          {isRecording
            ? "Detecting clips in real-time"
            : isDetecting
              ? "Analyzing recording..."
              : "Click preview // Drag reorder"}
        </p>
      </div>

      {/* Clips list */}
      <div className="flex-1 overflow-y-auto">
        {clips.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider">
              {isDetecting ? "Analyzing..." : "No clips yet"}
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={clips.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="py-1">
                {clips.map((clip, index) => (
                  <SortableLiveClip
                    key={clip.id}
                    clip={clip}
                    index={index}
                    isRecording={isRecording}
                    isSelected={clip.id === selectedClipId}
                    onRemove={() => onRemoveClip(clip.id)}
                    onSelect={() =>
                      onSelectClip(clip.id === selectedClipId ? null : clip.id)
                    }
                    onPlay={() => onPlayClip(clip.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeClip ? (
                <ClipContent
                  clip={activeClip}
                  index={activeClipIndex}
                  isRecording={isRecording}
                  isSelected={false}
                  isDragOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
