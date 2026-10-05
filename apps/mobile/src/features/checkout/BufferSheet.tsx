import { View } from "react-native";
import { ArrowCounterClockwise, ChatCircleText, TrendUp } from "phosphor-react-native";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { Button, Sheet, Text, type SheetController } from "@/components";
import { useTheme } from "@/theme/ThemeProvider";

/** Explains the price-rise buffer before the customer pays for it (05 §2, §7.1). */
export function BufferSheet({ sheet }: { sheet: SheetController }) {
  return (
    <Sheet
      sheet={sheet}
      title="What's the buffer?"
      subtitle="A little extra, paid now, so a price rise never stops your shopping."
      footer={<Button label="Got it" variant="secondary" onPress={() => sheet.dismiss()} />}
    >
      <View className="gap-4">
        <Point icon={TrendUp} title="Prices move during the day" body="If tomatoes cost more than your budget, your shopper asks you before spending more." />
        <Point icon={ChatCircleText} title="You approve every extra naira" body="Approvals come out of the buffer first, then your wallet. Nothing is spent without your OK." />
        <Point icon={ArrowCounterClockwise} title="Unused buffer comes back" body="Whatever isn't used lands in your wallet when you accept the delivery." />
      </View>
    </Sheet>
  );
}

function Point({ icon: Icon, title, body }: { icon: PhosphorIcon; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
        <Icon size={20} color={colors.brand} weight="bold" />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          {title}
        </Text>
        <Text variant="small" tone="muted">
          {body}
        </Text>
      </View>
    </View>
  );
}
