import { Linking, View } from "react-native";
import { useQuery } from "convex/react";
import { ChatCircleText, Phone } from "phosphor-react-native";
import { formatNigerianPhone, normalizeNigerianPhone } from "@ojarun/shared";
import { api } from "@ojarun/convex/api";
import { ListItem, Sheet, Text, useToast, type SheetController } from "@/components";

/** WhatsApp + phone, as decided (05 §2). Numbers come from ops settings. */
export function SupportSheet({ sheet, audience = "customer" }: { sheet: SheetController; audience?: "customer" | "shopper" }) {
  const settings = useQuery(api.settings.publicSettings);
  const toast = useToast();

  const whatsapp = settings?.supportWhatsapp ? normalizeNigerianPhone(settings.supportWhatsapp) : null;
  const phone = settings?.supportPhone ? normalizeNigerianPhone(settings.supportPhone) : null;

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
      sheet.dismiss();
    } catch {
      toast.show({ message: "We couldn't open that. Try calling instead.", tone: "error" });
    }
  };

  return (
    <Sheet
      sheet={sheet}
      title={audience === "shopper" ? "Contact ops" : "Get help"}
      subtitle={
        audience === "shopper"
          ? "For anything about your batch, payments or a customer."
          : "Chat with us on WhatsApp or give us a call."
      }
    >
      {whatsapp || phone ? (
        <View>
          {whatsapp ? (
            <ListItem
              icon={ChatCircleText}
              title="Chat on WhatsApp"
              subtitle={formatNigerianPhone(whatsapp)}
              onPress={() => void open(`https://wa.me/${whatsapp.replace("+", "")}`)}
            />
          ) : null}
          {phone ? (
            <ListItem
              icon={Phone}
              title="Call us"
              subtitle={formatNigerianPhone(phone)}
              onPress={() => void open(`tel:${phone}`)}
            />
          ) : null}
        </View>
      ) : (
        <Text variant="body" tone="muted">
          {settings === undefined ? "Loading contact details…" : "Support contact details haven't been set up yet."}
        </Text>
      )}
    </Sheet>
  );
}
