import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Bank, Basket, CaretLeft, Storefront } from "phosphor-react-native";
import { formatNaira, type ItemStatus, type Kobo } from "@ojarun/shared";
import {
  Button,
  Card,
  Chip,
  DelayedSkeleton,
  Divider,
  EmptyState,
  HoldToConfirm,
  Input,
  ItemStatusPill,
  ListItem,
  MoneyInput,
  OtpInput,
  Pressable,
  Screen,
  Sheet,
  Skeleton,
  StatusPill,
  Text,
  useSheet,
  useToast,
} from "@/components";
import { Wordmark } from "@/components/Wordmark";
import { ThemeSheet } from "@/features/account/ThemeSheet";
import { useTheme } from "@/theme/ThemeProvider";

const BANKS = [
  "Access Bank",
  "First Bank of Nigeria",
  "Guaranty Trust Bank",
  "Moniepoint MFB",
  "OPay",
  "PalmPay",
  "Polaris Bank",
  "Sterling Bank",
  "United Bank for Africa",
  "Wema Bank",
  "Zenith Bank",
];

const ITEM_STATUSES: ItemStatus[] = ["pending", "bought", "adjusted", "skipped", "rejected"];

/** Developer-only kitchen sink (05 §7.6): every primitive and sheet variant, in both themes. */
export default function UiKit() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Kit />;
}

