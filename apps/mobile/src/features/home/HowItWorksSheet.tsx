import { View } from "react-native";
import { Basket, Camera, HandCoins, Moped, type Icon } from "phosphor-react-native";
import { Button, Sheet, Text, type SheetController } from "@/components";
import { useTheme } from "@/theme/ThemeProvider";

const STEPS: { icon: Icon; title: string; body: string }[] = [
  {
    icon: Basket,
    title: "List what you need",
    body: "Pick a market, add each item with a budget — “₦3,000 of tomatoes, firm, for stew”.",
  },
  {
    icon: Camera,
    title: "We shop and show you",
    body: "Your shopper photographs every item. If something costs more today, they ask you first.",
  },
  {
    icon: Moped,
    title: "Delivered today",
    body: "Check everything at your door. Reject what isn't right and it's credited back.",
  },
  {
    icon: HandCoins,
    title: "Change comes back",
    body: "Whatever isn't spent lands in your wallet for next time, or withdraw it to your bank.",
  },
];

export function HowItWorksSheet({ sheet }: { sheet: SheetController }) {
  const { colors } = useTheme();
  return (
    <Sheet sheet={sheet} title="How OjaRun works" footer={<Button label="Got it" onPress={sheet.dismiss} />}>
      <View className="gap-5">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <View key={title} className="flex-row gap-4">
            <View className="items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
                <Icon size={20} color={colors.brand} weight="duotone" />
              </View>
              {i < STEPS.length - 1 ? <View className="mt-1 w-px flex-1 bg-line" /> : null}
            </View>
            <View className="flex-1 pb-1">
              <Text variant="bodyStrong">{title}</Text>
              <Text variant="small" tone="muted" className="mt-0.5">
                {body}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
