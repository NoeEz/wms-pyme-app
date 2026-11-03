import * as Haptics from "expo-haptics";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { getPreferences } from "./preferences";

// Per-read confirmation for scans: a short beep and/or a haptic pulse,
// honoring the operator's "Preferencias de escaneo" toggles.

export type FeedbackKind = "success" | "warning" | "error";

const SOUNDS: Record<FeedbackKind, number> = {
  success: require("../../assets/sounds/scan-ok.wav"),
  warning: require("../../assets/sounds/scan-warn.wav"),
  error: require("../../assets/sounds/scan-error.wav"),
};

const HAPTICS: Record<FeedbackKind, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

const players: Partial<Record<FeedbackKind, AudioPlayer>> = {};

function player(kind: FeedbackKind): AudioPlayer {
  return (players[kind] ??= createAudioPlayer(SOUNDS[kind]));
}

export function scanFeedback(kind: FeedbackKind): void {
  const prefs = getPreferences();
  if (prefs.vibration) {
    Haptics.notificationAsync(HAPTICS[kind]).catch(() => {});
  }
  if (prefs.sound) {
    try {
      const p = player(kind);
      p.seekTo(0);
      p.play();
    } catch {
      // Audio is best-effort; a missing output device must never block a scan.
    }
  }
}
