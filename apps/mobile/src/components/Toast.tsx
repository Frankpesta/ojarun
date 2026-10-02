import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { FadeOutDown, LinearTransition, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, Info, WarningCircle } from "phosphor-react-native";
import { motion } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

type ToastTone = "neutral" | "success" | "error";

type ToastInput = {
  message: string;
  tone?: ToastTone;
  /** For reversible actions, e.g. rejecting an item (05 §7.1). */
  action?: { label: string; onPress: () => void };
};

type ToastItem = ToastInput & { id: number };

type ToastApi = { show: (t: ToastInput) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** Distance above the bottom safe area; tab screens raise it to clear the tab bar. */
const ToastOffsetContext = createContext<{ set: (px: number) => void; offset: number }>({
  set: () => {},
  offset: 0,
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [offset, setOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(1);

  const show = useCallback((t: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    const id = nextId.current++;
    setToast({ ...t, id });
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), motion.toastMs);
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  const offsetApi = useMemo(() => ({ set: setOffset, offset }), [offset]);

  return (
    <ToastContext.Provider value={api}>
      <ToastOffsetContext.Provider value={offsetApi}>
        {children}
        <ToastHost toast={toast} offset={offset} onDismiss={() => setToast(null)} />
      </ToastOffsetContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastHost({ toast, offset, onDismiss }: { toast: ToastItem | null; offset: number; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (!toast) return null;

  const Icon = toast.tone === "success" ? CheckCircle : toast.tone === "error" ? WarningCircle : Info;
  const iconColor = toast.tone === "success" ? colors.brand : toast.tone === "error" ? colors.error : colors.inkMuted;

  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0" style={{ bottom: insets.bottom + 12 + offset }}>
      <Animated.View
        key={toast.id}
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={FadeOutDown.duration(160)}
        layout={LinearTransition}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        className="mx-4 flex-row items-center gap-3 rounded-card bg-ink px-4 py-3"
      >
        <Icon size={20} color={iconColor} weight="fill" />
        <Text variant="small" className="flex-1 text-bg">
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.action!.onPress();
              onDismiss();
            }}
            className="-my-2 -mr-2 px-3 py-3"
          >
            <Text variant="smallStrong" style={{ color: colors.brandTint }}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function useToastOffset() {
  return useContext(ToastOffsetContext);
}
