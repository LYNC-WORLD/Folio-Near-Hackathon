
import { ComponentRef, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Rect } from "react-native-svg";
import { DepositFlow } from "@/components/folio/FolioSheets";
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useStockDetail } from "@/hooks/useStockDetail";
import {
  useCancelLimitOrder,
  useCreateLimitOrder,
  useSpotOrders,
  type Candle,
  type ChartPeriod,
} from "@/hooks";
import { useWallet } from "@/context/WalletContext";
import type { AssetStackParamList } from "@/navigation/AssetStackRoutes";
import { C, EASE, FONT, TYPE, em, h1Size } from "@/theme";
import { timing } from "@/theme/motion";
import {
  Badge,
  Button,
  PressScale,
  Rise,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { PriceChart, type ChartChange } from "@/components/PriceChart";
import { AmountField } from "@/components/AmountField";
import { DayPicker } from "@/components/DayPicker";
import { useSheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { BuyFlow, type BuyOutcome } from "@/components/trade/BuyFlow";
import { LockedSell, SellFlow } from "@/components/trade/SellFlow";
import { CancelRecurringFlow } from "@/components/trade/CancelRecurringFlow";
import { money, pct } from "@/lib/format";
import {
  cleanAmt,
  dayDate,
  defaultDay,
  fmtIn,
  maskUserId,
  nextOccurrence,
  thenText,
  timeAgo,
  units,
  PRE_IPO_LOCKED,
} from "@/lib/trade";
import { hTap } from "@/lib/haptics";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { TabParamList } from "@/navigation/RootTabs";
import { useAuth } from "@/context/AuthContext";

type Nav = NativeStackNavigationProp<AssetStackParamList, "StockDetail">;

const PERIOD_WORD: Record<ChartPeriod, string> = {
  "1D": "today",
  "1W": "past week",
  "1M": "past month",
  "1Y": "past year",
  All: "all time",
};

const MIN_BUY = 10;

const SLIDE = LinearTransition.duration(380).easing(EASE);

export function StockDetail() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { params } = useRoute<RouteProp<AssetStackParamList, "StockDetail">>();
  const {
    stock,
    investment,
    recurringBuy,
    latestBuys,
    loading,
    error,
    reload,
  } = useStockDetail(params.category, params.symbol);
  const {
    usdc,
    tokens,
    walletAddress,
    loading: walletLoading,
    refresh: refreshWallet,
  } = useWallet();
  const sheet = useSheet();
  const toast = useToast();

  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const amountRef = useRef<ComponentRef<typeof TextInput>>(null);
  const segY = useRef(0);
  const amountY = useRef(0);

  const [change, setChange] = useState<ChartChange | null>(null);
  const [scrub, setScrub] = useState<Candle | null>(null);
  const [mode, setMode] = useState<"buy" | "recurring" | "limit">("buy");
  const [triggerCondition, setTriggerCondition] = useState<"below" | "above">(
    "below",
  );
  const [targetPrice, setTargetPrice] = useState("");
  const [input, setInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [day, setDay] = useState(defaultDay());

  useEffect(() => {
    if (stock?.price && !targetPrice) {
      setTargetPrice((Number(stock.price) * 0.95).toFixed(2));
    }
  }, [stock?.price, targetPrice]);
  const balance = usdc?.balance ?? 0;
  const amt = parseFloat(input) || 0;
  const { user, idToken, signOut } = useAuth();
  const {
    orders,
    loading: ordersLoading,
    reload: reloadOrders,
  } = useSpotOrders(stock?.tokenAddress ?? null, "active");

  const createOrder = useCreateLimitOrder();
  const cancelOrder = useCancelLimitOrder();

  // Prototype starts at $100 — only when you have it, and only until you type.
  useEffect(() => {
    if (!touched && !walletLoading && balance >= 100) setInput("100");
  }, [walletLoading, balance, touched]);

  // keyboard: extra space at the end so the field can scroll above it
  const kb = useAnimatedKeyboard();
  const kbSpace = useAnimatedStyle(() => ({ height: kb.height.value }));

  if (loading)
    return <LoadingState top={insets.top} onBack={() => nav.goBack()} />;
  if (error || !stock) {
    return (
      <SafeAreaView style={[s.safe, s.center]}>
        <Text style={[TYPE.sub, { color: C.loss }]}>
          {error ?? "Stock not found"}
        </Text>
        <Button
          variant="quiet"
          size="sm"
          title="Retry"
          onPress={() => reload()}
          style={{ width: 140 }}
        />
      </SafeAreaView>
    );
  }

  const price = Number(stock.price);
  const isPre = params.category === "pre-ipo";
  const kind = isPre
    ? "Pre-IPO"
    : params.category === "index-fund"
      ? "ETF"
      : "Stock";

  // position
  const token = tokens?.find(
    (t: { mint: string }) => t.mint === stock.tokenAddress,
  );
  const holding = investment?.hasInvestment ? investment.data[0] : undefined;
  const held = token?.balance ?? holding?.stockAmount ?? 0;
  const posValue = held * price;
  const invested = holding?.investmesntAmount;
  const ret =
    invested && invested > 0 ? ((posValue - invested) / invested) * 100 : null;

  // recurring
  const activeRec = recurringBuy?.hasRecurringBuy
    ? recurringBuy.data.find((r) => r.isActive)
    : undefined;
  const recLabel = activeRec
    ? activeRec.usdcAmount
      ? `${money(Number(activeRec.usdcAmount))} every month`
      : `${activeRec.stockAmount} ${stock.symbol} every month`
    : undefined;

  // header: scrubbed point, else price + period change
  const shownPrice = scrub ? scrub.close : price;
  const headerSub = scrub
    ? new Date(scrub.time * 1000).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : change
      ? `${pct(change.changePct)} ${PERIOD_WORD[change.period]}`
      : " ";
  const headerColor = scrub
    ? C.ink3
    : (change?.changeAbs ?? 0) >= 0
      ? C.mint
      : C.loss;

  // amount validation (prototype renderAmt)
  const rep = mode === "recurring";
  const over = amt > balance + 1e-9;
  const zero = amt <= 0;
  const under = !zero && amt < MIN_BUY;
  const lowBalance = balance < MIN_BUY;
  const blockedRec = rep && !!activeRec;
  const needFunds = !walletLoading && !blockedRec && (lowBalance || over);

  const hint = walletLoading
    ? "Checking your balance…"
    : balance <= 0
      ? "You have no USDC yet. Add funds to buy."
      : lowBalance
        ? `Minimum buy is ${money(MIN_BUY)}. Add funds to buy.`
        : over
          ? `More than the ${money(balance)} you have available`
          : zero
            ? "Enter an amount in USDC"
            : under
              ? `Minimum buy is ${money(MIN_BUY)}`
              : `≈ ${units(price ? amt / price : 0)} ${stock.symbol} at ${money(price)}`;

  const buyTitle = blockedRec
    ? "Recurring buy already on"
    : needFunds
      ? "Add funds"
      : zero
        ? "Enter an amount"
        : under
          ? `Minimum ${money(MIN_BUY)}`
          : rep
            ? `Buy ${money(amt)} every month`
            : `Buy ${stock.symbol}`;

  const target = Number(targetPrice);

  const targetInvalid =
    !Number.isFinite(target) ||
    target <= 0 ||
    (triggerCondition === "below" && target >= price) ||
    (triggerCondition === "above" && target <= price);

  const limitDisabled =
    walletLoading || lowBalance || zero || under || over || targetInvalid;

  const limitTitle = needFunds
    ? "Add funds"
    : zero
      ? "Enter an amount"
      : under
        ? `Minimum ${money(MIN_BUY)}`
        : over
          ? "Amount exceeds balance"
          : targetInvalid
            ? "Set a valid target price"
            : "Create limit order";

  const openLimitOrder = async () => {
    if (limitDisabled) return;

    amountRef.current?.blur();

    try {
      await createOrder.mutateAsync({
        stockAddress: stock.tokenAddress,
        usdcAmount: amt,
        triggerAmount: target,
        orderSide: triggerCondition,
      });

      toast(
        "Limit order created",
        `${money(amt)} USDC · ${triggerCondition === "below" ? "BELOW" : "ABOVE"} ${money(target)}`,
      );

      await Promise.all([reloadOrders(), reload()]);
    } catch (error) {
      toast(
        "Couldn't create limit order",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };

  const handleCancelLimitOrder = async (orderId: string) => {
    try {
      await cancelOrder.mutateAsync(orderId);

      toast("Limit order cancelled", "Your order has been cancelled.");

      await reloadOrders();
    } catch (error) {
      toast(
        "Couldn't cancel order",
        error instanceof Error ? error.message : "Please try again.",
      );
    }
  };
  const buyDisabled =
    walletLoading || blockedRec || (!needFunds && (zero || under));

  const pcts = [25, 50, 75, 100].map((p) => ({
    label: p === 100 ? "Max" : `${p}%`,
    value: Math.floor(balance * p) / 100,
  }));
  const openDeposit = () => {
    amountRef.current?.blur();
    sheet.open(<DepositFlow address={walletAddress} email={user?.email} />, {
      label: "Add funds",
      onClose: () => refreshWallet(), // pick up a deposit as soon as the sheet closes
    });
  };
  // ---------- actions ----------
  const openBuy = () => {
    if (amt < MIN_BUY) return;
    amountRef.current?.blur();
    sheet.open(
      <BuyFlow
        stock={{
          tokenAddress: stock.tokenAddress,
          symbol: stock.symbol,
          price,
        }}
        amount={amt}
        recurringDay={rep ? day : null}
        isPreIpo={isPre}
        canMakeRecurring={!activeRec}
        onFinish={(o, sum) => afterBuy(o, sum)}
      />,
      {
        label: rep ? "Confirm recurring buy" : "Confirm order",
        onClose: () => reload(),
      },
    );
  };

  // switch tab, then quietly reset this stack behind it
  const leaveTo = (
    go: (tabs: BottomTabNavigationProp<TabParamList>) => void,
  ) => {
    const tabs = nav.getParent<BottomTabNavigationProp<TabParamList>>();
    if (tabs) go(tabs);
    setTimeout(() => nav.popToTop(), 350);
  };

  const afterBuy = (o: BuyOutcome, sum: { amount: number; units: number }) => {
    sheet.close();
    if (rep) toast("Recurring buy is on", `${money(sum.amount)} EVERY MONTH`);
    else
      toast(
        `${stock.symbol} is in your Folio`,
        `${money(sum.amount)} · SETTLED`,
      );
    if (o === "folio") leaveTo((t) => t.navigate("Portfolio"));
    // Standing orders live in the Profile stack (opened from Folio's gear)
    if (o === "orders")
      leaveTo((t) => t.navigate("Profile", { screen: "RecurringBuys" }));
    if (o === "makeRecurring") {
      setMode("recurring");
      setTimeout(
        () =>
          scrollRef.current?.scrollTo({
            y: Math.max(0, segY.current - 20),
            animated: true,
          }),
        450,
      );
    }
  };

  const openSell = () => {
    if (isPre && PRE_IPO_LOCKED) {
      sheet.open(<LockedSell symbol={stock.symbol} value={posValue} />);
      return;
    }
    sheet.open(
      <SellFlow
        stock={{
          tokenAddress: stock.tokenAddress,
          symbol: stock.symbol,
          price,
        }}
        balance={held}
        recurringLabel={recLabel}
        onFinish={(o, sum) => {
          sheet.close();
          toast(
            `Sold ${stock.symbol}`,
            `${money(sum.usd)} USDC · IN YOUR WALLET`,
          );
          if (o === "folio") nav.getParent()?.navigate("Portfolio" as never);
          if (o === "cancelRecurring") setTimeout(openCancel, 480);
        }}
      />,
      { label: `Sell ${stock.symbol}`, onClose: () => reload() },
    );
  };

  const openCancel = () => {
    if (!activeRec) return;
    sheet.open(
      <CancelRecurringFlow
        recurringId={activeRec.id}
        symbol={stock.symbol}
        label={recLabel ?? ""}
        onCancelled={() => reload()}
      />,
      { label: "Cancel recurring buy" },
    );
  };

  const dockTitle = mode === "limit" ? limitTitle : buyTitle;

  const dockDisabled = mode === "limit" ? limitDisabled : buyDisabled;

  const dockAction =
    mode === "limit"
      ? needFunds
        ? openDeposit
        : openLimitOrder
      : needFunds
        ? openDeposit
        : openBuy;

  return (
    <View style={s.safe}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          s.page,
          { paddingTop: insets.top + 12, paddingBottom: 130 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => nav.goBack()}
          style={({ pressed }) => [s.back, pressed && { opacity: 0.6 }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={16} color={C.mint} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        {/* header */}
        <Rise duration={420}>
          <View style={s.head}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text
                style={[TYPE.h1, h1Size(40)]}
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityRole="header"
              >
                {stock.symbol}
              </Text>
              <Text style={TYPE.sub} numberOfLines={1}>
                {stock.name} · {kind}
              </Text>
            </View>
            <View style={s.headRight}>
              <Text style={s.price}>{money(shownPrice)}</Text>
              <Text style={[s.fig, { color: headerColor }]}>{headerSub}</Text>
            </View>
          </View>
        </Rise>
        <Rise duration={420} delay={60}>
          <PriceChart
            mint={stock.tokenAddress}
            onChange={setChange}
            onScrub={setScrub}
          />
        </Rise>
        {held > 0 ? (
          <Rise duration={420} delay={120}>
            <View style={s.card}>
              <View style={s.cardHead}>
                <Text style={[TYPE.lbl, { flex: 1 }]}>YOUR POSITION</Text>
                {isPre && PRE_IPO_LOCKED ? (
                  <Badge label="LOCKED UNTIL LISTING" />
                ) : null}
              </View>
              <View style={s.posRow}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.posValue}>{money(posValue)}</Text>
                  <Text style={s.posQty}>
                    {units(held)} {stock.symbol}
                  </Text>
                </View>
                {ret != null ? (
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <Text
                      style={[s.fig, { color: ret >= 0 ? C.mint : C.loss }]}
                    >
                      {pct(ret)}
                    </Text>
                    <Text style={s.tinyLbl}>RETURN</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Rise>
        ) : null}
        {activeRec ? (
          <Rise duration={420} delay={150}>
            <View style={s.card}>
              <View style={s.cardHead}>
                <View style={s.liveDot} />
                <Text style={[TYPE.lbl, { flex: 1 }]}>RECURRING BUY</Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={[TYPE.ttl, { fontSize: 16 }]}>{recLabel}</Text>
                <Text style={TYPE.sub}>
                  Next buy {dayDate(nextOccurrence(Number(activeRec.buyDate)))}
                </Text>
              </View>
              <Pressable
                onPress={openCancel}
                hitSlop={10}
                style={s.linkDanger}
                accessibilityRole="button"
              >
                <Text style={s.linkDangerText}>Cancel recurring buy</Text>
              </Pressable>
            </View>
          </Rise>
        ) : null}
        <View onLayout={(e) => (segY.current = e.nativeEvent.layout.y)}>
          <Segmented
            options={[
              ["buy", "Buy"],
              ["limit", "Limit"],
              ["recurring", "Recurring"],
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <View onLayout={(e) => (amountY.current = e.nativeEvent.layout.y)}>
          <AmountField
            ref={amountRef}
            value={input}
            onChangeText={(t) => {
              setTouched(true);
              setInput(cleanAmt(t));
            }}
            amount={amt}
            pcts={pcts}
            onPick={(v) => {
              setTouched(true);
              setInput(fmtIn(v));
            }}
            availValue={walletLoading ? "…" : money(balance)}
            availLabel="USDC AVAILABLE"
            hint={hint}
            bad={over || under}
            onFocus={() =>
              setTimeout(
                () =>
                  scrollRef.current?.scrollTo({
                    y: Math.max(0, amountY.current - 90),
                    animated: true,
                  }),
                250,
              )
            }
          />
        </View>
        {mode === "limit" ? (
          <Animated.View
            entering={FadeIn.duration(260)}
            exiting={FadeOut.duration(160)}
            style={{ gap: 14 }}
          >
            {/* Trigger condition */}
            <View style={{ gap: 9 }}>
              <Text style={TYPE.lbl}>BUY WHEN PRICE</Text>

              <View style={s.limitConditionRow}>
                <Pressable
                  onPress={() => {
                    hTap();
                    setTriggerCondition("below");
                  }}
                  style={[
                    s.limitCondition,
                    triggerCondition === "below" && s.limitConditionActive,
                  ]}
                >
                  <Ionicons
                    name="trending-down"
                    size={17}
                    color={triggerCondition === "below" ? C.mint : C.ink3}
                  />
                  <Text
                    style={[
                      s.limitConditionText,
                      triggerCondition === "below" &&
                        s.limitConditionTextActive,
                    ]}
                  >
                    Drops to
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    hTap();
                    setTriggerCondition("above");
                  }}
                  style={[
                    s.limitCondition,
                    triggerCondition === "above" && s.limitConditionActive,
                  ]}
                >
                  <Ionicons
                    name="trending-up"
                    size={17}
                    color={triggerCondition === "above" ? C.mint : C.ink3}
                  />
                  <Text
                    style={[
                      s.limitConditionText,
                      triggerCondition === "above" &&
                        s.limitConditionTextActive,
                    ]}
                  >
                    Rises to
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Target price */}
            <View style={{ gap: 9 }}>
              <View style={s.limitLabelRow}>
                <Text style={TYPE.lbl}>TARGET PRICE</Text>
                <Text style={s.limitCurrentPrice}>Current {money(price)}</Text>
              </View>

              <View style={s.limitPriceInput}>
                <Text style={s.limitDollar}>$</Text>

                <TextInput
                  value={targetPrice}
                  onChangeText={(value) => {
                    setTargetPrice(value.replace(/[^0-9.]/g, ""));
                  }}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={C.ink4}
                  style={s.limitPriceText}
                  selectTextOnFocus
                />

                <Text style={s.limitCurrency}>USD</Text>
              </View>

              {targetInvalid && targetPrice.length > 0 ? (
                <Text style={s.limitError}>
                  {triggerCondition === "below"
                    ? "Target price must be below the current price."
                    : "Target price must be above the current price."}
                </Text>
              ) : (
                <Text style={s.limitHint}>
                  Your order triggers when {stock.symbol}{" "}
                  {triggerCondition === "below" ? "falls to" : "rises to"}{" "}
                  {targetPrice ? money(target) : "your target price"}.
                </Text>
              )}
            </View>

            {/* Order summary */}
            <View style={s.limitSummary}>
              <WashRow
                k="ORDER TYPE"
                v={triggerCondition === "below" ? "Buy below" : "Buy above"}
              />
              <WashRow k="INVESTMENT" v={money(amt)} />
              <WashRow k="TARGET PRICE" v={money(target)} last />
            </View>

            <Text style={s.limitDisclaimer}>
              Your USDC will be committed to this order. Execution depends on
              market conditions, available liquidity and slippage.
            </Text>
          </Animated.View>
        ) : null}
        {mode === "limit" ? (
          <Animated.View entering={FadeIn.duration(260)} style={{ gap: 10 }}>
            <View style={s.limitOrdersHeader}>
              <Text style={TYPE.lbl}>YOUR ACTIVE ORDERS</Text>

              <Pressable onPress={() => reloadOrders()} hitSlop={10}>
                <Ionicons name="refresh" size={16} color={C.ink3} />
              </Pressable>
            </View>

            {ordersLoading ? (
              <Skeleton height={88} radius={16} />
            ) : orders.length === 0 ? (
              <View style={s.limitEmpty}>
                <Ionicons name="git-branch-outline" size={23} color={C.ink4} />
                <Text style={s.limitEmptyTitle}>No active limit orders</Text>
                <Text style={s.limitEmptySub}>
                  Orders you create will appear here.
                </Text>
              </View>
            ) : (
              orders.map((order) => {
                const amount = Number(order.initialInputAmount) / 1_000_000;

                const isBelow = order.triggerCondition === "below";

                return (
                  <View key={order.id} style={s.limitOrderCard}>
                    <View style={s.limitOrderTop}>
                      <View style={s.limitOrderIcon}>
                        <Ionicons
                          name={isBelow ? "trending-down" : "trending-up"}
                          size={17}
                          color={C.mint}
                        />
                      </View>

                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={s.limitOrderTitle}>
                          Buy {isBelow ? "below" : "above"}{" "}
                          {money(order.triggerPriceUsd)}
                        </Text>

                        <Text style={s.limitOrderSub}>
                          {money(amount)} USDC · {order.orderState}
                        </Text>
                      </View>

                      <Badge label="ACTIVE" />
                    </View>

                    <View style={s.limitOrderDivider} />

                    <View style={s.limitOrderBottom}>
                      <Text style={s.limitOrderDate}>
                        Created {new Date(order.createdAt).toLocaleDateString()}
                      </Text>

                      <Pressable
                        onPress={() => handleCancelLimitOrder(order.id)}
                        disabled={cancelOrder.isPending}
                        hitSlop={10}
                        style={s.limitCancel}
                      >
                        <Text style={s.limitCancelText}>
                          {cancelOrder.isPending ? "Cancelling..." : "Cancel"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </Animated.View>
        ) : null}
        {rep ? (
          <Animated.View
            entering={FadeIn.duration(260)}
            exiting={FadeOut.duration(160)}
            style={{ gap: 12 }}
          >
            {activeRec ? (
              <View style={s.wash}>
                <Text style={[TYPE.sub, { color: C.ink2, lineHeight: 19 }]}>
                  You already buy {stock.symbol}{" "}
                  {recLabel?.replace(/^\$[\d,.]+ /, "")}. Cancel that one above
                  to set up a new amount.
                </Text>
              </View>
            ) : (
              <>
                <Text style={TYPE.lbl}>EVERY MONTH ON THE</Text>
                <DayPicker day={day} onPick={setDay} />
                <View style={[s.wash, { paddingVertical: 4 }]}>
                  <WashRow k="FIRST BUY" v={dayDate(nextOccurrence(day))} />
                  <WashRow k="THEN" v={thenText(day)} />
                  <WashRow k="A YEAR AT THIS RATE" v={money(amt * 12)} last />
                </View>
              </>
            )}
          </Animated.View>
        ) : null}
        <Animated.View layout={SLIDE}>
          <WashRow k="PAY WITH" v="USDC" hairOnly />
          <WashRow k="SETTLES TO" v="Your wallet" hairOnly />
        </Animated.View>
        <Animated.View layout={SLIDE} style={{ gap: 4 }}>
          <Text style={[TYPE.lbl, { marginTop: 8, marginBottom: 4 }]}>
            RECENT ACTIVITY
          </Text>
          {latestBuys.length === 0 ? (
            <Text style={TYPE.sub}>No trades yet. Be the first.</Text>
          ) : (
            latestBuys.map((b, i) => (
              <View
                key={b.id}
                style={[s.actRow, i < latestBuys.length - 1 && s.hair]}
              >
                <View
                  style={[
                    s.actDot,
                    {
                      backgroundColor: b.tradeType === "BUY" ? C.mint : C.loss,
                    },
                  ]}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[TYPE.ttl, { fontFamily: FONT.sans600 }]}>
                    {b.tradeType === "BUY" ? "Bought" : "Sold"}{" "}
                    {money(b.investmentAmount)}
                  </Text>
                  <Text style={s.actSub}>
                    {maskUserId(b.userId)} · {timeAgo(b.createdAt)}
                  </Text>
                </View>
                <Text style={[s.fig, { color: "#D6DAE0" }]}>
                  {money(b.stockPrice)}
                </Text>
              </View>
            ))
          )}
        </Animated.View>
        <Animated.View style={kbSpace} />
      </ScrollView>

      <Dock
        held={held > 0}
        locked={isPre && PRE_IPO_LOCKED}
        buyTitle={dockTitle}
        buyDisabled={
          mode === "limit"
            ? createOrder.isPending || dockDisabled
            : dockDisabled
        }
        onBuy={dockAction}
        onSell={openSell}
        bottom={insets.bottom}
      />
    </View>
  );
}

// ---------- pieces ----------

function WashRow({
  k,
  v,
  last,
  hairOnly,
}: {
  k: string;
  v: string;
  last?: boolean;
  hairOnly?: boolean;
}) {
  return (
    <View
      style={[s.washRow, hairOnly ? { minHeight: 44 } : null, !last && s.hair]}
    >
      <Text style={s.washKey}>{k}</Text>
      <Text style={[s.fig, { color: "#D6DAE0" }]}>{v}</Text>
    </View>
  );
}

/** Bottom dock: Sell slides in beside Buy once you hold the asset (prototype .dockRow). */
function Dock({
  held,
  locked,
  buyTitle,
  buyDisabled,
  onBuy,
  onSell,
  bottom,
}: {
  held: boolean;
  locked: boolean;
  buyTitle: string;
  buyDisabled: boolean;
  onBuy: () => void;
  onSell: () => void;
  bottom: number;
}) {
  const w = useSharedValue(0);
  const p = useSharedValue(held ? 1 : 0);
  useEffect(() => {
    p.value = withTiming(held ? 1 : 0, timing(420));
  }, [held]);

  // grid 1fr : 1.75fr with a 10pt gap, collapsing to 0 : 1
  const sell = useAnimatedStyle(() => ({
    width: (p.value * (w.value - 10)) / 2.75,
    marginRight: p.value * 10,
    opacity: p.value,
  }));

  return (
    <View
      style={[s.dock, { paddingBottom: 16 + bottom }]}
      pointerEvents="box-none"
    >
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(10,11,14,0)", C.ground]}
        locations={[0, 0.34]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={s.dockRow}
        onLayout={(e) => (w.value = e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[{ overflow: "hidden" }, sell]}
          pointerEvents={held ? "auto" : "none"}
        >
          <PressScale
            onPress={() => {
              hTap();
              onSell();
            }}
            style={s.sellBtn}
            accessibilityRole="button"
            accessibilityLabel={locked ? "Sell, locked until listing" : "Sell"}
          >
            {locked ? (
              <Svg
                width={13}
                height={13}
                viewBox="0 0 16 16"
                fill="none"
                stroke={C.ink1}
                strokeWidth={1.8}
                strokeLinecap="round"
              >
                <Rect x="3" y="7" width="10" height="7" rx="2" />
                <Path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
              </Svg>
            ) : null}
            <Text style={s.sellText} numberOfLines={1}>
              Sell
            </Text>
          </PressScale>
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Button title={buyTitle} disabled={buyDisabled} onPress={onBuy} />
        </View>
      </View>
    </View>
  );
}

function LoadingState({ top, onBack }: { top: number; onBack: () => void }) {
  return (
    <View
      style={[s.safe, { paddingTop: top + 12, paddingHorizontal: 20, gap: 18 }]}
    >
      <Pressable
        onPress={onBack}
        style={s.back}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={16} color={C.mint} />
        <Text style={s.backText}>Back</Text>
      </Pressable>
      <View style={s.head}>
        <View style={{ flex: 1, gap: 10 }}>
          <Skeleton width={140} height={36} />
          <Skeleton width={110} height={12} />
        </View>
        <View style={{ alignItems: "flex-end", gap: 10 }}>
          <Skeleton width={96} height={20} />
          <Skeleton width={70} height={12} />
        </View>
      </View>
      <Skeleton height={210} radius={16} />
      <Skeleton height={46} radius={999} />
      <Skeleton height={70} radius={16} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.ground },
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  page: { paddingHorizontal: 20, gap: 18 },

  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    minHeight: 44,
    marginLeft: -4,
    marginVertical: -8,
  },
  backText: { fontFamily: FONT.sans600, fontSize: 13, color: C.mint },

  head: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headRight: { alignItems: "flex-end", gap: 6, paddingTop: 4 },
  price: {
    fontFamily: FONT.mono400,
    fontSize: 20,
    letterSpacing: em(20, -0.03),
    color: C.ink1,
    fontVariant: ["tabular-nums"],
  },
  fig: {
    fontFamily: FONT.mono400,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: C.mint },
  posRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  posValue: {
    fontFamily: FONT.mono400,
    fontSize: 24,
    letterSpacing: em(24, -0.03),
    color: C.ink1,
    fontVariant: ["tabular-nums"],
  },
  posQty: { fontFamily: FONT.mono400, fontSize: 11.5, color: C.ink3 },
  tinyLbl: {
    fontFamily: FONT.mono400,
    fontSize: 9,
    letterSpacing: em(9, 0.14),
    color: C.ink4,
  },
  linkDanger: {
    alignSelf: "flex-start",
    minHeight: 32,
    justifyContent: "center",
  },
  linkDangerText: { fontFamily: FONT.sans600, fontSize: 13.5, color: C.loss },

  wash: {
    backgroundColor: C.sunk,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  washRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  washKey: {
    flex: 1,
    fontFamily: FONT.mono400,
    fontSize: 10,
    letterSpacing: em(10, 0.18),
    color: C.ink4,
  },
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },

  limitConditionRow: {
    flexDirection: "row",
    gap: 10,
  },

  limitCondition: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.stroke,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  limitConditionActive: {
    borderColor: C.mint,
    backgroundColor: C.sunk,
  },

  limitConditionText: {
    fontFamily: FONT.sans600,
    fontSize: 13,
    color: C.ink3,
  },

  limitConditionTextActive: {
    color: C.mint,
  },

  limitLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  limitCurrentPrice: {
    fontFamily: FONT.mono400,
    fontSize: 11,
    color: C.ink4,
  },

  limitPriceInput: {
    height: 64,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.stroke,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },

  limitDollar: {
    fontFamily: FONT.mono400,
    fontSize: 22,
    color: C.ink3,
  },

  limitPriceText: {
    flex: 1,
    fontFamily: FONT.mono400,
    fontSize: 25,
    color: C.ink1,
    padding: 0,
  },

  limitCurrency: {
    fontFamily: FONT.mono400,
    fontSize: 11,
    color: C.ink4,
  },

  limitHint: {
    fontFamily: FONT.sans400,
    fontSize: 11,
    color: C.ink4,
    lineHeight: 17,
  },

  limitError: {
    fontFamily: FONT.sans400,
    fontSize: 11,
    color: C.loss,
  },

  limitSummary: {
    backgroundColor: C.sunk,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 5,
  },

  limitDisclaimer: {
    fontFamily: FONT.sans400,
    fontSize: 11,
    lineHeight: 17,
    color: C.ink4,
  },

  limitOrdersHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  limitEmpty: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },

  limitEmptyTitle: {
    fontFamily: FONT.sans600,
    fontSize: 14,
    color: C.ink2,
  },

  limitEmptySub: {
    fontFamily: FONT.sans400,
    fontSize: 12,
    color: C.ink4,
  },

  limitOrderCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 15,
    gap: 12,
  },

  limitOrderTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },

  limitOrderIcon: {
    height: 36,
    width: 36,
    borderRadius: 12,
    backgroundColor: C.sunk,
    alignItems: "center",
    justifyContent: "center",
  },

  limitOrderTitle: {
    fontFamily: FONT.sans600,
    fontSize: 14,
    color: C.ink1,
  },

  limitOrderSub: {
    fontFamily: FONT.mono400,
    fontSize: 11,
    color: C.ink4,
  },

  limitOrderDivider: {
    height: 1,
    backgroundColor: C.hair,
  },

  limitOrderBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  limitOrderDate: {
    fontFamily: FONT.mono400,
    fontSize: 10,
    color: C.ink4,
  },

  limitCancel: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },

  limitCancelText: {
    fontFamily: FONT.sans600,
    fontSize: 12,
    color: C.loss,
  },

  actRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actDot: { width: 7, height: 7, borderRadius: 999 },
  actSub: { fontFamily: FONT.mono400, fontSize: 11, color: C.ink4 },

  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 22,
    paddingHorizontal: 20,
  },
  dockRow: { flexDirection: "row", alignItems: "center" },
  sellBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: C.raised,
    borderWidth: 1.5,
    borderColor: C.strokeHi,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  sellText: { fontFamily: FONT.sans700, fontSize: 16, color: C.ink1 },
});
