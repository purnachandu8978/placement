import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProctoringState {
  isCameraActive: boolean;
  isMicActive: boolean;
  audioLevel: number; // 0 - 100
  faceStatus: 'detected' | 'absent' | 'multiple' | 'obscured' | 'checking';
  warningMessage: string | null;
  hasPermission: boolean;
  permissionError: string | null;
}

interface UseProctoringMediaProps {
  onViolation?: (eventType: string, details: string) => void;
  enabled?: boolean;
}

/**
 * Acquire media stream with robust fallback:
 * 1. Tries ideal combined video + audio
 * 2. Tries standard combined video + audio
 * 3. Tries separate acquisition and merges tracks so one failing device doesn't block the other
 */
async function acquireProctoringStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Webcam and audio access not supported by browser.');
  }

  // 1. Try ideal constraints
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err1) {
    // 2. Try basic constraints
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (err2) {
      // 3. Try separate video and audio acquisition
      let vStream: MediaStream | null = null;
      let aStream: MediaStream | null = null;
      let lastErr = err2;

      try {
        vStream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (ve) {
        lastErr = ve;
      }

      try {
        aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (ae) {
        if (!vStream) lastErr = ae;
      }

      const combinedTracks: MediaStreamTrack[] = [
        ...(vStream ? vStream.getVideoTracks() : []),
        ...(aStream ? aStream.getAudioTracks() : []),
      ];

      if (combinedTracks.length === 0) {
        throw lastErr || new Error('Unable to access camera or microphone.');
      }

      return new MediaStream(combinedTracks);
    }
  }
}

export function useProctoringMedia({ onViolation, enabled = true }: UseProctoringMediaProps = {}) {
  const [state, setState] = useState<ProctoringState>({
    isCameraActive: false,
    isMicActive: false,
    audioLevel: 0,
    faceStatus: 'checking',
    warningMessage: null,
    hasPermission: false,
    permissionError: null,
  });

  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIntentionalStopRef = useRef(false);
  const isStartingRef = useRef(false);

  // Keep a stable ref to onViolation so changing parent callbacks never re-trigger media initialization
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;

  // Trackers to avoid false-positive transient spikes
  const absentSecondsRef = useRef(0);
  const obscuredSecondsRef = useRef(0);
  const speechSecondsRef = useRef(0);
  const lastViolationTimeRef = useRef<Record<string, number>>({});
  const warmupCyclesRef = useRef(0);

  const emitViolation = useCallback((type: string, message: string, cooldownMs = 20000) => {
    const now = Date.now();
    const last = lastViolationTimeRef.current[type] || 0;
    if (now - last > cooldownMs) {
      lastViolationTimeRef.current[type] = now;
      if (onViolationRef.current) {
        onViolationRef.current(type, message);
      }
    }
  }, []);

  // Safely bind video element with autoplay permissions
  const bindVideoElement = useCallback((videoEl: HTMLVideoElement | null, mediaStream: MediaStream | null) => {
    if (!videoEl || !mediaStream) return;
    try {
      videoEl.muted = true;
      videoEl.defaultMuted = true;
      if (videoEl.srcObject !== mediaStream) {
        videoEl.srcObject = mediaStream;
      }
      videoEl.play().catch(() => {});
    } catch {}
  }, []);

  // 1. Initialize Media Stream once when enabled
  const startMedia = useCallback(async () => {
    // If stream already exists and is active, simply reuse it without re-opening hardware
    if (streamRef.current && streamRef.current.active) {
      const vTracks = streamRef.current.getVideoTracks().filter(t => t.readyState === 'live');
      const aTracks = streamRef.current.getAudioTracks().filter(t => t.readyState === 'live');
      if (vTracks.length > 0 || aTracks.length > 0) {
        setStream(streamRef.current);
        bindVideoElement(videoRef.current, streamRef.current);
        setState(s => ({
          ...s,
          isCameraActive: vTracks.length > 0,
          isMicActive: aTracks.length > 0,
          hasPermission: true,
          permissionError: null,
          faceStatus: 'detected',
        }));
        return;
      }
    }

    if (isStartingRef.current) return;
    isStartingRef.current = true;
    isIntentionalStopRef.current = false;
    warmupCyclesRef.current = 0;

    try {
      const mediaStream = await acquireProctoringStream();
      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Attach stream to videoRef
      bindVideoElement(videoRef.current, mediaStream);

      const hasVideo = mediaStream.getVideoTracks().some(t => t.readyState === 'live');
      const hasAudio = mediaStream.getAudioTracks().some(t => t.readyState === 'live');

      // Handle external disconnection (user unplugs camera/mic)
      mediaStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (!isIntentionalStopRef.current) {
            setState((s) => ({ ...s, isCameraActive: false, warningMessage: 'Webcam disconnected.' }));
            emitViolation('camera_disconnected', 'Webcam stream was disconnected or disabled.');
          }
        };
      });

      mediaStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (!isIntentionalStopRef.current) {
            setState((s) => ({ ...s, isMicActive: false, warningMessage: 'Microphone disconnected.' }));
            emitViolation('mic_disconnected', 'Microphone stream was disconnected or disabled.');
          }
        };
      });

      // Setup Web Audio API Analyser
      if (hasAudio) {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
              ctx.resume().catch(() => {});
            }
            const source = ctx.createMediaStreamSource(mediaStream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);

            audioContextRef.current = ctx;
            analyserRef.current = analyser;
          }
        } catch (e) {
          console.warn('AudioContext initialization note:', e);
        }
      }

      setState({
        isCameraActive: hasVideo,
        isMicActive: hasAudio,
        audioLevel: 0,
        faceStatus: 'detected',
        warningMessage: null,
        hasPermission: true,
        permissionError: null,
      });
    } catch (err: any) {
      console.warn('Proctoring media access error:', err);
      setState((s) => ({
        ...s,
        hasPermission: false,
        permissionError: err?.message || 'Webcam or microphone access was denied.',
      }));
    } finally {
      isStartingRef.current = false;
    }
  }, [emitViolation, bindVideoElement]);

  // Stop Media Cleanly without firing track onended handlers
  const stopMedia = useCallback(() => {
    isIntentionalStopRef.current = true;
    isStartingRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.onended = null; // Detach onended so intentional stop never dispatches false disconnect violations
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }

    setStream(null);
    setState({
      isCameraActive: false,
      isMicActive: false,
      audioLevel: 0,
      faceStatus: 'checking',
      warningMessage: null,
      hasPermission: false,
      permissionError: null,
    });
  }, []);

  // Periodic Background Proctoring Check (runs calmly every 1000ms)
  useEffect(() => {
    if (!enabled || !state.hasPermission || !streamRef.current) return;

    const audioData = new Uint8Array(analyserRef.current ? analyserRef.current.frequencyBinCount : 0);

    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;

    let isNativeFaceDetectorAvailable = 'FaceDetector' in window;
    let nativeDetector: any = null;
    if (isNativeFaceDetectorAvailable) {
      try {
        nativeDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      } catch {
        isNativeFaceDetectorAvailable = false;
      }
    }

    intervalRef.current = setInterval(async () => {
      warmupCyclesRef.current += 1;

      // Ensure AudioContext is running
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      // A. Audio Level Processing
      let normalized = 0;
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(audioData);
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
          sum += audioData[i];
        }
        const avg = sum / (audioData.length || 1);
        normalized = Math.min(100, Math.round((avg / 128) * 100));

        // Detect sustained voice speech (over high threshold of 65 for > 5 seconds, ignoring typing / ambient noise)
        if (normalized > 65) {
          speechSecondsRef.current += 1.0;
          if (speechSecondsRef.current >= 5.0) {
            emitViolation('speech_detected', 'Sustained vocal conversation detected in candidate room.');
            speechSecondsRef.current = 0;
          }
        } else {
          speechSecondsRef.current = Math.max(0, speechSecondsRef.current - 1.0);
        }

        // Only update audioLevel state on meaningful shifts (>= 15%) to avoid re-render thrashing
        setState((prev) => {
          if (Math.abs(prev.audioLevel - normalized) >= 15) {
            return { ...prev, audioLevel: normalized };
          }
          return prev;
        });
      }

      // B. Video Face & Visual Processing (wait 3 seconds warmup for camera exposure to stabilize)
      if (warmupCyclesRef.current > 3 && videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
        const video = videoRef.current;

        if (isNativeFaceDetectorAvailable && nativeDetector) {
          try {
            const faces = await nativeDetector.detect(video);
            if (faces.length === 0) {
              absentSecondsRef.current += 1.0;
              if (absentSecondsRef.current >= 8.0) {
                setState((s) => ({
                  ...s,
                  faceStatus: 'absent',
                  warningMessage: 'Candidate face not detected.',
                }));
                emitViolation('face_absent', 'No candidate face detected in proctoring camera.');
              }
            } else if (faces.length > 1) {
              absentSecondsRef.current = 0;
              setState((s) => ({
                ...s,
                faceStatus: 'multiple',
                warningMessage: 'Multiple individuals detected.',
              }));
              emitViolation('multiple_faces', `${faces.length} faces detected in examination camera.`);
            } else {
              absentSecondsRef.current = 0;
              setState((s) => {
                if (s.faceStatus !== 'detected' || s.warningMessage !== null) {
                  return { ...s, faceStatus: 'detected', warningMessage: null };
                }
                return s;
              });
            }
          } catch {
            isNativeFaceDetectorAvailable = false;
          }
        } else {
          // Canvas luminance fallback
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = 80;
            canvas.height = 60;
            ctx = canvas.getContext('2d', { willReadFrequently: true });
          }

          if (ctx) {
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const data = imgData.data;

              let totalBrightness = 0;
              let sampleCount = data.length / 16;
              for (let i = 0; i < data.length; i += 16) {
                totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
              }
              const avgBrightness = totalBrightness / (sampleCount || 1);

              // Only flag obscured if pitch black for > 6 consecutive seconds
              if (avgBrightness < 8) {
                obscuredSecondsRef.current += 1.0;
                if (obscuredSecondsRef.current >= 6.0) {
                  setState((s) => ({
                    ...s,
                    faceStatus: 'obscured',
                    warningMessage: 'Camera appears covered or pitch black.',
                  }));
                  emitViolation('camera_obscured', 'Webcam lens appears completely covered or darkened.');
                }
              } else {
                obscuredSecondsRef.current = 0;
                setState((s) => {
                  if (s.faceStatus !== 'detected' || s.warningMessage !== null) {
                    return { ...s, faceStatus: 'detected', warningMessage: null };
                  }
                  return s;
                });
              }
            } catch {}
          }
        }
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, state.hasPermission, emitViolation]);

  // Mount effect: start media once when enabled
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (enabled) {
      // Small 150ms timeout to avoid React 19 strict mode immediate unmount race
      timer = setTimeout(() => {
        void startMedia();
      }, 150);
    }
    return () => {
      if (timer) clearTimeout(timer);
      stopMedia();
    };
  }, [enabled]);

  return {
    ...state,
    videoRef,
    stream,
    bindVideoElement,
    startMedia,
    stopMedia,
  };
}
