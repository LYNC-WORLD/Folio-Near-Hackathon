// Segmented control with a sliding thumb; label colours follow the thumb as it moves.
//
//   ( [ Leaderboard ]   Groups      )   ← thumb slides 340ms, label turns mint
//
// variant "outline" (default): transparent thumb with a mint ring (Buy / Recurring).
// variant "raised": thumb on raised with a 1pt #313844 ring (Leaderboard / Groups).
import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { C } from "@/theme/colors";
import { FONT } from "@/theme/fonts";
import { DUR, timing } from "@/theme/motion";
import { hSelect } from "@/lib/haptics";

type Props<K extends string> = {
  options: readonly (readonly [K, string])[]; // [key, label]
  value: K;
  onChange: (k: K) => void;
  variant?: "outline" | "raised";
  label?: string; // accessibility label for the tablist
  style?: StyleProp<ViewStyle>;
};

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  variant = "outline",
  label,
  style,
}: Props<K>) {
  const index = Math.max(
    0,
    options.findIndex(([k]) => k === value),
  );
  const pos = useSharedValue(index);
  const width = useSharedValue(0);
  const n = options.length;

  useEffect(() => {
    pos.value = withTiming(index, timing(DUR.segment));
  }, [index]);

  const thumb = useAnimatedStyle(() => {
    const w = (width.value - 8) / n;
    return {
      width: Math.max(0, w),
      transform: [{ translateX: pos.value * w }],
    };
  });

  return (
    <View
      style={[s.wrap, style]}
      onLayout={(e) => (width.value = e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
      accessibilityLabel={label}
    >
      <Animated.View style={[s.thumb, s[variant], thumb]} />
      {options.map(([k, text], i) => (
        <Pressable
          key={k}
          style={s.btn}
          accessibilityRole="tab"
          accessibilityState={{ selected: k === value }}
          onPress={() => {
            if (k === value) return;
            hSelect();
            onChange(k);
          }}
        >
          <SegLabel label={text} i={i} pos={pos} />
        </Pressable>
      ))}
    </View>
  );
}

function SegLabel({
  label,
  i,
  pos,
}: {
  label: string;
  i: number;
  pos: SharedValue<number>;
}) {
  const a = useAnimatedStyle(() => {
    const near = 1 - Math.min(1, Math.abs(pos.value - i));
    return { color: interpolateColor(near, [0, 1], [C.ink3, C.mint]) };
  });
  return (
    <Animated.Text numberOfLines={1} style={[s.label, a]}>
      {label}
    </Animated.Text>
  );
}

const s = StyleSheet.create({
  wrap: {
    height: 46,
    padding: 4,
    borderRadius: 999,
    backgroundColor: C.surface,
    flexDirection: "row",
  },
  thumb: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 999,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: C.mint,
  },
  raised: {
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: "#313844",
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  label: { fontFamily: FONT.sans700, fontSize: 14 },
});
