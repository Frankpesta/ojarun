import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Briefcase, CaretLeft, House, MapPin, PencilSimple, Plus, Trash } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { sizes } from "@ojarun/ui";
import { Button, Divider, EmptyState, ListItem, Pressable, Screen, Sheet, Skeleton, Text, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Address = FunctionReturnType<typeof api.addresses.list>[number];

const ICON = { Home: House, Work: Briefcase } as const;

export default function AddressesScreen() {
  return (
    <RoleGuard role="customer">
      <AddressBook />
    </RoleGuard>
  );
}

function AddressBook() {
  const { colors } = useTheme();
  const addresses = useQuery(api.addresses.list);
  const actions = useSheet();
  const [selected, setSelected] = useState<Address | null>(null);

  const back = (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="-ml-3 items-center justify-center"
      style={{ width: sizes.minTarget, height: sizes.minTarget }}
    >
      <CaretLeft size={22} color={colors.ink} weight="bold" />
    </Pressable>
  );

  return (
    <View className="flex-1 bg-bg">
      <Screen
        title="Saved addresses"
        subtitle="We deliver anywhere inside Akure."
        headerRight={back}
        footer={addresses?.length ? <Button label="Add an address" icon={Plus} variant="secondary" onPress={() => router.push("/address")} /> : undefined}
      >
        {addresses === undefined ? (
          <View className="gap-3">
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No addresses yet"
            body="Add where we should deliver. A landmark helps your shopper find you."
            action={<Button label="Add an address" icon={Plus} onPress={() => router.push("/address")} />}
          />
        ) : (
          <View>
            {addresses.map((a, i) => (
              <View key={a._id}>
                {i > 0 ? <Divider /> : null}
                <ListItem
                  icon={ICON[a.label as keyof typeof ICON] ?? MapPin}
                  title={a.label}
                  subtitle={`${a.formatted}\n${a.landmark}`}
                  onPress={() => {
                    setSelected(a);
                    actions.present();
                  }}
                />
              </View>
            ))}
          </View>
        )}
      </Screen>
      <AddressActionsSheet sheet={actions} address={selected} />
    </View>
  );
}

function AddressActionsSheet({ sheet, address }: { sheet: ReturnType<typeof useSheet>; address: Address | null }) {
  const archive = useMutation(api.addresses.archive);
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!address) return;
    setBusy(true);
    try {
      await archive({ id: address._id });
      haptic.success();
      sheet.dismiss();
      toast.show({ message: `${address.label} removed`, tone: "neutral" });
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      sheet={sheet}
      title={address?.label ?? ""}
      subtitle={address?.formatted}
      stepKey={confirming ? "confirm" : "menu"}
      onBack={confirming ? () => setConfirming(false) : undefined}
      onDismiss={() => setConfirming(false)}
      footer={
        confirming ? (
          <Button label="Remove address" variant="danger" loading={busy} onPress={() => void remove()} />
        ) : undefined
      }
    >
      {confirming ? (
        <Text variant="body" tone="muted">
          Past orders keep their delivery details. You can add this address again any time.
        </Text>
      ) : (
        <View>
          <ListItem
            icon={PencilSimple}
            title="Edit"
            subtitle="Move the pin or change the landmark"
            onPress={() => {
              sheet.dismiss();
              if (address) router.push({ pathname: "/address", params: { id: address._id } });
            }}
          />
          <Divider />
          <ListItem icon={Trash} title="Remove" destructive onPress={() => setConfirming(true)} />
        </View>
      )}
    </Sheet>
  );
}
