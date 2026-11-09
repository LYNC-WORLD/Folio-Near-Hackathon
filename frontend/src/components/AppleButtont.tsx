import * as AppleAuthentication from "expo-apple-authentication";

export function AppleButton({ onPress }: { onPress: () => void }) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={1000333}
      style={{ height: 52, width: "100%" }}
      onPress={onPress}
    />
  );
}
