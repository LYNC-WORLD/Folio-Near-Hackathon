import { useEffect, useState, useSyncExternalStore } from "react";
import { Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { tradeStyles } from "./tradeStyles";

// Tiny toast bus: call toast() from anywhere; every mounted <PerpToast /> shows it.
type Toast = { id: number; title: string; sub?: string } | null;
let current: Toast = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => current;

export function toast(title: string, sub?: string) {
  current = { id: Date.now(), title, sub };
  listeners.forEach((l) => l());
}

export function PerpToast() {
  const t = useSyncExternalStore(subscribe, snapshot, snapshot);
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<typeof t>(null);
  useEffect(() => {
    if (!t) return;
    setShown(t);
    const id = setTimeout(() => setShown(null), 2900);
    return () => clearTimeout(id);
  }, [t?.id]); // eslint-disable-line
  if (!shown) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(180)}
      pointerEvents="none"
      style={[tradeStyles.toast, { top: insets.top + 10 }]}
    >
      <Text style={tradeStyles.toastT}>{shown.title}</Text>
      {shown.sub ? <Text style={tradeStyles.toastS}>{shown.sub}</Text> : null}
    </Animated.View>
  );
}
