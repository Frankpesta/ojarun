import { useState } from "react";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Button, Sheet, Text, type SheetController } from "@/components";

export function SignOutSheet({ sheet }: { sheet: SheetController }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      sheet={sheet}
      variant="critical"
      title="Sign out?"
      footer={
        <>
          <Button
            label="Sign out"
            variant="danger"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await signOut();
                sheet.dismiss();
                router.replace("/");
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button label="Stay signed in" variant="ghost" onPress={sheet.dismiss} />
        </>
      }
    >
      <Text variant="body" tone="muted">
        You'll need a new SMS code to sign back in. Your orders and wallet stay safe.
      </Text>
    </Sheet>
  );
}
