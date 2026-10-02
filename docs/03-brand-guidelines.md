# OjaRun — 03 Brand Guidelines

## 1. Brand idea

**Name: OjaRun.** *Oja* is Yoruba for "market", and a "market run" is exactly what the app does for you. The name is short, easy to say in Akure, and works as a verb: "Just OjaRun it."

**Fresh from the market, without the stress.** The brand should feel fresh, honest and local, like a trusted market person who knows the traders, rather than a cold corporate grocery app.

The palette comes from the market itself: the **green** of fresh leafy vegetables (ugu, efo, spinach) as the primary colour, and the **red-orange of fresh pepper and tomatoes** as the secondary colour. Palm-oil yellow is an optional accent.

## 2. Colour palette

All contrast ratios below were calculated against WCAG 2.1. **AA** requires 4.5:1 for normal text and 3:1 for large text or UI elements.

### Primary — Market Green

| Token | Hex | Use |
|---|---|---|
| `green-50` | `#ECFDF3` | Tinted backgrounds, selected states |
| `green-600` **(brand)** | `#15803D` | Primary buttons, links, active tabs, logo |
| `green-700` | `#166534` | Pressed state, high-emphasis surfaces |
| `green-900` | `#14532D` | Headings on tints, deep brand surfaces |

- White on `#15803D` = **5.02:1** (AA)
- White on `#166534` = **7.13:1** (AAA)
- `#14532D` on `#ECFDF3` = **8.64:1** (AAA)
- `#15803D` text on `#FAFAF7` = **4.80:1** (AA)

### Secondary — Pepper Orange

| Token | Hex | Use |
|---|---|---|
| `pepper-500` **(brand)** | `#E4572E` | Accents, badges, promos, highlights, illustrations |
| `pepper-700` | `#C2410C` | Secondary buttons with **white** text, orange text on light backgrounds |

- White on `#E4572E` = 3.68:1 — **large text and icons only**. For body-size text on `pepper-500`, use dark text instead: `#1A1A1A` = **4.73:1** (AA).
- White on `#C2410C` = **5.18:1** (AA)
- `#C2410C` text on `#FAFAF7` = **4.95:1** (AA)

### Optional accent — Palm Yellow

| Token | Hex | Use |
|---|---|---|
| `palm-500` | `#F4B400` | Wallet / savings highlights, warnings, ratings. **Always with dark text** (`#1A1A1A` = 9.43:1) |

*Alternative secondary:* if you'd like the app to feel warmer and less energetic, swap Pepper Orange for Palm Yellow as the secondary colour and drop the orange. Green + orange is recommended because it reads as "fresh produce" straight away and gives strong call-to-action contrast.

### Neutrals (warm)

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FAFAF7` | App background (warm off-white) |
| `surface` | `#FFFFFF` | Cards, sheets |
| `text` | `#1C1917` | Primary text (16.72:1 on bg) |
| `text-muted` | `#57534E` | Secondary text (7.30:1 on bg) |
| `border` | `#E7E5E4` | Dividers, input borders |

### Semantic

| Token | Hex | Notes |
|---|---|---|
| `success` | `#15803D` | Same as brand green |
| `warning` | `#F4B400` | Dark text only |
| `error` | `#B42318` | White on it = 6.57:1; kept distinct from Pepper Orange so errors never look like promos |
| `info` | `#2563EB` | White on it = 5.17:1 |

### Dark mode

| Token | Hex | Contrast |
|---|---|---|
| `bg` | `#0C1A12` | Deep green-black |
| `text` | `#E8F5EC` | 15.96:1 |
| `text-muted` | `#A8B5AD` | 8.43:1 |
| `green` | `#4ADE80` | 10.28:1 on bg |
| `pepper` | `#FF7A50` | 6.95:1 on bg |

### Usage guidance

- **Green leads.** Most screens are neutral with green for primary actions. Keep orange to roughly 10% of the screen, as an accent rather than a second primary.
- **Item status colours on the checklist:** bought = green, adjusted = palm yellow, skipped = muted grey, rejected = error red.
- **Price checks** use pepper orange, so they stand out in chat as "needs your attention".
- **Photos lead.** Produce photos are the hero content, so keep the UI around them calm and neutral.

## 3. Typography (direction)

- A friendly, highly legible sans-serif that works on low-end Android screens, e.g. **Inter**, **Plus Jakarta Sans** or **Manrope**. Load it with `expo-font` / `@expo-google-fonts`.
- Prices and amounts: use tabular figures so numbers line up in the checklist and receipts.
- Always show amounts with the ₦ symbol and thousands separators (₦3,000).

## 4. NativeWind / Tailwind config

```js
// tailwind.config.js (apps/mobile) — share tokens with apps/ops
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        green: {
          50: "#ECFDF3",
          600: "#15803D",
          700: "#166534",
          900: "#14532D",
          dark: "#4ADE80",
        },
        pepper: {
          500: "#E4572E",
          700: "#C2410C",
          dark: "#FF7A50",
        },
        palm: { 500: "#F4B400" },
        bg: { DEFAULT: "#FAFAF7", dark: "#0C1A12" },
        surface: "#FFFFFF",
        ink: { DEFAULT: "#1C1917", muted: "#57534E" },
        line: "#E7E5E4",
        error: "#B42318",
        info: "#2563EB",
      },
    },
  },
};
```

Note: overriding Tailwind's `green` scale replaces its default greens. If you'd rather keep the defaults, rename the brand scale to `brand`.

## 5. Name and wordmark

- **Name:** OjaRun, written as one word with a capital O and a capital R.
- **Wordmark direction:** "Oja" in Market Green and "Run" in Pepper Orange, or the whole word in green with an orange motion mark (a basket or leaf with speed lines).
- **App icon:** a green background with a simple white basket or leaf mark. Avoid putting the full word in the icon, since it won't be readable at small sizes.
- **Before launch:** confirm the name is available on the Play Store, as a domain and on social handles, and as a business name with the CAC.
