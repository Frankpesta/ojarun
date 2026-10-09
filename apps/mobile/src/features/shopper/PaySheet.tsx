import { useEffect, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useMutation, useQuery } from "convex/react";
import { useNetInfo } from "@react-native-community/netinfo";
import { Bank, Camera, CaretRight, Info, Money } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira, maskAccount } from "@ojarun/shared";
import { Button, HoldToConfirm, Input, MoneyInput, Pressable, Sheet, Text, useToast, type SheetController } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { CameraCapture } from "./CameraCapture";
import { deleteQueuedPhoto, prepareItemPhoto } from "./photos";
import { AccountForm, EMPTY_DRAFT, type AccountDraft } from "@/features/bank/AccountForm";
import { useUploadQueue, type TransferRecipient } from "./useUploadQueue";

type Step = "start" | "account" | "bank" | "amount" | "cash";
type Payee = { recipient: TransferRecipient; name: string; detail: string };

export type PayItem = { _id: Id<"orderItems">; name: string; budget: number; approvedExtra: number; photoUri: string | null };

/**
 * Paying a trader for one item (05 §6.2, §6.5): bank transfer or cash, from the approved
 * mockups. Nothing is sent from here: the payment joins the offline queue, so a dropped signal
 * at the market never loses it or sends it twice.
 */
