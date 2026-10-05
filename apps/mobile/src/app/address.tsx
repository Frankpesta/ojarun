import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MagnifyingGlass, MapPin, WarningCircle } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { isInsidePolygon, type LngLat } from "@ojarun/shared";
import { BackButton, Button, Chip, Input, Pressable, Text, useSheet, useToast } from "@/components";
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
  const { id, onboarding } = useLocalSearchParams<{ id?: string; onboarding?: string }>();
  const addresses = useQuery(api.addresses.list);
  const settings = useQuery(api.settings.publicSettings);
  const existing = useMemo(() => addresses?.find((a) => a._id === id), [addresses, id]);

  if (id && addresses === undefined) return <SafeAreaView className="flex-1 bg-bg" />;
  return (
    <Editor
      key={existing?._id ?? "new"}
      existing={existing ?? null}
      geofence={settings?.geofence ?? null}
      onboarding={onboarding === "1"}
    />
  );
}

type Existing = FunctionReturnType<typeof api.addresses.list>[number];

function Editor({ existing, geofence, onboarding }: { existing: Existing | null; geofence: LngLat[] | null; onboarding: boolean }) {
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
      if (onboarding) router.replace("/");
      else router.back();
    } catch (e) {
      haptic.error();
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1">
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
            <View style={{ marginBottom: formatted ? 92 : 44 }} className="items-center">
              {formatted ? (
                <View className={`mb-2 rounded-xl px-3 py-1.5 ${outside ? "bg-error" : "bg-ink"}`}>
                  <Text variant="caption" tone="inherit" style={{ color: outside ? colors.onError : colors.bg }}>
                    {outside ? "Outside our delivery area" : "Your gate goes here"}
                  </Text>
                </View>
              ) : null}
              <MapPin size={44} weight="fill" color={outside ? colors.error : colors.brand} />
            </View>
          </View>

          <SafeAreaView edges={["top"]} className="absolute left-0 right-0 top-0" pointerEvents="box-none">
            <View className="flex-row gap-2.5 px-4 pt-2">
              <BackButton floating label={onboarding ? "Back" : "Close"} />
              <Pressable
                scale={false}
                onPress={searchSheet.present}
                accessibilityRole="search"
                accessibilityLabel={formatted ? `Address: ${formatted}. Tap to search again` : "Search for your street or area"}
                className="flex-1 flex-row items-center gap-2.5 rounded-2xl bg-surface px-4"
                style={{ height: 48, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
              >
                <MagnifyingGlass size={20} color={colors.inkFaint} />
                <Text variant="body" tone={formatted ? "ink" : "faint"} numberOfLines={1} className="flex-1">
                  {formatted || "Search street or area"}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <SafeAreaView
          edges={["bottom"]}
          className="-mt-7 gap-4 rounded-t-[28px] bg-surface px-5 pt-5 pb-3"
          style={{ shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 12 }}
        >
          <View className="flex-row items-center gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-brand-tint">
              <MapPin size={22} color={colors.brand} weight="bold" />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong" numberOfLines={1} accessibilityRole="header">
                {formatted ? formatted.split(",")[0] : existing ? "Edit address" : "Where should we deliver?"}
              </Text>
              <Text variant="small" tone={outside ? "error" : "muted"} numberOfLines={1}>
                {formatted
                  ? outside
                    ? "Outside our delivery area. Move the pin inside Akure."
                    : formatted.split(",").slice(1).join(",").trim() || "Inside our delivery area"
                  : "Search, then move the map so the pin is on your gate."}
              </Text>
            </View>
          </View>
          <Input
            label="Landmark or directions"
            placeholder="e.g. Opposite First Bank, blue gate"
            value={landmark}
            onChangeText={setLandmark}
            maxLength={200}
            hint="Helps your shopper find you without calling."
          />
          <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Save as">
            {LABELS.map((l) => (
              <Chip key={l} label={l} selected={label === l} onPress={() => setLabel(l)} />
            ))}
          </View>
          {label === "Other" ? (
            <Input label="Name" placeholder="e.g. Mum's house" value={customLabel} onChangeText={setCustomLabel} maxLength={30} />
          ) : null}
          {error ? (
            <View className="flex-row items-start gap-2 rounded-2xl bg-error-tint px-4 py-3" accessibilityLiveRegion="polite">
              <WarningCircle size={20} color={colors.error} />
              <Text variant="small" className="flex-1">
                {error}
              </Text>
            </View>
          ) : null}
          <View className="gap-1">
            <Button
              label={existing ? "Save changes" : "Save address"}
              onPress={() => void save()}
              loading={saving}
              disabled={!canSave}
              accessibilityHint={
                !formatted ? "Search for your address first" : outside ? "Move the pin inside Akure" : landmark.trim().length < 3 ? "Add a landmark first" : undefined
              }
            />
            {onboarding ? <Button label="Skip for now" variant="ghost" onPress={() => router.replace("/")} /> : null}
          </View>
        </SafeAreaView>
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
    </View>
  );
}
