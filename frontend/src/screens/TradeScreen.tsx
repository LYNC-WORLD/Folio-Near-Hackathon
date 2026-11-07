import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  useScrollToTop,
} from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTabBarSpace } from "@/navigation/TabBar";
import {
  MarketPickerSheet,
  MarketStatusSheet,
  UnlockSheet,
  QUIZ_SEEN_KEY,
} from "@/components/perps/PerpSheets";
import { PerpToast, toast } from "@/components/perps/PerpToast";
import { LivePositionSheet } from "@/components/perps/LivePositionSheet";
import { LiveOrderSheet } from "@/components/perps/LiveOrderSheet";
import { TpSlSheet } from "@/components/perps/TpSlSheet";
import { TransferSheet } from "@/components/TransferSheet";
import { ChartStage } from "@/components/perps/PerpChart";
import { OrderTicketSheet } from "@/components/perps/OrderTicketSheet";
import { tradeStyles } from "@/components/perps/tradeStyles";
import {
  useLiveMarket,
  useMarkets,
  usePerpsSession,
  useSocketStatus,
} from "@/hooks/perps";
import {
  useAllPositions,
  useAllOrders,
  type SymOrder,
} from "@/hooks/perps/useSymbolTrading";
import { tradeService, unwrap } from "@/services/perps/tradeService";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { useTradablePerps } from "@/hooks/useTradablePerps";
import { useTransfers } from "@/hooks/useTransfers";
import { TransferBanner } from "./trade/TransferBanner";
import { TradeHeader } from "./trade/TradeHeader";
import { MarketSummary } from "./trade/MarketSummary";
import { TradePanel } from "./trade/TradePanel";
import { TradeDock } from "./trade/TradeDock";
import { ROLE_LABEL, orderTone } from "./trade/orderLabels";

type TransferOpts = { dir?: "in" | "out"; amt?: number; then?: () => void };
type SheetState =
  | null
  | { t: "market" }
  | { t: "status" }
  | { t: "unlock"; side: 1 | -1 }
  | { t: "ticket"; side: 1 | -1 }
  | { t: "position"; id: string }
  | { t: "order"; id: number }
  | { t: "tpsl"; id: string }
  | { t: "transfer"; dir: "in" | "out"; amt?: number; then?: () => void };

const MAX_LEV = 10;
const DEFAULT_LEV = 10;

