export type RecordingStatus =
  | "idle"
  | "recording"
  | "processing"
  | "ready-to-export"
  | "exporting";

export interface DetectedClip {
  input_video: string;
  start_time: number;
  end_time: number;
}

export interface RecordingState {
  status: RecordingStatus;
  obsConnected: boolean;
  currentVideoPath: string | null;
  detectedClips: DetectedClip[];
  recordingStartTime: number | null;
  recordingDuration: number;
}

export interface OBSConnectionStatus {
  connected: boolean;
  virtualCameraActive: boolean;
  recording: boolean;
  error: string | null;
}

export interface SilenceDetectionResult {
  clips: DetectedClip[];
  processingTime: number;
}

export interface ExportOptions {
  clips: DetectedClip[];
  outputPath: string;
}
