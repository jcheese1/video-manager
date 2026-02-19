import { useEffect, useRef, useState } from "react";

export type SpeechDetectorState =
  | {
      type: "initial-silence-detected";
      silenceStartTime: number;
      lastLongEnoughSilenceEndTime: number | null;
      isLongEnoughSpeech: boolean;
      soundDetectionId: string | null;
    }
  | {
      type: "long-enough-silence-detected";
      silenceStartTime: number;
    }
  | {
      type: "no-silence-detected";
      lastLongEnoughSilenceEndTime: number | null;
      isLongEnoughSpeech: boolean;
      soundDetectionId: string | null;
    };

export type FrontendSpeechDetectorState =
  | { type: "warming-up" }
  | { type: "speaking-detected" }
  | { type: "long-enough-speaking-for-clip-detected"; soundDetectionId: string }
  | { type: "silence" };

const SPEAKING_THRESHOLD = -33;
const LONG_ENOUGH_TIME_IN_MILLISECONDS = 800;
const LONG_ENOUGH_SPEECH_TIME_IN_MILLISECONDS = 1400;

const resolveFrontendSpeechDetectorState = (
  state: SpeechDetectorState,
): FrontendSpeechDetectorState => {
  if (
    state.type === "initial-silence-detected" ||
    state.type === "no-silence-detected"
  ) {
    if (state.lastLongEnoughSilenceEndTime === null) {
      return { type: "warming-up" };
    }
    if (state.isLongEnoughSpeech && state.soundDetectionId) {
      return {
        type: "long-enough-speaking-for-clip-detected",
        soundDetectionId: state.soundDetectionId,
      };
    }
    return { type: "speaking-detected" };
  }

  if (state.type === "long-enough-silence-detected") {
    return { type: "silence" };
  }

  state satisfies never;
  throw new Error("Invalid speech detector state");
};

const INITIAL_STATE: SpeechDetectorState = {
  type: "no-silence-detected",
  lastLongEnoughSilenceEndTime: null,
  isLongEnoughSpeech: false,
  soundDetectionId: null,
};

export const useSpeechDetector = (opts: {
  mediaStream: MediaStream | null;
  isRecording: boolean;
}) => {
  const [frontendState, setFrontendState] =
    useState<FrontendSpeechDetectorState>({ type: "warming-up" });

  // Keep state in a ref so the rAF loop doesn't cause effect re-subscriptions
  const stateRef = useRef<SpeechDetectorState>({ ...INITIAL_STATE });

  // Reset on recording start
  useEffect(() => {
    if (opts.isRecording) {
      stateRef.current = { ...INITIAL_STATE };
      setFrontendState({ type: "warming-up" });
    }
  }, [opts.isRecording]);

  useEffect(() => {
    if (!opts.mediaStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(opts.mediaStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    let rafId: number;

    const tick = () => {
      analyser.getFloatTimeDomainData(data);

      // RMS → dB
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i]! * data[i]!;
      }
      const rms = Math.sqrt(sum / data.length);
      const volumeDb = 20 * Math.log10(rms + 1e-10);

      const now = performance.now();
      const prev = stateRef.current;
      let next: SpeechDetectorState = prev;

      switch (prev.type) {
        case "no-silence-detected": {
          if (volumeDb < SPEAKING_THRESHOLD) {
            next = {
              type: "initial-silence-detected",
              silenceStartTime: now,
              lastLongEnoughSilenceEndTime: prev.lastLongEnoughSilenceEndTime,
              isLongEnoughSpeech: prev.isLongEnoughSpeech,
              soundDetectionId: prev.soundDetectionId,
            };
          } else if (
            typeof prev.lastLongEnoughSilenceEndTime === "number" &&
            !prev.isLongEnoughSpeech
          ) {
            const speakingTime = now - prev.lastLongEnoughSilenceEndTime;
            if (speakingTime > LONG_ENOUGH_SPEECH_TIME_IN_MILLISECONDS) {
              next = {
                ...prev,
                isLongEnoughSpeech: true,
                soundDetectionId: crypto.randomUUID(),
              };
            }
          }
          break;
        }
        case "initial-silence-detected": {
          if (volumeDb > SPEAKING_THRESHOLD) {
            next = {
              type: "no-silence-detected",
              lastLongEnoughSilenceEndTime: prev.lastLongEnoughSilenceEndTime,
              isLongEnoughSpeech: prev.isLongEnoughSpeech,
              soundDetectionId: prev.soundDetectionId,
            };
          } else if (
            now - prev.silenceStartTime >
            LONG_ENOUGH_TIME_IN_MILLISECONDS
          ) {
            next = {
              type: "long-enough-silence-detected",
              silenceStartTime: now,
            };
          } else if (
            typeof prev.lastLongEnoughSilenceEndTime === "number" &&
            !prev.isLongEnoughSpeech
          ) {
            const speakingTime = now - prev.lastLongEnoughSilenceEndTime;
            if (speakingTime > LONG_ENOUGH_SPEECH_TIME_IN_MILLISECONDS) {
              next = {
                ...prev,
                isLongEnoughSpeech: true,
                soundDetectionId: crypto.randomUUID(),
              };
            }
          }
          break;
        }
        case "long-enough-silence-detected": {
          if (volumeDb > SPEAKING_THRESHOLD) {
            next = {
              type: "no-silence-detected",
              lastLongEnoughSilenceEndTime: now,
              isLongEnoughSpeech: false,
              soundDetectionId: null,
            };
          }
          break;
        }
      }

      if (next !== prev) {
        stateRef.current = next;
        setFrontendState(resolveFrontendSpeechDetectorState(next));
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close();
    };
  }, [opts.mediaStream]);

  return frontendState;
};

export const useWatchForSpeechDetected = (opts: {
  state: FrontendSpeechDetectorState;
  onSpeechPartEnded: () => void;
  onSpeechPartStarted: (soundDetectionId: string) => void;
}) => {
  const prevState = useRef<FrontendSpeechDetectorState>(opts.state);
  useEffect(() => {
    if (
      prevState.current.type === "long-enough-speaking-for-clip-detected" &&
      opts.state.type === "silence"
    ) {
      opts.onSpeechPartEnded();
    }
    if (
      prevState.current.type === "speaking-detected" &&
      opts.state.type === "long-enough-speaking-for-clip-detected"
    ) {
      opts.onSpeechPartStarted(opts.state.soundDetectionId);
    }
    prevState.current = opts.state;
  }, [opts.state, opts.onSpeechPartEnded]);
};
