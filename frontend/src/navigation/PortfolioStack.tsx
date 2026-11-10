import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { IndexFundDetail, PortfolioScreen, StockDetail } from "@/screens";
import { stackOptions } from "./stackOptions";
import type { AssetStackParamList } from "./AssetStackRoutes";

export type PortfolioStackParamList = AssetStackParamList & {
  PortfolioMain: undefined;
};

const Stack = createNativeStackNavigator<PortfolioStackParamList>();

// Keeping Folio's asset screens in this stack means Back returns to Folio,
// including the native Android/iOS back gesture.
export function PortfolioStack() {
  return (
    <Stack.Navigator screenOptions={{ ...stackOptions, headerShown: false }}>
      <Stack.Screen name="PortfolioMain" component={PortfolioScreen} />
      <Stack.Screen name="IndexFundDetail" component={IndexFundDetail} />
      <Stack.Screen name="StockDetail" component={StockDetail} />
    </Stack.Navigator>
  );
}
