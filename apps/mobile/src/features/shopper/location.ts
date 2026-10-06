import * as Location from "expo-location";

/**
 * Best-effort foreground location for status events. Never blocks the shopper: no permission,
 * no fix within 5 s, or GPS off all return null and the action goes ahead without it.
 */
export async function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") ({ status } = await Location.requestForegroundPermissionsAsync());
    if (status !== "granted") return null;
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    const fix =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
      ]));
    return fix ? { lat: fix.coords.latitude, lng: fix.coords.longitude } : null;
  } catch {
    return null;
  }
}
