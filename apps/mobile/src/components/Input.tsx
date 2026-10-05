import { forwardRef, useState, type ReactNode } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { fontFamily } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

export type InputProps = Omit<TextInputProps, "style"> & {
  label: string;
  /** Helper text under the field; replaced by the error when there is one. */
  hint?: string;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Inside a Sheet, so the sheet tracks the keyboard (05 §7.1). */
  inSheet?: boolean;
  /** Large, tabular text for amounts. */
  large?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, leading, trailing, inSheet, large, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const Field = (inSheet ? BottomSheetTextInput : TextInput) as typeof TextInput;

  const border = error ? colors.error : focused ? colors.brand : colors.lineStrong;

  return (
    <View className="gap-2">
      <Text variant="smallStrong" nativeID={`${label}-label`}>
        {label}
      </Text>
      <View
        className={`flex-row items-center rounded-input bg-surface px-4 ${editable ? "" : "opacity-60"}`}
        style={{ minHeight: large ? 60 : 56, borderWidth: focused || error ? 2 : 1.5, borderColor: border }}
      >
        {leading ? <View className="mr-2">{leading}</View> : null}
        <Field
          ref={ref}
          editable={editable}
          accessibilityLabelledBy={`${label}-label`}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.brand}
          cursorColor={colors.brand}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            color: colors.ink,
            fontFamily: large ? fontFamily.semibold : fontFamily.regular,
            fontSize: large ? 22 : 17,
            fontVariant: large ? ["tabular-nums"] : undefined,
            paddingVertical: 12,
          }}
          maxFontSizeMultiplier={1.4}
          {...rest}
        />
        {trailing ? <View className="ml-2">{trailing}</View> : null}
      </View>
      {error ? (
        <Text variant="small" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
