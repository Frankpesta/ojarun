import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";

/** Borders, not shadows (05 §7.2). Dark mode gets depth from surface tones. */
export function Card({ children, className = "", ...rest }: ViewProps & { children: ReactNode; className?: string }) {
  return (
    <View className={`rounded-card border border-line bg-surface p-4 ${className}`} {...rest}>
      {children}
    </View>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <View className={`h-px bg-line ${className}`} />;
}
