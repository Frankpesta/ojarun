import { useEffect, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Svg, { Path, Rect } from "react-native-svg";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { create } from "zustand";
import { Sticker, Text, type StickerKind } from "@/components";

/** The router (app/index) marks the app ready once it knows where to send the user. */
export const useSplash = create<{ appReady: boolean; markReady: () => void }>((set) => ({
  appReady: false,
  markReady: () => set({ appReady: true }),
}));

const FOREST = "#0B3B22";
const TILE = 124;
/** Long enough to read the brand, short enough not to be a toll. */
const MIN_SHOW_MS = 1500;
/** If nothing marks the app ready (e.g. a deep link skips app/index), get out of the way anyway. */
const MAX_SHOW_MS = 6000;

const STICKERS: { kind: StickerKind; size: number; x: number; y: number; rotate: number }[] = [
  { kind: "tomato", size: 76, x: -0.05, y: 0.15, rotate: -14 },
  { kind: "plantain", size: 84, x: 0.82, y: 0.21, rotate: 12 },
  { kind: "pepper", size: 64, x: 0.08, y: 0.72, rotate: 9 },
  { kind: "fish", size: 72, x: 0.76, y: 0.68, rotate: -8 },
];

function BasketMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="240 290 544 480">
      <Path d="M382 415 A130 130 0 0 1 642 415" fill="none" stroke="#FFFFFF" strokeWidth={44} strokeLinecap="round" />
      <Rect x={262} y={393} width={500} height={84} rx={42} fill="#FFFFFF" />
      <Path d="M300 501 H724 L688 695 Q680 741 634 741 H390 Q344 741 336 695 Z" fill="#FFFFFF" />
      <Rect x={410} y={549} width={24} height={140} rx={12} fill="#15803D" />
      <Rect x={500} y={549} width={24} height={140} rx={12} fill="#15803D" />
      <Rect x={590} y={549} width={24} height={140} rx={12} fill="#15803D" />
    </Svg>
  );
}

function FloatingSticker({ index, width, height, reduce }: { index: number; width: number; height: number; reduce: boolean }) {
  const s = STICKERS[index]!;
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) p.value = withDelay(320 + index * 110, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [p, index, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.4 + 0.6 * p.value }, { rotate: `${s.rotate * p.value}deg` }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", left: s.x * width, top: s.y * height }, style]}>
      <Sticker kind={s.kind} size={s.size} />
    </Animated.View>
  );
}

function LoadingDot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const phase = (progress.value + index / 3) % 1;
    return { opacity: 0.25 + 0.75 * Math.max(0, Math.sin(phase * Math.PI)) };
  });
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" }, style]} />;
}

/**
 * Takes over from the native splash (same forest background, same tile in the same place),
 * then plays the brand moment and fades into the app once the router is ready.
 */
export function AnimatedSplash() {
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const appReady = useSplash((s) => s.appReady);
  const [minElapsed, setMinElapsed] = useState(false);
  const [gone, setGone] = useState(false);

  const rings = useSharedValue(reduce ? 1 : 0);
  const tile = useSharedValue(1);
  const words = useSharedValue(reduce ? 1 : 0);
  const dots = useSharedValue(0);
  const exit = useSharedValue(0);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), reduce ? 400 : MIN_SHOW_MS);
    const max = setTimeout(() => useSplash.getState().markReady(), MAX_SHOW_MS);
    if (!reduce) {
      rings.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      tile.value = withSequence(withTiming(1.06, { duration: 220 }), withSpring(1, { damping: 10, stiffness: 160 }));
      words.value = withDelay(220, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
      dots.value = withDelay(700, withRepeat(withTiming(1, { duration: 900 }), -1, false));
    }
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, [reduce, rings, tile, words, dots]);

  useEffect(() => {
    if (!appReady || !minElapsed) return;
    exit.value = withTiming(1, { duration: reduce ? 150 : 360, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) runOnJS(setGone)(true);
    });
  }, [appReady, minElapsed, exit, reduce]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: rings.value, transform: [{ scale: 0.85 + 0.15 * rings.value }] }));
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: tile.value * (1 + 0.12 * exit.value) }] }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: words.value, transform: [{ translateY: 14 * (1 - words.value) }] }));
  if (gone) return null;

  const cx = width / 2;
  const cy = height / 2;

  return (
    <Animated.View
      pointerEvents={appReady && minElapsed ? "none" : "auto"}
      onLayout={() => void SplashScreen.hideAsync()}
      style={[StyleSheet.absoluteFill, { backgroundColor: FOREST, zIndex: 100 }, rootStyle]}
      accessible
      accessibilityLabel="OjaRun is loading"
    >
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
        {[720, 520].map((d, i) => (
          <View
            key={d}
            style={{
              position: "absolute",
              left: cx - d / 2,
              top: cy - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              borderWidth: 1,
              borderColor: i === 0 ? "rgba(167,215,181,0.08)" : "rgba(167,215,181,0.12)",
            }}
          />
        ))}
        <View
          style={{
            position: "absolute",
            left: cx - 150,
            top: cy - 150,
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: "rgba(74,222,128,0.10)",
          }}
        />
      </Animated.View>

      {STICKERS.map((_, i) => (
        <FloatingSticker key={i} index={i} width={width} height={height} reduce={reduce} />
      ))}

      <Animated.View
        style={[
          {
            position: "absolute",
            left: cx - TILE / 2,
            top: cy - TILE / 2,
            width: TILE,
            height: TILE,
            borderRadius: 37,
            backgroundColor: "#15803D",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 18 },
            elevation: 16,
          },
          tileStyle,
        ]}
      >
        <BasketMark size={78} />
      </Animated.View>

      <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: cy + TILE / 2 + 22, alignItems: "center" }, wordStyle]}>
        <Text variant="display" tone="inherit" style={{ color: "#FFFFFF", fontSize: 44, lineHeight: 50, letterSpacing: -1.4 }}>
          Oja<Text variant="display" tone="inherit" style={{ color: "#FF8A5B", fontSize: 44, lineHeight: 50 }}>Run</Text>
        </Text>
        <Text variant="bodyStrong" tone="inherit" style={{ color: "#A7D7B5", marginTop: 6 }}>
          Akure's markets, delivered
        </Text>
      </Animated.View>

      <View style={{ position: "absolute", bottom: 64, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <LoadingDot key={i} index={i} progress={dots} />
        ))}
      </View>
    </Animated.View>
  );
}