function Kit() {
  const { colors, name } = useTheme();
  const toast = useToast();
  const theme = useSheet();
  const action = useSheet();
  const form = useSheet();
  const list = useSheet();
  const critical = useSheet();
  const steps = useSheet();

  const [budget, setBudget] = useState<Kobo | null>(3_000_00);
  const [otp, setOtp] = useState("");
  const [prefs, setPrefs] = useState<string[]>(["Firm"]);
  const [note, setNote] = useState("");
  const [bank, setBank] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const toggle = (p: string) => setPrefs((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <View className="flex-1 bg-bg">
      <Screen
        title="UI kit"
        subtitle={`Theme: ${name}. Check every state in light and dark before a screen ships.`}
        headerRight={
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="h-11 w-11 items-center justify-center"
          >
            <CaretLeft size={22} color={colors.ink} weight="bold" />
          </Pressable>
        }
      >
        <Section title="Brand">
          <Wordmark />
        </Section>

        <Section title="Type">
          <Text variant="display" tabular>
            {formatNaira(12_450_00)}
          </Text>
          <Text variant="title">Title — Screen titles</Text>
          <Text variant="heading">Heading — Sheet titles</Text>
          <Text variant="body">Body — Default reading text for descriptions and notes.</Text>
          <Text variant="bodyStrong">Body strong — Item names</Text>
          <Text variant="small" tone="muted">
            Small muted — Secondary details and preferences
          </Text>
          <Text variant="caption" tone="faint">
            Caption — Timestamps, 2:45pm
          </Text>
        </Section>

        <Section title="Colour">
          <View className="flex-row flex-wrap gap-2">
            {(
              [
                ["bg", colors.bg],
                ["surface", colors.surface],
                ["sunken", colors.surfaceSunken],
                ["brand", colors.brand],
                ["brand tint", colors.brandTint],
                ["accent", colors.accent],
                ["warning", colors.warning],
                ["error", colors.error],
                ["info", colors.info],
              ] as const
            ).map(([label, hex]) => (
              <View key={label} className="w-[30%] gap-1">
                <View className="h-12 rounded-input border border-line" style={{ backgroundColor: hex }} />
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Buttons">
          <Button label="Primary action" onPress={() => toast.show({ message: "Primary pressed" })} />
          <Button label="Secondary" variant="secondary" />
          <Button label="Approve extra ₦500" variant="accent" />
          <Button label="Ghost action" variant="ghost" />
          <Button label="Loading" loading />
          <Button label="Disabled" disabled />
          <Button label="Shopper size" size="lg" icon={Storefront} />
          <HoldToConfirm label="Hold to send ₦3,000" onConfirm={() => toast.show({ message: "Sent ₦3,000 to MUSA ADEWALE", tone: "success" })} />
        </Section>

        <Section title="Inputs">
          <MoneyInput label="Budget for tomatoes" value={budget} onChange={setBudget} hint="We'll get the best value for this amount." />
          <Input label="Note for your shopper" placeholder="e.g. for stew, not too ripe" value={note} onChangeText={setNote} />
          <Input label="Account number" value="012345" error="Enter all 10 digits of the account number." onChangeText={() => {}} />
          <OtpInput value={otp} onChange={setOtp} />
        </Section>

        <Section title="Chips">
          <View className="flex-row flex-wrap gap-2">
            {["Firm", "Ripe", "For stew", "Cleaned", "With bone"].map((p) => (
              <Chip key={p} label={p} selected={prefs.includes(p)} onPress={() => toggle(p)} />
            ))}
            <Chip label="Unavailable" disabled />
          </View>
        </Section>

        <Section title="Status">
          <View className="flex-row flex-wrap gap-2">
            {ITEM_STATUSES.map((s) => (
              <ItemStatusPill key={s} status={s} />
            ))}
            <StatusPill label="Price check" tone="accent" />
          </View>
        </Section>

        <Section title="List">
          <Card className="py-0">
            <ListItem icon={Basket} title="Tomatoes" subtitle="₦3,000 · Firm, for stew" trailing={<ItemStatusPill status="bought" />} />
            <Divider />
            <ListItem icon={Basket} title="Ugu" subtitle="₦1,000" trailing={<ItemStatusPill status="pending" />} />
            <Divider />
            <ListItem icon={Bank} title="Pick a bank" subtitle={bank ?? "None selected"} onPress={list.present} />
          </Card>
        </Section>

        <Section title="Loading & empty">
          <Button label={showSkeleton ? "Hide skeleton" : "Show skeleton (150 ms delay)"} variant="secondary" onPress={() => setShowSkeleton((v) => !v)} />
          {showSkeleton ? (
            <DelayedSkeleton>
              <Card className="gap-3">
                <Skeleton width="60%" height={18} />
                <Skeleton width="90%" />
                <Skeleton width="40%" />
              </Card>
            </DelayedSkeleton>
          ) : null}
          <Card>
            <EmptyState icon={Basket} title="No orders yet" body="Your market runs will show here." />
          </Card>
        </Section>

        <Section title="Feedback">
          <Button label="Toast" variant="secondary" onPress={() => toast.show({ message: "Address saved." })} />
          <Button label="Toast with undo" variant="secondary" onPress={() => toast.show({ message: "Ugu rejected. ₦950 will be credited.", action: { label: "Undo", onPress: () => toast.show({ message: "Rejection undone." }) } })} />
          <Button label="Error toast" variant="secondary" onPress={() => toast.show({ message: "Payment didn't go through. You haven't been charged.", tone: "error" })} />
        </Section>

        <Section title="Sheets">
          <Button label="Action sheet" variant="secondary" onPress={action.present} />
          <Button label="Form sheet (dirty guard)" variant="secondary" onPress={form.present} />
          <Button label="List sheet (50% / 92%)" variant="secondary" onPress={list.present} />
          <Button label="Critical sheet (hold to confirm)" variant="secondary" onPress={critical.present} />
          <Button label="Multi-step sheet" variant="secondary" onPress={() => { setStep(0); steps.present(); }} />
          <Button label="Theme sheet" variant="secondary" onPress={theme.present} />
        </Section>
      </Screen>

      <ThemeSheet sheet={theme} />

      <Sheet sheet={action} title="Oja Oba Market" subtitle="4.2 km from your address · Opens 7am–7pm" footer={<Button label="Shop here" onPress={action.dismiss} />}>
        <View className="flex-row justify-between">
          <Text variant="body" tone="muted">Delivery fee</Text>
          <Text variant="bodyStrong" tabular>{formatNaira(800_00)}</Text>
        </View>
      </Sheet>

      <Sheet
        sheet={form}
        variant="form"
        title="Add an item"
        dirty={note.length > 0}
        footer={<Button label="Add to list" onPress={() => { setNote(""); form.dismiss(); }} />}
      >
        <View className="gap-4">
          <MoneyInput inSheet label="Budget" value={budget} onChange={setBudget} />
          <Input inSheet label="Note for your shopper" placeholder="Type to make the form dirty" value={note} onChangeText={setNote} />
        </View>
      </Sheet>

      <Sheet sheet={list} variant="list" title="Choose your bank">
        <BottomSheetFlatList
          data={BANKS}
          keyExtractor={(b: string) => b}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }: { item: string }) => (
            <ListItem title={item} icon={Bank} onPress={() => { setBank(item); list.dismiss(); }} trailing={bank === item ? <Text variant="smallStrong" tone="brand">Selected</Text> : <View />} />
          )}
        />
      </Sheet>

      <Sheet
        sheet={critical}
        variant="critical"
        title="Send ₦3,000?"
        subtitle="To MUSA ADEWALE · Moniepoint MFB · 0123456789"
        footer={
          <>
            <HoldToConfirm label="Hold to send ₦3,000" onConfirm={() => { critical.dismiss(); toast.show({ message: "Payment sent.", tone: "success" }); }} />
            <Button label="Cancel" variant="ghost" onPress={critical.dismiss} />
          </>
        }
      >
        <Text variant="body" tone="muted">Check the name matches the trader in front of you. Transfers can't be reversed.</Text>
      </Sheet>

      <Sheet
        sheet={steps}
        title={["Pay trader", "Confirm account", "Amount"][step]!}
        subtitle={`Step ${step + 1} of 3`}
        stepKey={step}
        onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
        footer={
          step < 2 ? (
            <Button label="Continue" onPress={() => setStep((s) => s + 1)} />
          ) : (
            <HoldToConfirm label={`Hold to send ${formatNaira(budget ?? 0)}`} onConfirm={() => { steps.dismiss(); toast.show({ message: "Payment sent.", tone: "success" }); }} />
          )
        }
      >
        {step === 0 ? (
          <Text variant="body" tone="muted">Enter the trader's account number and bank.</Text>
        ) : step === 1 ? (
          <Card className="gap-1">
            <Text variant="small" tone="muted">Account name</Text>
            <Text variant="title">MUSA ADEWALE</Text>
            <Text variant="small" tone="muted" tabular>Moniepoint MFB · 0123456789</Text>
          </Card>
        ) : (
          <MoneyInput inSheet label="Amount" value={budget} onChange={setBudget} quickAmounts={[]} />
        )}
      </Sheet>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-8 gap-3">
      <Text variant="caption" tone="muted" className="uppercase tracking-wider">
        {title}
      </Text>
      {children}
    </View>
  );
}
