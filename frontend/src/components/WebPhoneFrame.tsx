import type { ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { C } from "../theme/colors";

const DESKTOP_BREAKPOINT = 600;
const PHONE_WIDTH = 430;
const PHONE_MAX_HEIGHT = 880;
const DESKTOP_GUTTER = 24;

type WebPhoneFrameProps = {
  children: ReactNode;
};

/**
 * Keeps the app full-screen on native and narrow browser windows. On larger
 * browser windows it presents the mobile-first UI in a centered phone frame.
 */
export function WebPhoneFrame({ children }: WebPhoneFrameProps) {
  const { width, height } = useWindowDimensions();
  const showPhoneFrame = Platform.OS === "web" && width >= DESKTOP_BREAKPOINT;

  if (!showPhoneFrame) {
    return <View style={styles.fullScreen}>{children}</View>;
  }

  const phoneHeight = Math.min(
    PHONE_MAX_HEIGHT,
    Math.max(0, height - DESKTOP_GUTTER * 2),
  );

  return (
    <View style={styles.desktopCanvas}>
      <View style={[styles.phone, { height: phoneHeight }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  desktopCanvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: DESKTOP_GUTTER,
    backgroundColor: "#161A21",
  },
  phone: {
    width: "100%",
    maxWidth: PHONE_WIDTH,
    overflow: "hidden",
    borderRadius: 32,
    backgroundColor: C.ground,
    borderWidth: 1,
    borderColor: C.stroke,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.42,
    shadowRadius: 32,
    elevation: 16,
  },
});
