import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import { Button, HoldToConfirm, Sheet, Text, useToast, type SheetController } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Account deletion (Google Play). Blocked while an order is active or the wallet has money;
 * otherwise personal details are wiped and the customer is signed out.
 */
export function DeleteAccountSheet({ sheet, onWithdraw }: { sheet: SheetController; onWithdraw: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { signOut } = useAuth();
  const check = useQuery(api.users.deletionCheck);
  const remove = useMutation(api.users.deleteAccount);
  const [busy, setBusy] = useState(false);
  const blockers = check?.blockers ?? [];

  const onDelete = async () => {
    setBusy(true);
    try {
      await remove({});
      haptic.heavy();
      sheet.dismiss();
      await signOut();
      router.replace("/");
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
      setBusy(false);
    }
  };

  return (
    <Sheet
      sheet={sheet}
      variant="critical"
      title="Delete your account?"
      subtitle="Your name, phone, email and addresses are removed. We keep payment records the law requires. This can't be undone."
    >
      {check === undefined ? (
        <View className="items-center py-6">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <View className="gap-4">
          {blockers.length ? (
            <View className="gap-2.5 rounded-[18px] border-[1.5px] border-error bg-error-tint p-3.5">
              <Text variant="smallStrong" className="font-extrabold">
                Before you can delete
              </Text>
              {blockers.map((b, i) => (
                <View key={b} className="flex-row gap-2.5">
                  <View className="items-center justify-center rounded-full bg-surface" style={{ width: 22, height: 22 }}>
                    <Text variant="caption" tone="error" className="font-extrabold">
                      {i + 1}
                    </Text>
                  </View>
                  <Text variant="small" className="flex-1">
                    {b}
                  </Text>
                </View>
              ))}
              {blockers.some((b) => /wallet/.test(b)) ? (
                <Button
                  label="Withdraw my money"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    sheet.dismiss();
                    onWithdraw();
                  }}
                />
              ) : null}
            </View>
          ) : null}
          <View className="gap-1">
            <HoldToConfirm size="lg" tone="danger" label="Hold to delete account" disabled={blockers.length > 0} loading={busy} onConfirm={() => void onDelete()} />
            <Button label="Keep my account" variant="ghost" onPress={() => sheet.dismiss()} />
          </View>
        </View>
      )}
    </Sheet>
  );
}
