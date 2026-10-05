import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AccessibilityInfo, BackHandler, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetView,
  useBottomSheetSpringConfigs,
  useBottomSheetTimingConfigs,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretLeft } from "phosphor-react-native";
import { motion, radius, sizes } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { Pressable } from "../Pressable";
import { Text } from "../Text";
import { Button } from "../Button";

/**
 * Every modal in OjaRun is one of these (05 §7.1).
 * - action:   content-sized; swipe, backdrop tap or back closes it.
 * - form:     content-sized, rises with the keyboard; unsaved input asks before discarding.
 * - list:     50% / 92% snap points with a scrollable body (pass BottomSheetFlatList children).
 * - critical: content-sized; backdrop taps never dismiss; the primary action needs an explicit tap.
 */
export type SheetVariant = "action" | "form" | "list" | "critical";

export type SheetController = {
  ref: RefObject<BottomSheetModal | null>;
  present: () => void;
  dismiss: () => void;
};

export function useSheet(): SheetController {
  const ref = useRef<BottomSheetModal>(null);
  return useMemo(
    () => ({
      ref,
      present: () => ref.current?.present(),
      dismiss: () => ref.current?.dismiss(),
    }),
    [],
  );
}

export type SheetProps = {
  sheet: SheetController;
  title: string;
  subtitle?: string;
  variant?: SheetVariant;
  /** Shows a back chevron; used for steps inside one sheet. Android back calls it too. */
  onBack?: () => void;
  /** Sticky footer: one primary action, optionally a secondary text action above it. */
  footer?: ReactNode;
  /** form only: there's unsaved input. Dismissing asks first. */
  dirty?: boolean;
  onDismiss?: () => void;
  /** Changes when the step changes, so content cross-fades. */
  stepKey?: string | number;
  /** Beside the title, e.g. the item's sticker. */
  leading?: ReactNode;
  children: ReactNode;
};

const LIST_SNAP_POINTS = ["50%", "92%"];

export function Sheet({
  sheet,
  title,
  subtitle,
  variant = "action",
  onBack,
  footer,
  dirty = false,
  onDismiss,
  stepKey,
  leading,
  children,
}: SheetProps) {
  const { colors, name, scrimOpacity } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const titleRef = useRef<View>(null);
  const nudge = useSharedValue(0);

  const isList = variant === "list";
  const guarded = variant === "form" && dirty;

  const spring = useBottomSheetSpringConfigs({ ...motion.sheetSpring, overshootClamping: false });
  const timing = useBottomSheetTimingConfigs({ duration: motion.reducedSheetMs });

  const askToDiscard = useCallback(() => {
    setConfirmDiscard(true);
    haptic.warning();
    nudge.value = withSequence(
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 80 }),
      withTiming(0, { duration: 60 }),
    );
  }, [nudge]);

  const requestClose = useCallback(() => {
    if (guarded) askToDiscard();
    else sheet.dismiss();
  }, [guarded, askToDiscard, sheet]);

  // Android back: step back first, then close (or ask, if there's unsaved input).
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (onBack) onBack();
      else requestClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onBack, requestClose]);

  useEffect(() => {
    if (!dirty) setConfirmDiscard(false);
  }, [dirty]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={scrimOpacity}
        style={[props.style, { backgroundColor: colors.scrim }]}
        pressBehavior={variant === "critical" || guarded ? "none" : "close"}
        onPress={guarded ? askToDiscard : undefined}
      />
    ),
    [scrimOpacity, colors.scrim, variant, guarded, askToDiscard],
  );

  const renderHandle = useCallback(
    () => (
      <View className="items-center pt-2 pb-2">
        <View
          style={{
            width: sizes.grabberWidth,
            height: sizes.grabberHeight,
            borderRadius: 2,
            backgroundColor: colors.inkMuted,
            opacity: 0.4,
          }}
        />
      </View>
    ),
    [colors.inkMuted],
  );

  const footerPad = { paddingBottom: insets.bottom + 12 };

  const renderListFooter = useCallback(
    (props: BottomSheetFooterProps) =>
      footer ? (
        <BottomSheetFooter {...props}>
          <View className="bg-surface-raised border-t border-line px-5 pt-3 gap-2" style={footerPad}>
            {footer}
          </View>
        </BottomSheetFooter>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [footer, insets.bottom],
  );

  const headerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));

  // Animation and className sit on separate views: NativeWind drops className on animated views.
  const header = (
    <Animated.View style={headerStyle}>
      <View className="flex-row items-start px-5 pt-1 pb-4 gap-2">
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="-ml-3 items-center justify-center"
            style={{ width: sizes.minTarget, height: sizes.minTarget, marginTop: -10 }}
          >
            <CaretLeft size={22} color={colors.ink} weight="bold" />
          </Pressable>
        ) : null}
        {leading ? <View className="mr-1.5">{leading}</View> : null}
        <View className="flex-1 justify-center" style={leading ? { minHeight: 56 } : undefined}>
          <View ref={titleRef} accessible accessibilityRole="header">
            <Text variant="heading">{title}</Text>
          </View>
          {subtitle ? (
            <Text variant="small" tone="muted" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );

  const discardRow = confirmDiscard ? (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
      <View className="mx-5 mb-3 rounded-card bg-error-tint px-4 py-3 gap-3">
        <Text variant="smallStrong">Discard your changes?</Text>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button label="Keep editing" variant="secondary" size="sm" onPress={() => setConfirmDiscard(false)} />
          </View>
          <View className="flex-1">
            <Button
              label="Discard"
              variant="danger"
              size="sm"
              onPress={() => {
                setConfirmDiscard(false);
                sheet.dismiss();
              }}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  ) : null;

  const body = (
    <Animated.View key={stepKey} entering={reduceMotion ? undefined : FadeIn.duration(180)}>
      {children}
    </Animated.View>
  );

  return (
    <BottomSheetModal
      ref={sheet.ref}
      snapPoints={isList ? LIST_SNAP_POINTS : undefined}
      enableDynamicSizing={!isList}
      enablePanDownToClose={!guarded}
      animationConfigs={reduceMotion ? timing : spring}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      footerComponent={isList ? renderListFooter : undefined}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top + 8}
      backgroundStyle={{
        backgroundColor: colors.surfaceRaised,
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
      }}
      style={
        name === "light"
          ? {
              shadowColor: "#0C1A12",
              shadowOpacity: 0.12,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -4 },
              elevation: 16,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
            }
          : undefined
      }
      onChange={(index) => {
        const isOpen = index >= 0;
        setOpen(isOpen);
        if (isOpen && titleRef.current) AccessibilityInfo.sendAccessibilityEvent(titleRef.current, "focus");
      }}
      onDismiss={() => {
        setOpen(false);
        setConfirmDiscard(false);
        onDismiss?.();
      }}
    >
      {isList ? (
        <View
          className="flex-1"
          accessibilityViewIsModal
          accessibilityActions={[{ name: "escape", label: "Close" }]}
          onAccessibilityAction={() => requestClose()}
        >
          {header}
          {body}
        </View>
      ) : (
        <BottomSheetView
          accessibilityViewIsModal
          accessibilityActions={[{ name: "escape", label: "Close" }]}
          onAccessibilityAction={() => requestClose()}
          onAccessibilityEscape={requestClose}
        >
          {header}
          {discardRow}
          <View className="px-5">{body}</View>
          {footer ? (
            <View className="px-5 pt-5 gap-2" style={footerPad}>
              {footer}
            </View>
          ) : (
            <View style={footerPad} />
          )}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
