import { Text } from "./Text";

/** "Oja" in Market Green, "Run" in Pepper Orange (doc 03 §5). */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <Text
      variant="display"
      accessibilityRole="header"
      accessibilityLabel="OjaRun"
      style={{ fontSize: size, lineHeight: size * 1.2, letterSpacing: -0.5 }}
    >
      <Text variant="display" tone="brand" style={{ fontSize: size, lineHeight: size * 1.2 }}>
        Oja
      </Text>
      <Text variant="display" tone="accent" style={{ fontSize: size, lineHeight: size * 1.2 }}>
        Run
      </Text>
    </Text>
  );
}
