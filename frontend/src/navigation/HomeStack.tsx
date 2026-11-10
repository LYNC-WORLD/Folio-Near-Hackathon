import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  HomeScreen,
  IndexFundDetail,
  IndexFundsScreen,
  PreIpoScreen,
  StockDetail,
  StocksScreen,
} from "@/screens";
import { stackOptions } from "./stackOptions";
import { PerpMarketsScreen } from "@/screens/PerpMarketsScreen";
import type { AssetStackParamList } from "./AssetStackRoutes";

export type HomeStackParamList = AssetStackParamList & {
  HomeMain: undefined;
  Stocks: undefined;
  PerpMarkets: undefined;
  PreIPO: undefined;
  IndexFunds: undefined;
};
const Stack = createNativeStackNavigator<HomeStackParamList>();

// Every Home screen now draws its own "‹ Back" link, like the prototype.
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ ...stackOptions, headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Stocks" component={StocksScreen} />
      <Stack.Screen name="PreIPO" component={PreIpoScreen} />
      <Stack.Screen name="PerpMarkets" component={PerpMarketsScreen} />
      <Stack.Screen name="IndexFunds" component={IndexFundsScreen} />
      <Stack.Screen name="IndexFundDetail" component={IndexFundDetail} />
      <Stack.Screen name="StockDetail" component={StockDetail} />
    </Stack.Navigator>
  );
}
