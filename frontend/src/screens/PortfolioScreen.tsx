import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth, type OnboardingProfile } from "@/context";
import { useWallet } from "@/context/WalletContext";
import { useIndexFunds, useStocks } from "@/hooks";
import { useRecurringBuys } from "@/hooks/useTrade";
import { useUserTransactions } from "@/hooks/useUserRecords";
import { useCountUp } from "@/hooks/useCountUp";
import { useTransfers } from "@/hooks/useTransfers";
import { useAllPositions } from "@/hooks/perps";
import { getOnboardingProfile } from "@/lib";
import type { TabParamList } from "@/navigation/RootTabs";
import { useTabBarSpace } from "@/navigation/TabBar";
import { C, TYPE } from "@/theme";
import { Rise } from "@/components/ui";
import { useSheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { useSplashDone } from "@/components/SplashIntro";
import { TransferSheet } from "@/components/TransferSheet";
import { PerpToast } from "@/components/perps/PerpToast";
import { ShareSheet } from "@/components/ShareSheet";
import { WithdrawFlow } from "@/components/WithdrawFlow";
import {
  ActivitySheet,
  DepositFlow,
  shortAddr,
} from "@/components/folio/FolioSheets";
import { useFollowing } from "@/lib/follows";
import { dayChange } from "@/lib/format";
import { fundPositions, useFundLots } from "@/lib/fundHoldings";
import { toFund } from "@/lib/indexFunds";
import { hTap } from "@/lib/haptics";
import { ProfileHeader } from "./portfolio/ProfileHeader";
import { ValueHero } from "./portfolio/ValueHero";
import { CashCard } from "./portfolio/CashCard";
import { HoldingsSection } from "./portfolio/HoldingsSection";
import { CashMenu } from "./portfolio/CashMenu";
import { usePortfolioValue } from "./portfolio/usePortfolioValue";
import { s } from "./portfolio/styles";

type Nav = BottomTabNavigationProp<TabParamList, "Portfolio">;

export function PortfolioScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const bottom = useTabBarSpace();
  const splashDone = useSplashDone();
  const sheet = useSheet();
  const toast = useToast();
  const following = useFollowing();
  const walletBal = useWallet();
  const bal = {
    perp: walletBal.perpAvailable,
    spot: walletBal.usdc?.balance ?? 0,
  };
  const [xfer, setXfer] = useState(false);
  const [xferDir, setXferDir] = useState<"in" | "out">("in");

  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);

  const { user, idToken } = useAuth();

  const allPos = useAllPositions(idToken);
  const perpPnl = allPos.data.reduce((t, p) => t + p.pnl, 0);
  const {
    walletAddress,
    tokens,
    usdcValue,
    tokensValue,
    usdValue,
    loading,
    refreshing,
    error,
    refresh,
  } = useWallet();
  const { recurringBuys, reload: reloadRecurring } = useRecurringBuys();
  const txs = useUserTransactions(idToken ?? undefined);
  const us = useStocks("us-stock");
  const pre = useStocks("pre-ipo");
  const idx = useIndexFunds();
  const fundLots = useFundLots();

  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  useEffect(() => {
    if (user) getOnboardingProfile(user.id).then(setProfile);
  }, [user]);

  // ---------- value + chart ----------
  const value = usePortfolioValue({
    tokens,
    usdcValue,
    usdValue,
    perpTotal: walletBal.perpValue,
  });
  const cash = useCountUp(usdcValue);

  // ---------- positions ----------
  const moves = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const s of [...us.stocks, ...pre.stocks])
      m.set(s.tokenAddress, dayChange(s.price, s.marketOpenPrice));
    return m;
  }, [us.stocks, pre.stocks]);

  // refresh this screen's own cash/positions numbers once money moves
  const transfers = useTransfers(refresh);

  const positions = useMemo(
    () =>
      tokens
        .map((t) => ({
          ...t,
          value: t.balance * Number(t.price),
          change: moves.get(t.mint) ?? null,
        }))
        .sort((a, b) => b.value - a.value),
    [tokens, moves],
  );

  // Index funds: the wallet holds the stocks themselves; which of them came
  // from a fund buy is rebuilt from the on-device log (lib/fundHoldings).
  const funds = useMemo(
    () => fundPositions(fundLots, walletAddress, tokens),
    [fundLots, walletAddress, tokens],
  );
  const fundMoves = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const f of idx.funds) m.set(f.id, toFund(f).change);
    return m;
  }, [idx.funds]);

  // ---------- identity ----------
  const name = (user?.name ?? "").trim() || "You";
  const initial = name.charAt(0).toUpperCase();
  const handle = user?.email ? `@${user.email.split("@")[0]}` : "";
  const photo = (user as { photo?: string | null } | null)?.photo ?? null;
  const tradeCount = txs.data?.data?.length ?? 0;
  // "US stocks · Pre-IPOs" (what the investor profile says they own)
  const owns = profile?.owns?.length ? profile.owns.join(" · ") : null;

  // ---------- navigation ----------
  const openAsset = (symbol: string, stockType: string) =>
    nav.navigate("Home", {
      screen: "StockDetail",
      params: {
        symbol,
        category: stockType === "PreIPO" ? "pre-ipo" : "us-stock",
      },
      initial: false,
    });
  const openFund = (id: string) =>
    nav.navigate("Home", {
      screen: "IndexFundDetail",
      params: { id },
      initial: false,
    });
  const openTrade = (symbol?: string) =>
    nav.navigate("Trade", symbol ? { symbol } : undefined);

  // PerpPositionList may hand back a position or a symbol; accept both
  const openPerp = (
    arg?: string | { sym?: string; symbol?: string; coin?: string },
  ) => {
    const raw =
      typeof arg === "string" ? arg : (arg?.sym ?? arg?.symbol ?? arg?.coin);
    openTrade(raw?.includes(":") ? raw.split(":")[1] : raw);
  };
  const toAccount = () => nav.navigate("Profile");
  const toOrders = () =>
    nav.navigate("Profile", {
      screen: "RecurringBuys",
      initial: false,
    });

  // ---------- sheets ----------
  const openActivity = () =>
    sheet.open(<ActivitySheet />, { label: "Activity" });
  const openTransfer = () => {
    hTap();
    setXferDir("in");
    setXfer(true);
  };
  const openTransferOut = () => {
    // perp -> spot (used by Withdraw: "move it to spot first")
    sheet.close();
    setXferDir("out");
    setXfer(true);
  };
  const copyAddress = async () => {
    if (!walletAddress) return;
    sheet.close(); // close first: a toast fired under an open sheet stays hidden
    try {
      await Clipboard.setStringAsync(walletAddress);
      toast("Address copied", "SELF-CUSTODY WALLET");
    } catch {
      toast("Copy did not work", "SELECT IT BY HAND");
    }
  };
  const openWithdraw = () =>
    sheet.update(
      <WithdrawFlow
        spot={bal.spot}
        perp={bal.perp}
        onMoveToSpot={openTransferOut}
        onDone={() => {
          sheet.close();
          refresh();
        }}
      />,
    );

  const openShare = () =>
    sheet.open(
      <ShareSheet
        handle={handle || "@you"}
        initial={initial}
        chip={profile?.title ?? ""}
        refCode={(handle || "you").replace("@", "").toUpperCase()}
        holdings={value.holdings}
        usdcValue={usdcValue}
        positions={positions.map((p) => ({
          symbol: p.symbol,
          imageUrl: p.imageUrl,
          value: p.value,
          change: p.change,
        }))}
        perp={{ positions: allPos.data, pnl: perpPnl }}
      />,
      { label: "Share" },
    );

  const openMore = () =>
    sheet.open(
      <CashMenu
        spot={bal.spot}
        perp={bal.perp}
        address={walletAddress}
        onMove={() => {
          sheet.close();
          openTransfer();
        }}
        onWithdraw={openWithdraw}
        onCopy={copyAddress}
        onActivity={() => sheet.update(<ActivitySheet />)}
        onOrders={() => {
          sheet.close();
          toOrders();
        }}
        onAccount={() => {
          sheet.close();
          toAccount();
        }}
      />,
      { label: "More" },
    );

  const rise = (i: number) => ({
    when: splashDone,
    delay: i * 55,
    duration: 460,
  });

  return (
    <View style={s.safe}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              refresh();
              reloadRecurring();
              txs.refetch();
            }}
            tintColor={C.mint}
            colors={[C.mint]}
            progressBackgroundColor={C.raised}
            progressViewOffset={insets.top}
          />
        }
      >
        <View style={[s.page, { paddingTop: insets.top + 12 }]}>
          <ProfileHeader
            rise={rise}
            name={name}
            initial={initial}
            handle={handle}
            photo={photo}
            title={profile?.title ?? null}
            following={following.size}
            owns={owns}
            tradeCount={tradeCount}
            onAccount={toAccount}
            onShare={openShare}
            onActivity={openActivity}
          />

          <ValueHero rise={rise} value={value} loading={loading} />

          {error ? (
            <Text style={[TYPE.sub, { color: C.loss, marginTop: 10 }]}>
              {error}
            </Text>
          ) : null}

          <Rise {...rise(6)} style={s.cashRow}>
            <CashCard
              cash={cash}
              loading={loading}
              refreshing={refreshing}
              perpAvailable={bal.perp}
              perpPnl={perpPnl}
              perpCount={allPos.data.length}
              onDeposit={() =>
                sheet.open(<DepositFlow address={walletAddress} />, {
                  label: "Deposit",
                })
              }
              onMore={openMore}
              onRefresh={refresh}
              onTransfer={openTransfer}
            />
          </Rise>

          <HoldingsSection
            headerRise={rise(7)}
            positions={positions}
            tokensValue={tokensValue}
            funds={funds}
            fundMoves={fundMoves}
            recurringBuys={recurringBuys}
            perp={allPos}
            onOpenAsset={openAsset}
            onOpenFund={openFund}
            onOpenPerp={openPerp}
            onManageRecurring={toOrders}
          />

          <Text style={s.foot}>
            HELD AT {shortAddr(walletAddress).toUpperCase()} · SELF-CUSTODY
          </Text>
        </View>
      </ScrollView>

      {/* useTransfers fires its toasts through PerpToast, so it must be mounted here */}
      <PerpToast />

      {xfer ? (
        <TransferSheet
          dir={xferDir}
          {...transfers}
          onClose={() => setXfer(false)}
          onMoved={() => {
            setXfer(false);
            refresh();
          }}
        />
      ) : null}
    </View>
  );
}
