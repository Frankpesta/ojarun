import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, X } from "phosphor-react-native";
import { Button, Pressable, Text } from "@/components";
import { haptic } from "@/lib/haptics";

/**
 * Full-screen back camera for item photos. Returns the raw capture's URI; the caller shrinks it
 * with prepareItemPhoto. Opening the item screen to the camera should take under a second (05 §9 M7).
 */
export function CameraCapture({ visible, onClose, onCaptured }: { visible: boolean; onClose: () => void; onCaptured: (uri: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    haptic.light();
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.8, shutterSound: false });
      if (pic?.uri) onCaptured(pic.uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        {permission?.granted ? (
          <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />
        ) : (
          <SafeAreaView className="flex-1 justify-center gap-4 px-gutter">
            <Text variant="heading" tone="onForest">
              Allow the camera
            </Text>
            <Text variant="body" tone="onForestSoft">
              Your customer sees a photo of every item you buy. OjaRun only uses the camera on this screen.
            </Text>
            {permission && !permission.canAskAgain ? (
              <Button label="Open settings" variant="onForest" onPress={() => void Linking.openSettings()} />
            ) : (
              <Button label="Allow camera" variant="onForest" onPress={() => void requestPermission()} />
            )}
          </SafeAreaView>
        )}

        <SafeAreaView edges={["top"]} className="absolute left-0 right-0 top-0 px-gutter pt-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            className="items-center justify-center rounded-full bg-black/50"
            style={{ width: 44, height: 44 }}
          >
            <X size={22} color="#FFFFFF" weight="bold" />
          </Pressable>
        </SafeAreaView>

        {permission?.granted ? (
          <SafeAreaView edges={["bottom"]} className="absolute bottom-0 left-0 right-0 items-center pb-6">
            <Pressable
              onPress={() => void shoot()}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              className="items-center justify-center rounded-full border-4 border-white"
              style={{ width: 80, height: 80 }}
            >
              <View className="items-center justify-center rounded-full bg-white" style={{ width: 64, height: 64 }}>
                {busy || !ready ? <ActivityIndicator color="#0B3B22" /> : <Camera size={28} color="#0B3B22" weight="fill" />}
              </View>
            </Pressable>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
}
