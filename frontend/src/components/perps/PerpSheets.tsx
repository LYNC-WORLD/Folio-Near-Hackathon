import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, SvgUri } from "react-native-svg";
import { C, FONT } from "@/theme";
import { hTap } from "@/lib/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
export const QUIZ_SEEN_KEY = "perps_quiz_completed_v1";
import {
  Body,
  Btn,
  CARD,
  Check,
  H2,
  Kv,
  KvCard,
  Lbl,
  Sheet,
  Tag,
} from "./PerpUi";
import { searchPerps, useTradablePerps } from "@/hooks/useTradablePerps";
import { MAXLEV, usMarketOpen } from "@/lib/perps";
import { money, sPct } from "@/lib/format";

const tone = (n: number) => (n >= 0 ? C.mint : C.loss);
function Logo({
  imageUrl,
  size = 42,
}: {
  sym: string;
  imageUrl?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: "#262C36",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {imageUrl ? <SvgUri uri={imageUrl} width={size} height={size} /> : null}
    </View>
  );
}

const QUIZ: { q: string; a: [string, string, boolean?][] }[] = [
  {
    q: "You put $100 into a 10x long on NVDA. NVDA falls 10%. What happens?",
    a: [
      [
        "You lose about $10",
        "That is how spot works. At 10x, a 10% fall is 100% of your margin.",
      ],
      [
        "Your $100 is gone. The position is liquidated",
        "Right. Leverage multiplies the move: 10% × 10 = 100% of your margin.",
        true,
      ],
    ],
  },
  {
    q: "What is funding?",
    a: [
      [
        "A small payment between longs and shorts, every hour",
        "Right. When more people are long, longs pay shorts, and the other way round. You see the rate before you trade.",
        true,
      ],
      [
        "A one-off fee Folio charges to open a trade",
        "Funding is paid between traders every hour, for as long as your position is open.",
      ],
    ],
  },
  {
    q: "Do you own NVDA shares when you go long on the perp?",
    a: [
      [
        "Yes, the same as buying on Spot",
        "A perp is a contract on the price. To own the shares, buy on Spot.",
      ],
      [
        "No. It is a contract on the price",
        "Right. You never hold the stock, so there are no dividends or votes.",
        true,
      ],
    ],
  },
];
export function UnlockSheet({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ok, setOk] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [checkingSeen, setCheckingSeen] = useState(true);

  // One-time check: if the person already passed the quiz on a previous
  // visit, skip the disclaimer + questions and go straight to "unlocked".
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(QUIZ_SEEN_KEY)
      .then((seen) => {
        if (!alive) return;
        if (seen === "1") {
          // Returning user: skip the quiz AND the "unlocked" screen.
          // Keep checkingSeen = true so this sheet renders nothing,
          // and hand control straight back to the parent.
          onDone();
          return;
        }
        setCheckingSeen(false);
      })
      .catch(() => {
        // if storage read fails, fall back to showing the quiz
        if (alive) setCheckingSeen(false);
      });
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line

  const Dots = () => (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            height: 3,
            flex: 1,
            borderRadius: 999,
            backgroundColor: i <= step ? C.mint : "#2A303A",
          }}
        />
      ))}
    </View>
  );

  // Don't mount Sheet until we know which content to show. Mounting it with a
  // small spinner first leaves it sized for the spinner, so the quiz overflows
  // the bottom of the screen.
  if (checkingSeen) return null;

  if (step === 0)
    return (
      <Sheet onClose={onClose}>
        <Dots />
        <View style={{ gap: 8 }}>
          <Lbl>PERPS · ONE-TIME CHECK</Lbl>
          <H2>Before your first leveraged trade</H2>
        </View>
        <Body style={{ marginTop: -6 }}>
          A perp lets you trade a price going up (long) or down (short) with
          more than you put in. Gains grow faster, and so do losses. Three quick
          questions, then you are in.
        </Body>
        <Pressable
          onPress={() => {
            hTap();
            setOk(!ok);
          }}
          style={[s.rowC, { gap: 12, minHeight: 56 }]}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ok }}
        >
          <View
            style={[s.chk, ok && { backgroundColor: C.mint, borderWidth: 0 }]}
          >
            {ok ? (
              <Svg
                width={14}
                height={14}
                viewBox="0 0 16 16"
                fill="none"
                stroke="#06120D"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="m3.5 8.5 3 3 6-7" />
              </Svg>
            ) : null}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontFamily: FONT.sans600,
                fontSize: 14,
                lineHeight: 20,
                color: C.ink1,
              }}
            >
              I am not a US person, and perps are allowed where I live
            </Text>
            <Text style={s.sub}>
              Not offered in [RESTRICTED REGIONS AT LAUNCH]
            </Text>
          </View>
        </Pressable>
        <Btn disabled={!ok} label="Start" onPress={() => setStep(1)} />
      </Sheet>
    );
  if (step <= 3) {
    const Q = QUIZ[step - 1],
      sel = pick != null ? Q.a[pick] : null;
    return (
      <Sheet onClose={onClose}>
        <Dots />
        <View style={{ gap: 8 }}>
          <Lbl>QUESTION {step} OF 3</Lbl>
          <H2 style={{ fontSize: 21, lineHeight: 26 }}>{Q.q}</H2>
        </View>
        <View style={{ gap: 10 }}>
          {Q.a.map((x, i) => {
            const right = pick === i && x[2],
              wrong = pick === i && !x[2];
            return (
              <Pressable
                key={i}
                onPress={() => {
                  hTap();
                  setPick(i);
                }}
                style={[
                  s.qOpt,
                  right && {
                    borderColor: C.mint,
                    backgroundColor: "rgba(55,224,153,.08)",
                  },
                  wrong && {
                    borderColor: C.loss,
                    backgroundColor: "rgba(240,96,77,.08)",
                  },
                ]}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: FONT.sans600,
                    fontSize: 14,
                    lineHeight: 20,
                    color: C.ink1,
                  }}
                >
                  {x[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {sel ? (
          <Text style={s.qNote}>
            {sel[1]}
            {sel[2] ? "" : " Try the other answer."}
          </Text>
        ) : null}
        {sel?.[2] ? (
          <Btn
            label={step < 3 ? "Next question" : "Finish"}
            onPress={() => {
              setPick(null);
              if (step < 3) setStep(step + 1);
              else {
                AsyncStorage.setItem(QUIZ_SEEN_KEY, "1").catch(() => {});
                setStep(4);
              }
            }}
          />
        ) : null}
      </Sheet>
    );
  }
  return (
    <Sheet onClose={onClose}>
      <View style={{ alignItems: "center", gap: 14, paddingTop: 6 }}>
        <Check />
        <H2 style={{ textAlign: "center" }}>Perps are unlocked</H2>
        <Body style={{ textAlign: "center", fontSize: 13 }}>
          You can trade up to {MAXLEV}x. From 25x up you hold the button to
          confirm, so a big bet never happens by accident.
        </Body>
      </View>
      <Btn label="Continue to your trade" onPress={onDone} />
    </Sheet>
  );
}

// =============================================================== market picker
export function MarketPickerSheet({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (sym: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const { markets, loading, error, refetch } = useTradablePerps();

  const list = useMemo(() => searchPerps(markets, q), [markets, q]);

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: 6 }}>
        <Lbl>PERP MARKETS</Lbl>
        <H2>Long or short any of {markets.length}</H2>
      </View>

      <View style={s.search}>
        <Svg
          width={18}
          height={18}
          viewBox="0 0 20 20"
          fill="none"
          stroke={C.ink3}
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <Path d="M14.2 8.8a5.4 5.4 0 1 1-10.8 0 5.4 5.4 0 0 1 10.8 0Z" />
          <Path d="m12.8 12.8 3.7 3.7" />
        </Svg>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="NVDA, Tesla, Apple…"
          placeholderTextColor={C.ink4}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={s.searchIn}
        />
      </View>

      <View style={{ marginTop: -6 }}>
        {loading ? (
          <ActivityIndicator color={C.mint} style={{ paddingVertical: 14 }} />
        ) : error ? (
          <Pressable onPress={() => refetch()}>
            <Text style={[s.sub, { paddingVertical: 14, fontSize: 13.5 }]}>
              Couldn't load markets. Tap to retry.
            </Text>
          </Pressable>
        ) : list.length ? (
          list.map((m, i) => (
            <Pressable
              key={m.symbol}
              onPress={() => {
                hTap();
                onPick(m.symbol);
              }}
              style={[
                s.mRow,
                i < list.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: C.hair,
                },
              ]}
            >
              <Logo sym={m.symbol} imageUrl={m.imageUrl} size={38} />
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <View style={[s.rowC, { gap: 7 }]}>
                  <Text
                    style={{
                      fontFamily: FONT.sans800,
                      fontSize: 15,
                      color: C.ink1,
                    }}
                  >
                    {m.symbol}
                  </Text>
                  {m.symbol === current ? <Tag label="VIEWING" /> : null}
                </View>
                <Text style={s.sub} numberOfLines={1}>
                  {m.name} · up to {m.maxLev}x
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text
                  style={{
                    fontFamily: FONT.mono400,
                    fontSize: 13,
                    color: C.ink1,
                  }}
                >
                  {money(m.mark)}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT.mono400,
                    fontSize: 11.5,
                    color: tone(m.change),
                  }}
                >
                  {sPct(m.change)}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={[s.sub, { paddingVertical: 14, fontSize: 13.5 }]}>
            No stock found for that.
          </Text>
        )}
      </View>
    </Sheet>
  );
}

// =============================================================== market status
export function MarketStatusSheet({
  sym,
  onClose,
}: {
  sym: string;
  onClose: () => void;
}) {
  const open = usMarketOpen(),
    what = "US stock";
  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: 8 }}>
        <Lbl>{open ? "MARKET OPEN" : "MARKET CLOSED"}</Lbl>
        <H2>
          {open ? "The perp tracks the live price" : "The perp keeps trading"}
        </H2>
      </View>
      <Body>
        {open
          ? `While the ${what} market is open, the mark price follows the live price from the oracle. Funding keeps the perp close to it.`
          : `The ${what} market is closed, but ${sym} perps trade around the clock. The price moves on what traders do now and snaps back toward the real price when the market reopens. Gaps at the open can be large, so keep leverage in check over weekends.`}
      </Body>
      <KvCard>
        <Kv k="US MARKET HOURS" v="9:30–16:00 ET · MON–FRI" />
        <Kv k="PERP HOURS" v="24/7" />
        <Kv k="PRICE SOURCE" v="[ORACLE AT LAUNCH]" last />
      </KvCard>
      <Btn kind="quiet" small label="Got it" onPress={onClose} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  rowC: { flexDirection: "row", alignItems: "center", gap: 10 },
  mono: {
    fontFamily: FONT.mono400,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.ink4,
  },
  k: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: C.ink4,
  },
  sub: { fontFamily: FONT.sans600, fontSize: 12.5, color: C.ink3 },
  kvV: { fontFamily: FONT.mono400, fontSize: 12.5, color: "#D6DAE0" },
  chip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A303A",
    justifyContent: "center",
  },
  chipT: { fontFamily: FONT.sans800, fontSize: 12.5, color: C.ink3 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  liqBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#161A21",
    borderWidth: 1,
    borderColor: "#262C36",
  },
  say: {
    fontFamily: FONT.sans600,
    fontSize: 13.5,
    lineHeight: 20,
    color: C.ink1,
  },
  b: { fontFamily: FONT.sans800 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: CARD,
  },
  fieldIn: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.mono400,
    fontSize: 16,
  },
  pnl: {
    borderRadius: 22,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: "#2A303A",
    overflow: "hidden",
  },
  roe: {
    fontFamily: FONT.sans800,
    fontSize: 52,
    letterSpacing: -2.6,
    lineHeight: 54,
    fontVariant: ["tabular-nums"],
  },
  chk: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#3A404A",
    alignItems: "center",
    justifyContent: "center",
  },
  qOpt: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "transparent",
    justifyContent: "center",
  },
  qNote: {
    fontFamily: FONT.sans600,
    fontSize: 13,
    lineHeight: 20,
    color: C.ink2,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: CARD,
  },
  searchIn: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.sans600,
    fontSize: 15,
  },
  mRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12 },
});
