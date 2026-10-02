import { View } from "react-native";
import { formatNaira, formatNairaDigits, parseNairaInput, type Kobo } from "@ojarun/shared";
import { Input, type InputProps } from "./Input";
import { Text } from "./Text";
import { Chip } from "./Chip";

const DEFAULT_QUICK: Kobo[] = [1_000_00, 2_000_00, 3_000_00, 5_000_00];

export type MoneyInputProps = Omit<InputProps, "value" | "onChangeText" | "keyboardType" | "large" | "leading"> & {
  /** Integer kobo, or null when empty. */
  value: Kobo | null;
  onChange: (kobo: Kobo | null) => void;
  /** Quick amounts under the field (05 §7.4). Pass [] to hide. */
  quickAmounts?: Kobo[];
};

/** ₦ prefix, live thousands separators, whole naira only. Holds kobo internally. */
export function MoneyInput({ value, onChange, quickAmounts = DEFAULT_QUICK, ...rest }: MoneyInputProps) {
  return (
    <View className="gap-3">
      <Input
        {...rest}
        large
        keyboardType="number-pad"
        inputMode="numeric"
        value={value == null ? "" : formatNairaDigits(value)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, "").slice(0, 9);
          onChange(digits === "" ? null : parseNairaInput(digits));
        }}
        placeholder="0"
        leading={
          <Text variant="title" tone="muted">
            ₦
          </Text>
        }
      />
      {quickAmounts.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {quickAmounts.map((amount) => (
            <Chip
              key={amount}
              label={formatNaira(amount)}
              selected={value === amount}
              onPress={() => onChange(amount)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
