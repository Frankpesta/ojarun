import { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "@/components";
import { useTheme } from "@/theme/ThemeProvider";

/** Seconds until `at`, ticking once a second; 0 once it's passed. */
export function useSecondsLeft(at: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null || at <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [at]);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The price-check countdown ring (05 §9 M5): pepper arc shrinking towards zero. */
export function CountdownRing({ expiresAt, totalSec, size = 22, showLabel = true }: { expiresAt: number; totalSec: number; size?: number; showLabel?: boolean }) {
  const { colors } = useTheme();
  const left = useSecondsLeft(expiresAt);
  const r = 9;
  const circumference = 2 * Math.PI * r;
  const frac = totalSec > 0 ? Math.min(1, left / totalSec) : 0;
  return (
    <View className="flex-row items-center gap-1.5" accessible accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={r} fill="none" stroke={colors.accentTint} strokeWidth={3} />
        <Circle
          cx={12}
          cy={12}
          r={r}
          fill="none"
          stroke={colors.accent}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${circumference * frac} ${circumference}`}
          transform="rotate(-90 12 12)"
        />
      </Svg>
      {showLabel ? (
        <Text variant="smallStrong" tone="accent" tabular className="font-extrabold">
          {mmss(left)}
        </Text>
      ) : null}
    </View>
  );
}
