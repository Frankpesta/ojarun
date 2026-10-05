import { View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from "react-native-svg";

export type StickerKind =
  | "tomato"
  | "pepper"
  | "onion"
  | "plantain"
  | "yam"
  | "fish"
  | "beef"
  | "eggs"
  | "rice"
  | "leaves";

/** Soft tint behind each item. Same in both themes: the stickers are illustrations, not UI chrome. */
const TINT: Record<StickerKind, string> = {
  tomato: "#FDE8E4",
  pepper: "#FEEBDF",
  onion: "#F5E6F1",
  plantain: "#FEF4D3",
  yam: "#F3EADF",
  fish: "#E4EDF5",
  beef: "#FBE5E3",
  eggs: "#F8F0E1",
  rice: "#F3EEDF",
  leaves: "#E3F3E6",
};

function Art({ kind }: { kind: StickerKind }) {
  switch (kind) {
    case "tomato":
      return (
        <G>
          <Circle cx={32} cy={37} r={19} fill="#E5483A" />
          <Ellipse cx={25} cy={31} rx={5} ry={3.5} fill="#FFFFFF" opacity={0.35} />
          <Polygon points="32,15 35,21 42,19 37,24 40,30 32,26 24,30 27,24 22,19 29,21" fill="#2F9E44" />
        </G>
      );
    case "pepper":
      return (
        <G>
          <Path d="M17 36 C17 26 25 22 32 24 C39 22 47 26 47 36 C47 46 41 51 32 51 C23 51 17 46 17 36Z" fill="#F2602B" />
          <Path d="M24 34 C24 30 27 28 30 28" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.45} />
          <Path d="M31 24 C31 19 34 15 39 15" stroke="#2F9E44" strokeWidth={4} strokeLinecap="round" fill="none" />
        </G>
      );
    case "onion":
      return (
        <G>
          <Path d="M32 11 C34 20 48 26 48 38 C48 47 41 52 32 52 C23 52 16 47 16 38 C16 26 30 20 32 11Z" fill="#9C4D8B" />
          <Path d="M32 20 C27 30 25 41 29 51" stroke="#C47DB3" strokeWidth={2} fill="none" />
          <Path d="M32 20 C37 30 39 41 35 51" stroke="#C47DB3" strokeWidth={2} fill="none" />
        </G>
      );
    case "plantain":
      return (
        <G>
          <Path d="M11 21 C18 44 40 53 54 43 C49 40 45 40 41 42 C31 45 22 37 18 20 Z" fill="#F4B400" />
          <Path d="M18 24 C23 37 31 42 41 42" stroke="#D99A00" strokeWidth={2} fill="none" />
          <Path d="M9 19 L18 20" stroke="#6B4A1F" strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case "yam":
      return (
        <G>
          <Path d="M13 41 C9 31 17 22 30 20 C43 18 55 22 53 32 C51 42 38 48 26 48 C19 48 15 45 13 41Z" fill="#8B5A2B" />
          <Ellipse cx={50} cy={28} rx={4.5} ry={7} fill="#F3E3C3" transform="rotate(-20 50 28)" />
          <Path d="M20 34 L24 33 M30 28 L33 27 M28 40 L32 39" stroke="#6E4520" strokeWidth={2} strokeLinecap="round" />
        </G>
      );
    case "fish":
      return (
        <G>
          <Path d="M9 32 C17 20 37 18 47 32 C37 46 17 44 9 32Z" fill="#5B7C99" />
          <Polygon points="46,32 57,22 57,42" fill="#46647F" />
          <Path d="M28 24 C31 29 31 35 28 40" stroke="#7D9AB4" strokeWidth={2} fill="none" />
          <Circle cx={19} cy={30} r={2.6} fill="#FFFFFF" />
          <Circle cx={19} cy={30} r={1.2} fill="#1A1714" />
        </G>
      );
    case "beef":
      return (
        <G>
          <Path d="M13 29 C13 18 30 14 42 18 C54 22 54 37 46 45 C38 53 19 50 15 42 C12 37 13 33 13 29Z" fill="#C2413B" />
          <Path d="M19 27 C27 22 40 22 47 31" stroke="#F6D3C5" strokeWidth={4} strokeLinecap="round" fill="none" />
          <Circle cx={35} cy={38} r={4} fill="#F6D3C5" />
        </G>
      );
    case "eggs":
      return (
        <G>
          <Ellipse cx={25} cy={37} rx={11} ry={14} fill="#E9D3A8" />
          <Ellipse cx={40} cy={34} rx={11} ry={14} fill="#F7EBD3" />
          <Ellipse cx={36} cy={28} rx={3} ry={4} fill="#FFFFFF" opacity={0.6} />
        </G>
      );
    case "rice":
      return (
        <G>
          <Path d="M18 25 L46 25 L50 50 C50 52.5 48.5 54 46 54 L18 54 C15.5 54 14 52.5 14 50 Z" fill="#E9D8B4" />
          <Path d="M21 25 C23 16 41 16 43 25 Z" fill="#D5BE8E" />
          <Rect x={15.5} y={37} width={33} height={7} fill="#15803D" />
        </G>
      );
    case "leaves":
      return (
        <G>
          <Path d="M32 52 C18 46 14 30 22 16 C34 22 38 38 32 52Z" fill="#2F9E44" />
          <Path d="M32 52 C42 44 52 34 50 20 C38 22 32 34 32 52Z" fill="#45B95B" />
          <Path d="M32 52 C29 40 26 30 22 18 M32 52 C37 40 42 30 49 22" stroke="#1E7A33" strokeWidth={1.8} fill="none" />
        </G>
      );
  }
}

/**
 * Illustrated produce tile: the visual language for items until real photos exist.
 * Decorative by default; give the surrounding control the accessible name.
 */
export function Sticker({ kind, size = 56, bare = false }: { kind: StickerKind; size?: number; bare?: boolean }) {
  const art = Math.round(size * 0.74);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        backgroundColor: bare ? "transparent" : TINT[kind],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={art} height={art} viewBox="0 0 64 64">
        <Art kind={kind} />
      </Svg>
    </View>
  );
}

/** Best-effort sticker for a catalogue item name; null when nothing fits (show a generic tile). */
export function stickerFor(name: string): StickerKind | null {
  const n = name.toLowerCase();
  const rules: [RegExp, StickerKind][] = [
    [/tomato|tomatoe|tumatur/, "tomato"],
    [/pepper|ata|rodo|tatashe|shombo/, "pepper"],
    [/onion|alubosa/, "onion"],
    [/plantain|ogede|dodo/, "plantain"],
    [/yam|isu/, "yam"],
    [/fish|eja|titus|mackerel|catfish|stockfish|okporoko|panla|crayfish/, "fish"],
    [/beef|meat|eran|ponmo|kpomo|shaki|goat|chicken|adie|turkey/, "beef"],
    [/egg|eyin/, "eggs"],
    [/rice|beans|garri|gari|flour|semo|elubo|oat/, "rice"],
    [/ugwu|efo|spinach|leaf|leaves|vegetable|ewedu|bitter|scent|ugu/, "leaves"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? null;
}
