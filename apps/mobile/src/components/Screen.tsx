import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { Text } from "./Text";

export type ScreenProps = {
  title?: string;
  subtitle?: string;
  /** Right of the title, e.g. an icon button. */
  headerRight?: ReactNode;
  children: ReactNode;
  /** Pinned under the scroll area: the screen's single primary action. */
  footer?: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
};

/** Standard screen: safe area, 20 px gutters, left-aligned large title (05 §7.2). */
export function Screen({ title, subtitle, headerRight, children, footer, scroll = true, edges = ["top"] }: ScreenProps) {
  const header = title ? (
    <View className="flex-row items-start justify-between gap-4 pt-4 pb-5">
      <View className="flex-1">
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" tone="muted" className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={edges} className="flex-1 bg-bg">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-gutter pb-8"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-gutter">
          {header}
          {children}
        </View>
      )}
      {footer ? <View className="px-gutter pt-3 pb-4 gap-2 bg-bg">{footer}</View> : null}
    </SafeAreaView>
  );
}
