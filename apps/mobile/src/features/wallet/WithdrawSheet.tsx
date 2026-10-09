import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bank } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatNaira } from "@ojarun/shared";
import { HoldToConfirm, MoneyInput, Pressable, Sheet, Text, useToast, type SheetController } from "@/components";
import { AccountForm, EMPTY_DRAFT, type AccountDraft } from "@/features/bank/AccountForm";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/telemetry";
import { useTheme } from "@/theme/ThemeProvider";

type Step = "amount" | "account" | "bank";

/**
 * Withdraw wallet money to the customer's saved bank account (05 §9 M6). The first time, or
 * when changing it, the account is checked with the bank and the name shown before saving.
 */
export function WithdrawSheet({ sheet, startWith = "amount" }: { sheet: SheetController; startWith?: "amount" | "account" }) {
  const { colors } = useTheme();
  const toast = useToast();
  const payout = useQuery(api.withdrawals.payout);
  const save = useAction(api.withdrawals.setPayoutAccount);
  const request = useMutation(api.withdrawals.request);
  const [step, setStep] = useState<Step>(startWith);
  const [draft, setDraft] = useState<AccountDraft>(EMPTY_DRAFT);
  const [amount, setAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => randomUUID());

  useEffect(() => setStep(startWith), [startWith]);
  // No account saved yet: start by adding one.
  useEffect(() => {
    if (payout && !payout.account && step === "amount") setStep("account");
  }, [payout, step]);

  const reset = () => {
    setStep(startWith);
    setDraft(EMPTY_DRAFT);
    setAmount(null);
    setRequestId(randomUUID());
  };

  if (!payout) {
    return (
      <Sheet sheet={sheet} title="Withdraw to your bank" onDismiss={reset}>
        <View className="items-center py-8">
          <ActivityIndicator color={colors.brand} />
        </View>
      </Sheet>
    );
  }

  const tooLow = amount !== null && amount < payout.minimum;
  const tooHigh = amount !== null && amount > payout.balance;
  const quick = [1_000_00, 2_000_00].filter((a) => a < payout.balance);

  const withdraw = async () => {
    if (!amount || tooLow || tooHigh) return;
    setBusy(true);
    try {
      await request({ clientRequestId: requestId, amount });
      track("withdrawal_requested", { amount });
      haptic.success();
      sheet.dismiss();
      toast.show({ message: `${formatNaira(amount)} is on its way to your bank.` });
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Step, string> = {
    amount: "Withdraw to your bank",
    account: payout.account ? "Change bank account" : "Add your bank account",
    bank: "Choose your bank",
  };

  return (
    <Sheet
      sheet={sheet}
      variant={step === "amount" ? "critical" : "form"}
      title={titles[step]}
      subtitle={step === "amount" ? `You have ${formatNaira(payout.balance)} · minimum ${formatNaira(payout.minimum)}` : "Withdrawals only go to an account in your own name."}
      stepKey={step === "bank" ? "account" : step}
      onBack={step === "bank" ? () => setStep("account") : step === "account" && payout.account ? () => setStep("amount") : undefined}
      onDismiss={reset}
    >
      {step === "amount" && payout.account ? (
        <View className="gap-[18px]">
          <MoneyInput
            label="Amount"
            inSheet
            value={amount}
            onChange={setAmount}
            quickAmounts={[...quick, payout.balance]}
            error={tooHigh ? `You have ${formatNaira(payout.balance)}.` : tooLow ? `The minimum is ${formatNaira(payout.minimum)}.` : null}
          />
          <View className="flex-row items-center gap-3 rounded-[18px] bg-surface-sunken p-3.5">
            <View className="items-center justify-center rounded-xl bg-brand-tint" style={{ width: 44, height: 44 }}>
              <Bank size={22} color={colors.brand} weight="bold" />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong" className="font-extrabold" numberOfLines={1}>
                {payout.account.name}
              </Text>
              <Text variant="small" tone="muted">
                {payout.account.bankName} {payout.account.account}
              </Text>
            </View>
            <Pressable onPress={() => setStep("account")} accessibilityRole="button" className="justify-center rounded-full bg-surface px-3" style={{ height: 40 }}>
              <Text variant="smallStrong">Change</Text>
            </Pressable>
          </View>
          <View className="gap-2">
            <HoldToConfirm
              size="lg"
              label={amount ? `Hold to withdraw ${formatNaira(amount)}` : "Enter an amount"}
              disabled={!amount || tooLow || tooHigh}
              loading={busy}
              onConfirm={() => void withdraw()}
            />
            <Text variant="small" tone="muted" className="text-center">
              Usually arrives in minutes. If the bank refuses it, the money comes straight back here.
            </Text>
          </View>
        </View>
      ) : (
        <AccountForm
          confirmLabel={busy ? "Saving…" : "Yes, that's my account"}
          hint="Check this is your name. Withdrawals can't go to someone else's account."
          draft={draft}
          setDraft={setDraft}
          choosingBank={step === "bank"}
          onChooseBank={() => setStep("bank")}
          onBankChosen={() => setStep("account")}
          onConfirmed={async (r) => {
            if (busy) return;
            setBusy(true);
            try {
              await save({ bankCode: r.bankCode, accountNumber: r.accountNumber });
              haptic.success();
              setDraft(EMPTY_DRAFT);
              setStep("amount");
            } catch (e) {
              toast.show({ message: friendlyError(e), tone: "error" });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </Sheet>
  );
}