export function TradeScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const bottom = useTabBarSpace();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const paramSym = (route.params as { symbol?: string } | undefined)?.symbol;
  const [sym, setSym] = useState(paramSym ?? "NVDA");
  useEffect(() => {
    if (paramSym) setSym(paramSym);
  }, [paramSym]);

  // ---- live data
  const session = usePerpsSession();
  const markets = useMarkets();
  const tradable = useTradablePerps();
  const live = useLiveMarket(sym);
  const posQ = useAllPositions(session.idToken);
  const ordQ = useAllOrders(session.idToken);
  const refreshTrading = () => {
    posQ.refetch();
    ordQ.refetch();
  };
  const socket = useSocketStatus();
  const walletBal = useWalletBalance();
  const bal = {
    perp: walletBal.perpAvailable,
    spot: walletBal.wallet?.usdc.balance ?? 0,
  };

  // transfer requests + their toasts; the phases also drive the top banner
  const transfers = useTransfers();

  const [quizSeen, setQuizSeen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(QUIZ_SEEN_KEY)
      .then((v) => setQuizSeen(v === "1"))
      .catch(() => {});
  }, []);

  const [sheet, setSheet] = useState<SheetState>(null);
  const [locked, setLocked] = useState(false);
  const [chartY, setChartY] = useState(0);

  const openTransfer = (o?: TransferOpts) =>
    setSheet({
      t: "transfer",
      dir: o?.dir ?? "in",
      amt: o?.amt,
      then: o?.then,
    });

  const listing = tradable.markets.find((m) => m.symbol === sym);
  const name: string = listing?.name ?? sym;
  const listed = !!live.market;
  const notListed = !markets.loading && !markets.error && !listed;
  const maxLev = listed ? Math.min(MAX_LEV, live.maxLeverage) : MAX_LEV;

  const markOf = (coin: string, fallback: number) =>
    coin === live.coin ? live.mark : (markets.byCoin[coin]?.mid ?? fallback);

  const openTicket = (side: 1 | -1) => {
    if (!listed)
      return toast("Not tradable", `${sym.toUpperCase()} ISN'T LISTED ON HYPERLIQUID`);
    setSheet(quizSeen ? { t: "ticket", side } : { t: "unlock", side });
  };
  const toChart = () =>
    scrollRef.current?.scrollTo({
      y: Math.max(0, chartY - 60),
      animated: true,
    });
  const goSpot = () =>
    (nav as any).navigate("Home", {
      screen: "StockDetail",
      params: { symbol: sym, category: "us-stock" },
    });

  const positions = posQ.data.map((p) => ({
    ...p,
    tp: ordQ.data.find((o) => o.coin === p.coin && o.role === "tp")?.px ?? null,
    sl: ordQ.data.find((o) => o.coin === p.coin && o.role === "sl")?.px ?? null,
  }));

  const sheetPos =
    sheet?.t === "position"
      ? positions.find((p) => p.id === sheet.id)
      : undefined;
  const sheetOrd =
    sheet?.t === "order" ? ordQ.data.find((o) => o.id === sheet.id) : undefined;
  const sheetTpSl =
    sheet?.t === "tpsl" ? positions.find((p) => p.id === sheet.id) : undefined;

  const cancelOrder = async (o: SymOrder) => {
    if (!session.idToken) throw new Error("Sign in first");
    await unwrap(
      tradeService.cancelPerpOrder(
        { assetSymbol: o.coin, orderId: String(o.oid) },
        session.idToken,
      ),
    );
    refreshTrading();
  };

  return (
    <SafeAreaView style={tradeStyles.safe} edges={["top"]}>
      <TransferBanner
        deposit={transfers.depositStatus}
        withdraw={transfers.withdrawStatus}
      />
      <ScrollView
        ref={scrollRef}
        scrollEnabled={!locked}
        showsVerticalScrollIndicator={false}
        // extra room: the dock is now two rows (balance + Long/Short)
        contentContainerStyle={{ paddingTop: 18, paddingBottom: bottom + 120 }}
      >
        <TradeHeader
          sym={sym}
          name={name}
          imageUrl={listing?.imageUrl}
          maxLev={maxLev}
          listed={listed}
          onPickMarket={() => setSheet({ t: "market" })}
          onSpot={goSpot}
        />

        <MarketSummary
          sym={sym}
          live={live}
          socket={socket}
          listed={listed}
          notListed={notListed}
          marketsError={markets.error}
          onRetry={() => markets.refresh()}
          showStatus={!!listing}
          onStatus={() => setSheet({ t: "status" })}
        />

        {/* chart */}
        {listed ? (
          <View
            onLayout={(e) => setChartY(e.nativeEvent.layout.y)}
            style={{ marginTop: 16 }}
          >
            <ChartStage
              sym={sym}
              onScrollLock={setLocked}
              positions={posQ.data}
              orders={ordQ.data}
            />
          </View>
        ) : null}

        <TradePanel
          sym={sym}
          name={name}
          listed={listed}
          live={live}
          maxLev={maxLev}
          positions={{ ...posQ, data: positions }}
          orders={ordQ}
          markOf={markOf}
          onOpenPosition={(id) => setSheet({ t: "position", id })}
          onEditTpSl={(id) => setSheet({ t: "tpsl", id })}
          onOpenOrder={(id) => setSheet({ t: "order", id })}
        />
      </ScrollView>

      <TradeDock
        perp={bal.perp}
        lev={Math.min(DEFAULT_LEV, maxLev)}
        enabled={listed}
        onTransfer={() => openTransfer()}
        onTicket={openTicket}
      />

      <PerpToast />

      {/* sheets */}
      {sheet?.t === "market" ? (
        <MarketPickerSheet
          current={sym}
          onClose={() => setSheet(null)}
          onPick={(x: string) => {
            setSym(x);
            setSheet(null);
          }}
        />
      ) : null}
      {sheet?.t === "status" ? (
        <MarketStatusSheet sym={sym} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.t === "unlock" ? (
        <UnlockSheet
          onClose={() => setSheet(null)}
          onDone={() => {
            const side = sheet.side;
            setQuizSeen(true);
            // close the quiz first, then open the Long/Short ticket once it has dismissed
            setSheet(null);
            setTimeout(() => setSheet({ t: "ticket", side }), 380);
          }}
        />
      ) : null}
      {sheet?.t === "ticket" ? (
        <OrderTicketSheet
          sym={sym}
          initialSide={sheet.side}
          perpBal={bal.perp}
          spotBal={bal.spot}
          onTransfer={(amt?: number) => {
            const side = sheet.side;
            openTransfer({
              dir: "in",
              amt,
              then: () => setSheet({ t: "ticket", side }),
            });
          }}
          onClose={() => {
            setSheet(null);
            refreshTrading();
          }}
          onChart={toChart}
        />
      ) : null}
      {sheet?.t === "transfer" ? (
        <TransferSheet
          dir={sheet.dir}
          {...transfers}
          amt={sheet.amt}
          onClose={() => setSheet(null)}
          onMoved={() => {
            const then = sheet.then;
            setSheet(null);
            if (then) setTimeout(then, 380);
          }}
        />
      ) : null}

      {sheetTpSl ? (
        <TpSlSheet
          position={sheetTpSl}
          mark={markOf(sheetTpSl.coin, sheetTpSl.entry)}
          label={sheetTpSl.sym}
          idToken={session.idToken}
          onClose={() => setSheet(null)}
          onSaved={refreshTrading}
        />
      ) : null}

      {sheetPos ? (
        <LivePositionSheet
          position={sheetPos}
          mark={markOf(sheetPos.coin, sheetPos.entry)}
          label={sheetPos.sym}
          onClose={() => setSheet(null)}
          onEditTpSl={() => setSheet({ t: "tpsl", id: sheetPos.id })}
          onClosePosition={() =>
            unwrap(
              tradeService.closePosition(
                { stockSymbol: sheetPos.sym },
                session.idToken ?? "",
              ),
            ).then(() => refreshTrading())
          }
          onMoveToSpot={() =>
            openTransfer({
              dir: "out",
              amt: Math.floor(bal.perp * 100) / 100,
            })
          }
        />
      ) : null}

      {sheetOrd ? (
        <LiveOrderSheet
          order={sheetOrd}
          mark={markOf(sheetOrd.coin, sheetOrd.px)}
          label={sheetOrd.sym}
          roleLabel={ROLE_LABEL[sheetOrd.role]}
          tone={orderTone(sheetOrd)}
          onClose={() => setSheet(null)}
          onCancelOrder={() => cancelOrder(sheetOrd)}
        />
      ) : null}
    </SafeAreaView>
  );
}