export function PaySheet({
  sheet,
  batchId,
  marketId,
  item,
  paid,
  left,
  beforePay,
}: {
  sheet: SheetController;
  batchId: Id<"batches">;
  marketId: Id<"markets"> | null;
  item: PayItem;
  /** Paid or on its way (server and queued), for the budget bar. */
  paid: number;
  /** What can still be paid on this item. */
  left: number;
  /** Queues the item photo if it was just taken, so it lands before the payment that needs it. */
  beforePay: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const { isConnected } = useNetInfo();
  const enqueue = useUploadQueue((s) => s.enqueue);
  const recent = useQuery(api.traders.recentForMarket, marketId ? { marketId } : "skip");
  const advance = useQuery(api.cash.myAdvance, { batchId });

  const [step, setStep] = useState<Step>("start");
  const [payee, setPayee] = useState<Payee | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [draft, setDraft] = useState<AccountDraft>(EMPTY_DRAFT);

  const cap = item.budget + item.approvedExtra;
  const reset = () => {
    setStep("start");
    setPayee(null);
    setAmount(null);
    setDraft(EMPTY_DRAFT);
  };

  const finish = (message: string) => {
    haptic.success();
    sheet.dismiss();
    toast.show({ message: isConnected === false ? `${message} It'll send when you're back online.` : message });
  };

  const sendTransfer = () => {
    if (!payee || !amount) return;
    beforePay();
    enqueue(batchId, {
      type: "transfer",
      itemId: item._id,
      itemName: item.name,
      recipient: payee.recipient,
      traderName: payee.name,
      amount,
    });
    finish(`Sending ${formatNaira(amount)} to ${payee.name}.`);
  };

  const titles: Record<Step, { title: string; subtitle?: string }> = {
    start: { title: `Pay for ${item.name}`, subtitle: item.photoUri ? "Photo taken. Pay the trader now." : undefined },
    account: { title: "Trader's account" },
    bank: { title: "Choose the bank" },
    amount: { title: "How much?" },
    cash: { title: "Pay in cash" },
  };
  const back: Partial<Record<Step, Step>> = { account: "start", bank: "account", amount: payee && "traderId" in payee.recipient ? "start" : "account", cash: "start" };

  return (
    <Sheet
      sheet={sheet}
      title={titles[step].title}
      subtitle={titles[step].subtitle}
      variant={step === "amount" || step === "cash" ? "critical" : step === "account" ? "form" : "action"}
      // The bank list is part of the account step, so switching between them keeps the form.
      stepKey={step === "bank" ? "account" : step}
      onBack={back[step] ? () => setStep(back[step]!) : undefined}
      onDismiss={reset}
    >
      {!item.photoUri ? (
        <View className="flex-row items-center gap-2.5 rounded-card bg-warning-tint p-3.5">
          <Camera size={20} color={colors.warningInk} weight="bold" />
          <Text variant="small" tone="warningInk" className="flex-1">
            Take a photo of the {item.name.toLowerCase()} first. Every payment needs one.
          </Text>
        </View>
      ) : step === "start" ? (
        <StartStep
          cap={cap}
          paid={paid}
          left={left}
          advance={advance}
          recent={recent}
          onBank={() => setStep("account")}
          onCash={() => setStep("cash")}
          onRecent={(t) => {
            haptic.select();
            setPayee({ recipient: { traderId: t._id }, name: t.resolvedName, detail: `${t.bankName} ${t.account}` });
            setStep("amount");
          }}
        />
      ) : step === "account" || step === "bank" ? (
        <AccountForm
          confirmLabel="Yes, that's the trader"
          hint="Ask the trader to say their name. Only pay if it matches."
          draft={draft}
          setDraft={setDraft}
          choosingBank={step === "bank"}
          onChooseBank={() => setStep("bank")}
          onBankChosen={() => setStep("account")}
          onConfirmed={(r) => {
            setPayee({
              recipient: { bankCode: r.bankCode, accountNumber: r.accountNumber },
              name: r.accountName,
              detail: `${r.bankName} ${maskAccount(r.accountNumber)}`,
            });
            setStep("amount");
          }}
        />
      ) : step === "amount" && payee ? (
        <View className="gap-[18px]">
          <PayeeCard name={payee.name} detail={`${payee.detail} · for ${item.name}`} />
          <MoneyInput
            label="Amount"
            inSheet
            value={amount}
            onChange={setAmount}
            hint={amount && amount <= left ? `${formatNaira(left - amount)} will be left on this item` : `You can pay up to ${formatNaira(left)}`}
            error={amount && amount > left ? `That's more than this item's budget. You can pay up to ${formatNaira(left)}.` : null}
            quickAmounts={quickAmounts(left)}
          />
          <View className="gap-2.5">
            <HoldToConfirm
              size="lg"
              label={amount ? `Hold to send ${formatNaira(amount)}` : "Enter the amount"}
              accessibleLabel={amount ? `Send ${formatNaira(amount)} to ${payee.name}` : undefined}
              disabled={!amount || amount > left}
              onConfirm={sendTransfer}
            />
            <Text variant="small" tone="muted" className="text-center">
              Keep holding. It sends even if your signal drops, once it's back.
            </Text>
          </View>
        </View>
      ) : step === "cash" ? (
        <CashStep
          item={item}
          left={left}
          advance={advance}
          onRecorded={(job) => {
            beforePay();
            enqueue(batchId, { type: "cashSpend", itemId: item._id, itemName: item.name, ...job.payload }, job.id);
            finish(`Recorded ${formatNaira(job.payload.amount)} cash for ${item.name}.`);
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** Up to three handy amounts below what's left, plus "all of it". */
function quickAmounts(left: number): number[] {
  if (left <= 0) return [];
  const steps = [500_00, 1_000_00, 1_500_00, 2_000_00, 3_000_00, 5_000_00, 10_000_00].filter((a) => a < left);
  return [...steps.slice(-2), left];
}

type Advance = FunctionReturnType<typeof api.cash.myAdvance> | undefined;
type Recent = FunctionReturnType<typeof api.traders.recentForMarket> | undefined;

function StartStep({
  cap,
  paid,
  left,
  advance,
  recent,
  onBank,
  onCash,
  onRecent,
}: {
  cap: number;
  paid: number;
  left: number;
  advance: Advance;
  recent: Recent;
  onBank: () => void;
  onCash: () => void;
  onRecent: (t: NonNullable<Recent>[number]) => void;
}) {
  const { colors } = useTheme();
  const pct = cap > 0 ? Math.min(1, paid / cap) : 0;
  const cashLeft = advance ? advance.left : 0;
  const noBudget = left <= 0;

  return (
    <View className="gap-[18px]">
      <View className="gap-2" accessible accessibilityLabel={`${formatNaira(paid)} paid, ${formatNaira(left)} left to spend`}>
        <View className="h-2.5 flex-row overflow-hidden rounded-full bg-surface-sunken">
          <View className="bg-brand" style={{ width: `${pct * 100}%` }} />
        </View>
        <View className="flex-row justify-between">
          <Text variant="small" tone="muted" tabular>
            {formatNaira(paid)} paid
          </Text>
          <Text variant="smallStrong" tabular>
            {formatNaira(left)} left to spend
          </Text>
        </View>
      </View>

      {noBudget ? (
        <View className="flex-row items-center gap-2.5 rounded-card bg-warning-tint p-3.5">
          <Info size={20} color={colors.warningInk} weight="bold" />
          <Text variant="small" tone="warningInk" className="flex-1">
            This item's budget is used up. Send the customer a price check if the trader wants more.
          </Text>
        </View>
      ) : (
        <View className="flex-row gap-2.5">
          <Pressable
            onPress={onBank}
            accessibilityRole="button"
            accessibilityLabel="Pay by bank transfer"
            className="flex-1 justify-between gap-3.5 rounded-[18px] bg-forest p-4"
            style={{ minHeight: 120 }}
          >
            <Bank size={28} color={colors.onForest} weight="bold" />
            <View className="gap-0.5">
              <Text variant="bodyStrong" tone="onForest" className="font-extrabold">
                Bank transfer
              </Text>
              <Text variant="small" tone="forestMuted">
                Most traders
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onCash}
            disabled={!advance}
            accessibilityRole="button"
            accessibilityLabel={advance ? `Pay in cash, ${formatNaira(cashLeft)} cash left` : "No cash for this run"}
            className={`flex-1 justify-between gap-3.5 rounded-[18px] border-[1.5px] border-line-strong bg-surface p-4 ${advance ? "" : "opacity-50"}`}
            style={{ minHeight: 120 }}
          >
            <Money size={28} color={colors.ink} weight="bold" />
            <View className="gap-0.5">
              <Text variant="bodyStrong" className="font-extrabold">
                Cash
              </Text>
              <Text variant="small" tone="muted" tabular>
                {advance ? `${formatNaira(cashLeft)} of ${formatNaira(advance.amount)} left` : "None for this run"}
              </Text>
            </View>
          </Pressable>
        </View>
      )}

      {!noBudget && recent?.length ? (
        <View className="gap-2">
          <Text variant="smallStrong" tone="muted">
            Paid before at this market
          </Text>
          <View className="overflow-hidden rounded-[18px] border border-line">
            {recent.slice(0, 4).map((t, i) => (
              <Pressable
                key={t._id}
                scale={false}
                onPress={() => onRecent(t)}
                accessibilityRole="button"
                accessibilityLabel={`Pay ${t.resolvedName}, ${t.bankName} ${t.account}`}
                className={`flex-row items-center gap-3 px-3.5 ${i < Math.min(recent.length, 4) - 1 ? "border-b border-line" : ""}`}
                style={{ minHeight: 64 }}
              >
                <Initials name={t.resolvedName} index={i} />
                <View className="flex-1">
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {t.resolvedName}
                  </Text>
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    {t.bankName} {t.account} · paid {t.transferCount === 1 ? "once" : t.transferCount === 2 ? "twice" : `${t.transferCount} times`}
                  </Text>
                </View>
                <CaretRight size={18} color={colors.inkFaint} weight="bold" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const INITIAL_TINTS = ["bg-brand-tint", "bg-warning-tint", "bg-accent-tint"] as const;
const INITIAL_TONES = ["brand", "warningInk", "accent"] as const;

function Initials({ name, index, size = 40 }: { name: string; index: number; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <View className={`items-center justify-center rounded-full ${INITIAL_TINTS[index % 3]}`} style={{ width: size, height: size }}>
      <Text variant="smallStrong" tone={INITIAL_TONES[index % 3]} className="font-extrabold">
        {initials}
      </Text>
    </View>
  );
}

function PayeeCard({ name, detail }: { name: string; detail: string }) {
  return (
    <View className="flex-row items-center gap-3 rounded-[18px] bg-surface-sunken p-3.5">
      <Initials name={name} index={0} size={44} />
      <View className="flex-1">
        <Text variant="bodyStrong" className="font-extrabold" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

function CashStep({
  item,
  left,
  advance,
  onRecorded,
}: {
  item: PayItem;
  left: number;
  advance: Advance;
  onRecorded: (job: { id: string; payload: { amount: number; traderLabel?: string; fileUri: string } }) => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const confirmReceipt = useMutation(api.cash.confirmReceipt);
  const [confirming, setConfirming] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<{ id: string; uri: string } | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  // Leaving without recording: drop the trader photo so it never uploads.
  const unsent = useRef<string | null>(null);
  unsent.current = photo?.uri ?? null;
  useEffect(
    () => () => {
      if (unsent.current) deleteQueuedPhoto(unsent.current);
    },
    [],
  );

  if (advance === undefined) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (advance === null) {
    return (
      <Text variant="body" tone="muted">
        Ops hasn't given you cash for this run. Call ops if this trader only takes cash.
      </Text>
    );
  }
  if (!advance.receivedAt) {
    return (
      <View className="gap-[18px]">
        <View className="gap-1.5 rounded-[18px] bg-warning-tint p-4">
          <Text variant="bodyStrong" tone="warningInk">
            Ops gave you {formatNaira(advance.amount)} cash
          </Text>
          <Text variant="small" tone="warningInk">
            Count it, then confirm you have it. You can pay traders in cash after that.
          </Text>
        </View>
        <Button
          label={`I've received ${formatNaira(advance.amount)} cash`}
          size="lg"
          loading={confirming}
          onPress={async () => {
            setConfirming(true);
            try {
              await confirmReceipt({ advanceId: advance._id });
              haptic.success();
            } catch (e) {
              toast.show({ message: friendlyError(e), tone: "error" });
            } finally {
              setConfirming(false);
            }
          }}
        />
      </View>
    );
  }

  const max = Math.min(left, advance.left);
  const overItem = amount !== null && amount > left;
  const overCash = amount !== null && amount > advance.left;
  const blocker = !photo ? "Take the trader photo first." : !amount ? "Enter the amount you paid." : null;

  return (
    <View className="gap-4">
      <View className="self-start rounded-full bg-brand-tint px-3 py-1.5">
        <Text variant="caption" tone="brand" tabular className="font-bold">
          {formatNaira(advance.left)} cash left
        </Text>
      </View>
      <View className="gap-2">
        <Text variant="smallStrong" tone="muted">
          Photo of the trader and their stall
        </Text>
        <View className="flex-row gap-2.5">
          <View className="flex-1 overflow-hidden rounded-card bg-surface-sunken" style={{ height: 120 }}>
            {item.photoUri ? <Image source={{ uri: item.photoUri }} style={{ flex: 1 }} contentFit="cover" accessibilityLabel={`Photo of ${item.name}`} /> : null}
          </View>
          {photo ? (
            <Pressable onPress={() => setCameraOpen(true)} accessibilityRole="button" accessibilityLabel="Retake trader photo" className="flex-1 overflow-hidden rounded-card" style={{ height: 120 }}>
              <Image source={{ uri: photo.uri }} style={{ flex: 1 }} contentFit="cover" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => setCameraOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Take trader photo"
              className="flex-1 items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-surface"
              style={{ height: 120 }}
            >
              <Camera size={26} color={colors.ink} weight="bold" />
              <Text variant="smallStrong">Take trader photo</Text>
            </Pressable>
          )}
        </View>
      </View>
      <MoneyInput
        label="Amount paid"
        inSheet
        value={amount}
        onChange={setAmount}
        quickAmounts={[]}
        hint={`Up to ${formatNaira(max)}`}
        error={overCash ? `You only have ${formatNaira(advance.left)} of cash left.` : overItem ? `That's more than this item's budget. You can pay up to ${formatNaira(left)}.` : null}
      />
      <Input label="Who did you pay? (optional)" inSheet value={label} onChangeText={setLabel} placeholder="e.g. Mama Bisi, pepper row" maxLength={80} />
      <View className="gap-2">
        <HoldToConfirm
          size="lg"
          label={amount ? `Hold to record ${formatNaira(amount)} cash` : "Hold to record cash"}
          disabled={!!blocker || overItem || overCash}
          onConfirm={() => {
            if (!photo || !amount) return;
            unsent.current = null;
            onRecorded({ id: photo.id, payload: { amount, traderLabel: label.trim() || undefined, fileUri: photo.uri } });
          }}
        />
        {blocker ? (
          <Text variant="small" tone="muted" className="text-center">
            {blocker}
          </Text>
        ) : null}
      </View>
      <CameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCaptured={async (raw) => {
          setCameraOpen(false);
          try {
            if (photo) deleteQueuedPhoto(photo.uri);
            const id = randomUUID();
            setPhoto({ id, uri: await prepareItemPhoto(raw, id) });
            haptic.success();
          } catch {
            toast.show({ message: "Couldn't save that photo. Try again.", tone: "error" });
          }
        }}
      />
    </View>
  );
}
