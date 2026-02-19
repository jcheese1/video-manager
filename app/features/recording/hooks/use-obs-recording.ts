import { OBSWebSocket } from "obs-websocket-js";
import { useCallback, useEffect, useState, useMemo } from "react";

import type { OBSConnectionStatus } from "../types";

export interface OBSRecordingState {
  connectionStatus: OBSConnectionStatus;
  isRecording: boolean;
  currentVideoPath: string | null;
  profile: string | null;
  scene: string | null;
}

interface UseOBSRecordingReturn {
  state: OBSRecordingState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  reconnect: () => Promise<void>;
}

export function useOBSRecording(): UseOBSRecordingReturn {
  const [websocket] = useState(() => new OBSWebSocket());

  const [connectionStatus, setConnectionStatus] = useState<OBSConnectionStatus>(
    {
      connected: false,
      virtualCameraActive: false,
      recording: false,
      error: null,
    },
  );

  const [isRecording, setIsRecording] = useState(false);
  const [currentVideoPath, setCurrentVideoPath] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [scene, setScene] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      console.log("Connecting to OBS WebSocket at ws://localhost:4455");
      await websocket.connect("ws://localhost:4455");

      const [profileResponse, sceneResponse, virtualCamResponse] =
        await Promise.all([
          websocket.call("GetProfileList"),
          websocket.call("GetSceneList"),
          websocket.call("GetVirtualCamStatus"),
        ]);

      setProfile(profileResponse.currentProfileName);
      setScene(sceneResponse.currentProgramSceneName);

      setConnectionStatus({
        connected: true,
        virtualCameraActive: virtualCamResponse.outputActive,
        recording: false,
        error: null,
      });

      console.log("Connected to OBS successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to connect to OBS:", errorMessage);

      setConnectionStatus({
        connected: false,
        virtualCameraActive: false,
        recording: false,
        error: errorMessage,
      });
    }
  }, [websocket]);

  const reconnect = useCallback(async () => {
    console.log("Reconnecting to OBS...");
    await connect();
  }, [connect]);

  // Setup event listeners
  useEffect(() => {
    if (!connectionStatus.connected) return;

    const recordingListener = (e: {
      outputActive: boolean;
      outputState: string;
      outputPath: string;
    }) => {
      console.log("Recording state changed:", e);

      if (e.outputState === "OBS_WEBSOCKET_OUTPUT_STARTING") {
        // Clear old path before new recording starts
        setCurrentVideoPath(null);
      } else if (e.outputState === "OBS_WEBSOCKET_OUTPUT_STARTED") {
        setIsRecording(true);
        setCurrentVideoPath(e.outputPath);
        setConnectionStatus((prev) => ({ ...prev, recording: true }));
      } else if (e.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") {
        setIsRecording(false);
        setConnectionStatus((prev) => ({ ...prev, recording: false }));
      }
    };

    const profileChangedListener = (e: { profileName: string }) => {
      console.log("Profile changed:", e.profileName);
      setProfile(e.profileName);
    };

    const sceneChangedListener = (e: { sceneName: string }) => {
      console.log("Scene changed:", e.sceneName);
      setScene(e.sceneName);
    };

    const virtualCamListener = (e: { outputActive: boolean }) => {
      console.log("Virtual camera state changed:", e.outputActive);
      setConnectionStatus((prev) => ({
        ...prev,
        virtualCameraActive: e.outputActive,
      }));
    };

    const connectionClosedListener = () => {
      console.log("OBS connection closed");
      setConnectionStatus({
        connected: false,
        virtualCameraActive: false,
        recording: false,
        error: "Connection closed",
      });
      setIsRecording(false);
    };

    websocket.on("RecordStateChanged", recordingListener);
    websocket.on("CurrentProfileChanged", profileChangedListener);
    websocket.on("CurrentProgramSceneChanged", sceneChangedListener);
    websocket.on("VirtualcamStateChanged", virtualCamListener);
    websocket.on("ConnectionClosed", connectionClosedListener);

    return () => {
      websocket.removeListener("RecordStateChanged", recordingListener);
      websocket.removeListener("CurrentProfileChanged", profileChangedListener);
      websocket.removeListener(
        "CurrentProgramSceneChanged",
        sceneChangedListener,
      );
      websocket.removeListener("VirtualcamStateChanged", virtualCamListener);
      websocket.removeListener("ConnectionClosed", connectionClosedListener);
    };
  }, [connectionStatus.connected, websocket]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (connectionStatus.connected) {
        websocket.disconnect().catch(console.error);
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!connectionStatus.connected) {
      throw new Error("OBS is not connected");
    }

    try {
      await websocket.call("StartRecord");
      console.log("Recording started");
    } catch (error) {
      console.error("Failed to start recording:", error);
      throw error;
    }
  }, [connectionStatus.connected, websocket]);

  const stopRecording = useCallback(async () => {
    if (!connectionStatus.connected) {
      throw new Error("OBS is not connected");
    }

    try {
      await websocket.call("StopRecord");
      console.log("Recording stopped");
    } catch (error) {
      console.error("Failed to stop recording:", error);
      throw error;
    }
  }, [connectionStatus.connected, websocket]);

  const state = useMemo(
    () => ({
      connectionStatus,
      isRecording,
      currentVideoPath,
      profile,
      scene,
    }),
    [connectionStatus, isRecording, currentVideoPath, profile, scene],
  );

  return {
    state,
    startRecording,
    stopRecording,
    reconnect,
  };
}
