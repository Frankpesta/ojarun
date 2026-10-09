import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { CaretDown, Check, CheckCircle, MagnifyingGlass } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { isNuban } from "@ojarun/shared";
import { Button, Input, Pressable, Text } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export type Resolved = { accountName: string; bankName: string; accountNumber: string; bankCode: string };
/** The form's state, kept by the parent sheet so it survives moving between steps. */
export type AccountDraft = { bankCode: string | null; digits: string; resolved: Resolved | null };
export const EMPTY_DRAFT: AccountDraft = { bankCode: null, digits: "", resolved: null };

/** Banks most people in Akure use, listed first before searching. */
const POPULAR = ["OPay", "Moniepoint", "PalmPay", "Guaranty Trust", "Access Bank", "First Bank", "United Bank For Africa", "Zenith", "Kuda"];

/**
 * Bank + account number → the bank's name for the account in large type, then an explicit
 * "that's them" (05 §6.2 step 2). Used to pay traders and to save a customer's payout account.
 */
export function AccountForm({
  confirmLabel,
  hint,
  draft,
  setDraft,
  choosingBank,
  onChooseBank,
  onBankChosen,
  onConfirmed,
}: {
  confirmLabel: string;
  hint: string;
  draft: AccountDraft;
  setDraft: (d: AccountDraft) => void;
  choosingBank: boolean;
  onChooseBank: () => void;
  onBankChosen: () => void;
  onConfirmed: (r: Resolved) => void;
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
            {hint}
          </Text>
          <View className="gap-2">
            <Button
              label={confirmLabel}
              size="lg"
              onPress={() => onConfirmed(resolved)}
            />
            <Button
              label="Not right, change account"
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
