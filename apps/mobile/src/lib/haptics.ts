import * as Haptics from "expo-haptics";

/** One vocabulary for touch feedback (05 §7.4). Failures are ignored: haptics are never critical. */
export const haptic = {
  /** Chips, steppers, tab changes. */
  select: () => void Haptics.selectionAsync().catch(() => {}),
  /** Payment confirmed, item bought, order accepted. */
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  /** A price check arrived; something needs attention. */
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  /** Hold-to-confirm completed. */
  heavy: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
};
