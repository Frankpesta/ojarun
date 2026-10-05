import { Redirect } from "expo-router";

/**
 * Paystack's return page opens ojarun://pay/return. While checkout is waiting, the payment browser
 * catches that link; if the app was opened from it some other way, land on the Orders tab.
 */
export default function PayReturn() {
  return <Redirect href="/orders" />;
}
