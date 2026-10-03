import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CaretLeft, MagnifyingGlass, MapPin, WarningCircle } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { isInsidePolygon, type LngLat } from "@ojarun/shared";
import { sizes } from "@ojarun/ui";
import { Button, Chip, Input, Pressable, Text, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { AddressSearchSheet } from "@/features/addresses/AddressSearchSheet";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const AKURE: Region = { latitude: 7.2526, longitude: 5.1931, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const STREET_ZOOM = { latitudeDelta: 0.004, longitudeDelta: 0.004 };
const LABELS = ["Home", "Work", "Other"] as const;

export default function AddressScreen() {
  return (
    <RoleGuard role="customer">
      <AddressEditor />
    </RoleGuard>
  );
}

function AddressEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const addresses = useQuery(api.addresses.list);
  const settings = useQuery(api.settings.publicSettings);
  const existing = useMemo(() => addresses?.find((a) => a._id === id), [addresses, id]);

  if (id && addresses === undefined) return <SafeAreaView className="flex-1 bg-bg" />;
  return <Editor key={existing?._id ?? "new"} existing={existing ?? null} geofence={settings?.geofence ?? null} />;
}

type Existing = FunctionReturnType<typeof api.addresses.list>[number];

function Editor({ existing, geofence }: { existing: Existing | null; geofence: LngLat[] | null }) {
  const { colors } = useTheme();
  const toast = useToast();
  const searchSheet = useSheet();
  const map = useRef<MapView>(null);
  const create = useMutation(api.addresses.create);
  const update = useMutation(api.addresses.update);

  const [formatted, setFormatted] = useState(existing?.formatted ?? "");
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [pin, setPin] = useState(existing ? { lat: existing.lat, lng: existing.lng } : null);
  const [landmark, setLandmark] = useState(existing?.landmark ?? "");
  const presetLabel = LABELS.find((l) => l === existing?.label);
  const [label, setLabel] = useState<string>(existing ? (presetLabel ?? "Other") : "Home");
  const [customLabel, setCustomLabel] = useState(existing && !presetLabel ? existing.label : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New addresses start with the search open: it's the fastest way to the right street.
  useEffect(() => {
    if (!existing) {
      const t = setTimeout(searchSheet.present, 350);
      return () => clearTimeout(t);
    }
  }, [existing, searchSheet]);

  const outside = pin && geofence ? !isInsidePolygon(pin, geofence) : false;
  const finalLabel = label === "Other" ? customLabel.trim() || "Other" : label;
  const canSave = !!formatted && !!pin && landmark.trim().length >= 3 && !outside;

  const onRegionChangeComplete = (r: Region) => {
    if (!formatted) return; // The pin only means something once a place is chosen.
    setPin({ lat: r.latitude, lng: r.longitude });
    setError(null);
  };

  const save = async () => {
    if (!pin) return;
    setSaving(true);
    setError(null);
    try {
      const args = { label: finalLabel, formatted, landmark, lat: pin.lat, lng: pin.lng, placeId };
      if (existing) await update({ id: existing._id as Id<"addresses">, ...args });
      else await create(args);
      haptic.success();
      toast.show({ message: existing ? "Address updated" : "Address saved", tone: "success" });
      router.back();
    } catch (e) {
      haptic.error();
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-row items-center gap-1 px-2 pt-2 pb-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="items-center justify-center"
            style={{ width: sizes.minTarget, height: sizes.minTarget }}
          >
            <CaretLeft size={22} color={colors.ink} weight="bold" />
          </Pressable>
          <Text variant="heading" accessibilityRole="header">
            {existing ? "Edit address" : "Add an address"}
          </Text>
        </View>

        <View className="px-gutter pb-3">
          <Pressable
            onPress={searchSheet.present}
            accessibilityRole="search"
            accessibilityLabel={formatted ? `Address: ${formatted}. Tap to search again` : "Search for your address"}
            className="flex-row items-center gap-3 rounded-input border border-line-strong bg-surface px-4"
            style={{ minHeight: 52 }}
          >
            <MagnifyingGlass size={20} color={colors.inkFaint} />
            <Text variant="body" tone={formatted ? "ink" : "faint"} numberOfLines={1} className="flex-1">
              {formatted || "Search for your street or landmark"}
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 overflow-hidden">
          <MapView
            ref={map}
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            initialRegion={pin ? { latitude: pin.lat, longitude: pin.lng, ...STREET_ZOOM } : AKURE}
            onRegionChangeComplete={onRegionChangeComplete}
            toolbarEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            accessibilityLabel="Map. Move it to put the pin on your gate."
          />
          {/* Fixed centre pin: the map moves under it. The tip sits on the centre point. */}
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View style={{ marginBottom: 40 }} className="items-center">
              <MapPin size={40} weight="fill" color={outside ? colors.error : colors.brand} />
            </View>
          </View>
          {formatted ? (
            <View pointerEvents="none" className="absolute left-0 right-0 top-3 items-center">
              <View className={`rounded-full px-3.5 py-1.5 ${outside ? "bg-error-tint" : "bg-surface-raised"}`}>
                <Text variant="caption" tone={outside ? "error" : "ink"}>
                  {outside ? "Outside our delivery area" : "Move the map to put the pin on your gate"}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View className="gap-4 px-gutter pt-4">
          <Input
            label="Landmark or directions"
            placeholder="e.g. Blue gate opposite Mount Zion church"
            value={landmark}
            onChangeText={setLandmark}
            maxLength={200}
            hint="This helps your shopper find you quickly."
          />
          <View className="gap-2">
            <Text variant="smallStrong" tone="muted">
              Save as
            </Text>
            <View className="flex-row gap-2">
              {LABELS.map((l) => (
                <Chip key={l} label={l} selected={label === l} onPress={() => setLabel(l)} />
              ))}
            </View>
            {label === "Other" ? (
              <Input label="Name" placeholder="e.g. Mum's house" value={customLabel} onChangeText={setCustomLabel} maxLength={30} />
            ) : null}
          </View>
          {error ? (
            <View className="flex-row items-start gap-2 rounded-card bg-error-tint px-4 py-3" accessibilityLiveRegion="polite">
              <WarningCircle size={20} color={colors.error} />
              <Text variant="small" className="flex-1">
                {error}
              </Text>
            </View>
          ) : null}
          <View className="pb-3">
            <Button
              label={existing ? "Save changes" : "Save address"}
              onPress={() => void save()}
              loading={saving}
              disabled={!canSave}
              accessibilityHint={
                !formatted ? "Search for your address first" : outside ? "Move the pin inside Akure" : landmark.trim().length < 3 ? "Add a landmark first" : undefined
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <AddressSearchSheet
        sheet={searchSheet}
        onPicked={(place) => {
          setFormatted(place.formatted);
          setPlaceId(place.placeId);
          setPin({ lat: place.lat, lng: place.lng });
          setError(null);
          map.current?.animateToRegion({ latitude: place.lat, longitude: place.lng, ...STREET_ZOOM }, 450);
        }}
      />
    </SafeAreaView>
  );
}
