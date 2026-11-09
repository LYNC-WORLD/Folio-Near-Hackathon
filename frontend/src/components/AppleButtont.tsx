import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function AppleButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Continue with Apple"
      style={({ pressed }) => ({
        height: 52,
        width: "100%",
        borderRadius: 999,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name="logo-apple" size={20} color="#06120d" />
        <Text
          style={{
            fontFamily: "InterTight_700Bold",
            fontSize: 16,
            letterSpacing: -0.16,
            color: "#06120d",
          }}
        >
          Continue with Apple
        </Text>
      </View>
    </Pressable>
  );
}
