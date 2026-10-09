import { useEffect, useMemo, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useAction, useMutation, useQuery } from "convex/react";
import { useNetInfo } from "@react-native-community/netinfo";
import { Bank, Camera, CaretDown, CaretRight, Check, CheckCircle, Info, MagnifyingGlass, Money } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira, isNuban, maskAccount } from "@ojarun/shared";
import { Button, HoldToConfirm, Input, MoneyInput, Pressable, Sheet, Text, useToast, type SheetController } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { CameraCapture } from "./CameraCapture";
import { deleteQueuedPhoto, prepareItemPhoto } from "./photos";
import { useUploadQueue, type TransferRecipient } from "./useUploadQueue";

type Step = "start" | "account" | "bank" | "amount" | "cash";
type Payee = { recipient: TransferRecipient; name: string; detail: string };
type Resolved = { accountName: string; bankName: string; accountNumber: string; bankCode: string };
/** The account form, kept here so it survives moving between the bank list and the amount. */
type AccountDraft = { bankCode: string | null; digits: string; resolved: Resolved | null };
const EMPTY_DRAFT: AccountDraft = { bankCode: null, digits: "", resolved: null };

/** Banks most Akure traders use, listed first before the shopper searches. */
const POPULAR = ["OPay", "Moniepoint", "PalmPay", "Guaranty Trust", "Access Bank", "First Bank", "United Bank For Africa", "Zenith", "Kuda"];

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
        <AccountStep
          draft={draft}
          setDraft={setDraft}
          choosingBank={step === "bank"}
          onChooseBank={() => setStep("bank")}
          onBankChosen={() => setStep("account")}
          onConfirmed={(p) => {
            setPayee(p);
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

/** Bank + account number → the bank's name for the account, in large type, before paying. */
function AccountStep({
  draft,
  setDraft,
  choosingBank,
  onChooseBank,
  onBankChosen,
  onConfirmed,
}: {
  draft: AccountDraft;
  setDraft: (d: AccountDraft) => void;
  choosingBank: boolean;
  onChooseBank: () => void;
  onBankChosen: () => void;
  onConfirmed: (p: Payee) => void;
}) {
  const { colors } = useTheme();
  const banks = useQuery(api.traders.banks);
  const ensureBanks = useAction(api.traders.ensureBanks);
  const resolve = useAction(api.traders.resolveAccount);
  const { bankCode, digits, resolved } = draft;
  const [search, setSearch] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (banks && banks.banks.length === 0) void ensureBanks().catch(() => setError("Couldn't load the banks. Check your signal."));
  }, [banks, ensureBanks]);

  const bank = banks?.banks.find((b) => b.code === bankCode) ?? null;
  const list = useMemo(() => {
    const all = banks?.banks ?? [];
    const q = search.trim().toLowerCase();
    if (q) return all.filter((b) => b.name.toLowerCase().includes(q));
    const rank = (name: string) => {
      const i = POPULAR.findIndex((p) => name.toLowerCase().includes(p.toLowerCase()));
      return i < 0 ? POPULAR.length : i;
    };
    return [...all].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  }, [banks, search]);

  if (choosingBank) {
    return (
      <View className="gap-3">
        <Input
          label="Search banks"
          inSheet
          value={search}
          onChangeText={setSearch}
          placeholder="e.g. OPay, GTBank"
          autoCorrect={false}
          leading={<MagnifyingGlass size={18} color={colors.inkMuted} weight="bold" />}
        />
        {banks === undefined || banks.banks.length === 0 ? (
          <View className="items-center py-8">
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            <View className="overflow-hidden rounded-[18px] border border-line">
              {list.map((b, i) => (
                <Pressable
                  key={b.code}
                  scale={false}
                  onPress={() => {
                    haptic.select();
                    setDraft({ ...draft, bankCode: b.code, resolved: null });
                    setSearch("");
                    onBankChosen();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: b.code === bankCode }}
                  className={`flex-row items-center justify-between px-4 ${i < list.length - 1 ? "border-b border-line-soft" : ""} ${b.code === bankCode ? "bg-brand-tint" : ""}`}
                  style={{ minHeight: 52 }}
                >
                  <Text variant="body" numberOfLines={1} className="flex-1">
                    {b.name}
                  </Text>
                  {b.code === bankCode ? <Check size={18} color={colors.brand} weight="bold" /> : null}
                </Pressable>
              ))}
              {list.length === 0 ? (
                <Text variant="small" tone="muted" className="p-4">
                  No bank matches “{search}”.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>
    );
  }

  const check = async () => {
    if (!bankCode || !isNuban(digits)) return;
    setChecking(true);
    setError(null);
    try {
      const res = await resolve({ bankCode, accountNumber: digits });
      haptic.success();
      setDraft({ bankCode, digits, resolved: { ...res, bankCode } });
    } catch (e) {
      haptic.warning();
      setError(friendlyError(e, "We couldn't check that account. Check your signal and try again."));
    } finally {
      setChecking(false);
    }
  };

  return (
    <View className="gap-[18px]">
      <View className="gap-2">
        <Text variant="smallStrong">Bank</Text>
        <Pressable
          scale={false}
          onPress={onChooseBank}
          accessibilityRole="button"
          accessibilityLabel={bank ? `Bank: ${bank.name}. Change` : "Choose the bank"}
          className="flex-row items-center justify-between rounded-input bg-surface px-4"
          style={{ minHeight: 56, borderWidth: 1.5, borderColor: colors.lineStrong }}
        >
          <Text variant="body" tone={bank ? "ink" : "faint"} numberOfLines={1} className={bank ? "font-semibold" : ""}>
            {bank?.name ?? "Choose the bank"}
          </Text>
          <CaretDown size={18} color={colors.inkMuted} weight="bold" />
        </Pressable>
      </View>
      <Input
        label="Account number"
        inSheet
        large
        value={digits}
        onChangeText={(t) => {
          setDraft({ ...draft, digits: t.replace(/\D/g, "").slice(0, 10), resolved: null });
          setError(null);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={10}
        placeholder="10 digits"
        error={error}
        hint={digits.length > 0 && digits.length < 10 ? `${10 - digits.length} more ${10 - digits.length === 1 ? "digit" : "digits"}` : undefined}
      />

      {resolved ? (
        <>
          <View className="gap-2.5 rounded-[20px] bg-forest p-5" accessibilityLiveRegion="polite" accessible accessibilityLabel={`The bank says this account belongs to ${resolved.accountName}`}>
            <View className="flex-row items-center gap-2">
              <CheckCircle size={16} color={colors.live} weight="fill" />
              <Text variant="smallStrong" tone="forestMuted">
                The bank says this account belongs to
              </Text>
            </View>
            <Text variant="title" tone="onForest" style={{ fontSize: 30, lineHeight: 34 }}>
              {resolved.accountName}
            </Text>
            <Text variant="small" tone="onForestSoft" tabular>
              {resolved.bankName} · {resolved.accountNumber}
            </Text>
          </View>
          <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
            Ask the trader to say their name. Only pay if it matches.
          </Text>
          <View className="gap-2">
            <Button
              label="Yes, that's the trader"
              size="lg"
              onPress={() =>
                onConfirmed({
                  recipient: { bankCode: resolved.bankCode, accountNumber: resolved.accountNumber },
                  name: resolved.accountName,
                  detail: `${resolved.bankName} ${maskAccount(resolved.accountNumber)}`,
                })
              }
            />
            <Button
              label="Not them, change account"
              variant="ghost"
              onPress={() => setDraft({ ...draft, digits: "", resolved: null })}
            />
          </View>
        </>
      ) : (
        <Button label="Check account" size="lg" loading={checking} disabled={!bankCode || !isNuban(digits)} onPress={() => void check()} />
      )}
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
