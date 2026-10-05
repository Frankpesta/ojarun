import { View } from "react-native";

/** Onboarding progress: sign in → your details → address. */
export function StepBar({ step, of }: { step: number; of: number }) {
  return (
    <View className="flex-row gap-1.5" accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <View key={i} className={`h-[5px] flex-1 rounded-full ${i < step ? "bg-brand" : "bg-line-strong"}`} />
      ))}
    </View>
  );
}
