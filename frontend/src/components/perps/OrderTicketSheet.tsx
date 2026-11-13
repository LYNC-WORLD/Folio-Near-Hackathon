// src/components/perps/OrderTicketSheet.tsx — Long / Short ticket: side, order type, margin,
// leverage, liquidation preview, analyst check, TP/SL, fees, hold-to-confirm (high leverage), success card.
// Sends real orders through useOrderTicket -> backend (/api/perp-trade/*) -> Hyperliquid.
// Margin comes from the PERP account (perpBal); spot money is moved in with onTransfer.
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  AMBER,
  Body,
  Btn,
  CARD,
  Check,
  FundingCountdown,
  H2,
  HoldButton,
  Kv,
  KvCard,
  Lbl,
  LeverageSlider,
  LongShortSeg,
  Sheet,
  Tag,
  levTone,
} from "./PerpUi";
import { C, FONT } from "@/theme";
import { hTap } from "@/lib/haptics";
import { TAKER, type TpSlMode } from "@/lib/perps";
import { money, qtyFmt, sMoney, sideTxt } from "@/lib/format";
import { toast } from "./PerpToast";
import { useOrderTicket, type OrderType } from "./useOrderTicket";

function Radio({
  label,
  sub,
  on,
  onPress,
}: {
  label: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hTap();
        onPress();
      }}
      style={[s.radio, on && { borderColor: C.mint }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <View style={[s.radioDot, on && { borderColor: C.mint }]}>
        {on ? <View style={s.radioFill} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.ttl}>{label}</Text>
        <Text style={s.sub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: TpSlMode;
  onChange: (m: TpSlMode) => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {(["price", "pct"] as const).map((m) => (
        <Pressable
          key={m}
          hitSlop={{ top: 8, bottom: 8 }}
          onPress={() => {
            hTap();
            onChange(m);
          }}
          style={[
            s.chip,
            { height: 26, paddingHorizontal: 10 },
            value === m && { backgroundColor: C.mint },
          ]}
        >
          <Text style={[s.chipT, value === m && { color: C.onMint }]}>
            {m === "price" ? "$" : "%"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const clean = (t: string) => {
  const x = t.replace(/[^0-9.]/g, "");
  const i = x.indexOf(".");
  return i < 0 ? x : x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, "");
};
const num = (t: string) => parseFloat(t) || 0;

export function OrderTicketSheet({
  sym,
  initialSide,
  perpBal,
  spotBal,
  onTransfer,
  onClose,
  onChart,
}: {
  sym: string;
  initialSide: 1 | -1;
  /** free money in the perp account: this is the margin you can use */
  perpBal: number;
  /** money in the spot wallet: can be moved into the perp account */
  spotBal: number;
  /** open the transfer sheet (spot -> perp), optionally pre-filled with an amount */
  onTransfer: (amt?: number) => void;
  onClose: () => void;
  onChart: () => void;
}) {
  const t = useOrderTicket({ sym, initialSide, perpBal, spotBal });
  const {
    balLoading,
    nm,
    unit,
    mk,
    maxLev,
    usdc,
    side,
    otype,
    marginMode,
    setMarginMode,
    onlyIsolated,
    tpMode,
    setTpMode,
    slMode,
    setSlMode,
    err,
    opx,
    setOpx,
    marginT,
    setMarginT,
    lev,
    setLev,
    tpOn,
    setTpOn,
    tpT,
    setTpT,
    slT,
    setSlT,
    phase,
    result,
    mg,
    en,
    notional,
    qty,
    fee,
    liq,
    dist,
    atRisk,
    toneTxt,
    toneCol,
    fpay,
    tp,
    sl,
    canMove,
    needUp,
    bad,
    setType,
    pickSide,
    pctMargin,
    go,
    short,
    holdNeeded,
    btnLabel,
    disabled,
  } = t;

  if (phase === "busy")
    return <TicketBusy side={side} otype={otype} nm={nm} lev={lev} />;
  if (phase === "done" && result)
    return (
      <TicketDone t={t} result={result} onClose={onClose} onChart={onChart} />
    );

  // ---------------------------------------------------------------- form
  return (
    <Sheet onClose={onClose}>
      <View style={s.row}>
        <View style={s.logo}>
          <Text style={s.logoT}>
            {unit.replace(/[^A-Z0-9]/g, "").slice(0, 3)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.ttl}>{nm} perp</Text>
          <Text style={[s.mono, { color: C.ink3, letterSpacing: 0 }]}>
            {mk ? money(mk) + " mark" : "Loading price…"}
          </Text>
        </View>
        <Tag label={`UP TO ${maxLev}X`} />
      </View>

      <LongShortSeg side={side} onChange={pickSide} />

      <View style={s.row}>
        <Lbl style={{ flex: 1 }}>ORDER</Lbl>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["Market", "Limit"] as const).map((t) => (
            <Pressable
              key={t}
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => {
                hTap();
                setType(t);
              }}
              style={[
                s.otype,
                t === otype && {
                  backgroundColor: C.stroke,
                  borderColor: "transparent",
                },
              ]}
            >
              <Text style={[s.otypeT, t === otype && { color: C.ink1 }]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {otype !== "Market" ? (
        <View style={s.pxField}>
          <Text style={s.k}>{otype.toUpperCase()} PRICE</Text>
          <TextInput
            value={opx}
            onChangeText={(t) => setOpx(clean(t))}
            keyboardType="decimal-pad"
            style={s.pxIn}
            placeholderTextColor={C.ink4}
          />
          <Text style={s.k}>USD</Text>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Lbl>MARGIN MODE</Lbl>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Radio
              label="Isolated"
              sub="Risk only this margin"
              on={marginMode === "ISOLATED"}
              onPress={() => setMarginMode("ISOLATED")}
            />
          </View>
          {onlyIsolated ? null : (
            <View style={{ flex: 1 }}>
              <Radio
                label="Cross"
                sub="Uses your whole account"
                on={marginMode === "CROSS"}
                onPress={() => setMarginMode("CROSS")}
              />
            </View>
          )}
        </View>
        {onlyIsolated ? (
          <Text style={s.sub}>
            This market trades with isolated margin only.
          </Text>
        ) : marginMode === "CROSS" ? (
          <Text style={s.sub}>
            Your whole perp balance backs this trade, so liquidation is further
            away, but it can take up to all of it. Estimated as if this is your
            only cross position.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <View style={s.row}>
          <View style={{ flex: 1, gap: 8 }}>
            <Lbl>MARGIN</Lbl>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[25, 50, 75, 100].map((p) => (
                <Pressable
                  key={p}
                  hitSlop={{ top: 8, bottom: 8 }}
                  onPress={() => {
                    hTap();
                    pctMargin(p);
                  }}
                  style={s.pct}
                >
                  <Text style={s.pctT}>{p === 100 ? "Max" : p + "%"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text
              style={[
                s.mono,
                { fontSize: 13.5, color: "#E4E8EE", letterSpacing: 0 },
              ]}
            >
              {balLoading ? "…" : money(usdc)}
            </Text>
            <Text style={[s.mono, { fontSize: 8.5, color: C.ink4 }]}>
              IN PERP ACCOUNT
            </Text>
          </View>
        </View>
        <View style={s.amt}>
          <Text style={s.cur}>$</Text>
          <TextInput
            value={marginT}
            onChangeText={(t) => setMarginT(clean(t))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.ink4}
            style={s.amtIn}
          />
          <Text style={s.k}>USDC</Text>
        </View>
        <Pressable
          onPress={() => {
            hTap();
            onTransfer();
          }}
          hitSlop={{ top: 8, bottom: 8 }}
          style={s.xfer}
          accessibilityRole="button"
        >
          <Text style={s.xferT}>
            Move money from spot · {money(spotBal)} there ›
          </Text>
        </Pressable>
      </View>

      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
          <Lbl style={{ flex: 1 }}>LEVERAGE</Lbl>
          <Text style={[s.levNum, { color: levTone(lev) }]}>{lev}x</Text>
        </View>
        <LeverageSlider value={lev} onChange={setLev} max={maxLev} />
        {maxLev < 50 ? (
          <Text style={[s.mono, { letterSpacing: 0.4 }]}>
            MAX LEVERAGE IS LIMITED TO {maxLev}X
          </Text>
        ) : null}
      </View>

      <View style={s.liqBox}>
        <View style={s.row}>
          <Text style={[s.k, { flex: 1 }]}>POSITION</Text>
          <Text
            style={[
              s.mono,
              { fontSize: 12.5, color: C.ink1, letterSpacing: 0 },
            ]}
          >
            {mg > 0 ? `${money(notional)} · ${qtyFmt(qty)} ${unit}` : "—"}
          </Text>
        </View>
        <Text style={s.say}>
          {mg > 0 ? (
            <>
              If {nm} {side > 0 ? "falls" : "rises"} to{" "}
              <Text style={[s.b, { color: C.loss }]}>{money(liq)}</Text> (
              {side > 0 ? "−" : "+"}
              {dist.toFixed(1)}%), this closes and you lose{" "}
              {marginMode === "CROSS" ? "up to " : "your "}
              <Text style={s.b}>{money(atRisk)}</Text>. A{" "}
              {side > 0 ? "rise" : "fall"} of 5% makes{" "}
              <Text style={[s.b, { color: C.mint }]}>
                {money(notional * 0.05)}
              </Text>
              .
            </>
          ) : (
            "Enter how much of your USDC to put in. That is the most you can lose."
          )}
        </Text>
        <View style={s.ai}>
          <View style={[s.aiDot, { backgroundColor: toneCol }]}>
            <Svg width={12} height={12} viewBox="0 0 22 22" fill={C.onMint}>
              <Path d="M11 2.6c.6 4.1 3.7 7.2 7.8 7.8-4.1.6-7.2 3.7-7.8 7.8-.6-4.1-3.7-7.2-7.8-7.8 4.1-.6 7.2-3.7 7.8-7.8z" />
            </Svg>
          </View>
          <Text style={s.aiT}>
            <Text style={{ color: "#fff", fontFamily: FONT.sans800 }}>
              Analyst check.{" "}
            </Text>
            {toneTxt}
          </Text>
        </View>
      </View>

      <View>
        <View style={[s.row, { minHeight: 48 }]}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.ttl}>Take profit / stop loss</Text>
            <Text style={s.sub}>Close automatically at a price you pick</Text>
          </View>
          <Switch
            value={tpOn}
            onValueChange={(v) => {
              hTap();
              setTpOn(v);
            }}
            trackColor={{ false: C.stroke, true: C.mint }}
            thumbColor="#fff"
            ios_backgroundColor={C.stroke}
            accessibilityLabel="Take profit and stop loss"
          />
        </View>
        {tpOn ? (
          <View style={{ gap: 10, marginTop: 10 }}>
            <View style={s.pxField}>
              <Text style={[s.k, { color: C.mint }]}>TP</Text>
              <TextInput
                value={tpT}
                onChangeText={(t) => setTpT(clean(t))}
                keyboardType="decimal-pad"
                placeholder={tpMode === "price" ? "Price" : "% on margin"}
                placeholderTextColor={C.ink4}
                style={s.pxIn}
              />
              <ModeToggle
                value={tpMode}
                onChange={(m) => {
                  setTpMode(m);
                  setTpT("");
                }}
              />
            </View>
            {tp ? (
              <Text style={[s.mono, { color: C.mint, fontSize: 12 }]}>
                {tpMode === "pct" ? `${money(tp)} · ` : ""}
                {sMoney(side * (tp - en) * qty)}
              </Text>
            ) : null}
            <View style={s.chips}>
              {[25, 50, 100].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => {
                    hTap();
                    setTpT(
                      tpMode === "pct"
                        ? String(v)
                        : (en * (1 + (side * v) / 100 / lev)).toFixed(2),
                    );
                  }}
                  style={s.chip}
                >
                  <Text style={s.chipT}>+{v}%</Text>
                </Pressable>
              ))}
              <Text style={s.sub}>on margin</Text>
            </View>

            <View style={s.pxField}>
              <Text style={[s.k, { color: C.loss }]}>SL</Text>
              <TextInput
                value={slT}
                onChangeText={(t) => setSlT(clean(t))}
                keyboardType="decimal-pad"
                placeholder={slMode === "price" ? "Price" : "% on margin"}
                placeholderTextColor={C.ink4}
                style={s.pxIn}
              />
              <ModeToggle
                value={slMode}
                onChange={(m) => {
                  setSlMode(m);
                  setSlT("");
                }}
              />
            </View>
            {sl ? (
              <Text style={[s.mono, { color: C.loss, fontSize: 12 }]}>
                {slMode === "pct" ? `${money(sl)} · ` : ""}
                {sMoney(side * (sl - en) * qty)}
              </Text>
            ) : null}
            <View style={s.chips}>
              {[10, 25, 50].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => {
                    hTap();
                    setSlT(
                      slMode === "pct"
                        ? String(v)
                        : (en * (1 - (side * v) / 100 / lev)).toFixed(2),
                    );
                  }}
                  style={s.chip}
                >
                  <Text style={s.chipT}>−{v}%</Text>
                </Pressable>
              ))}
              <Text style={s.sub}>on margin</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View>
        <Kv k="FEE (EST.)" v={`${money(fee)} · ${(TAKER * 100).toFixed(3)}%`} />
        <Kv
          k={
            <>
              FUNDING · NEXT IN <FundingCountdown />
            </>
          }
          v={
            <Text style={[s.kvV, { color: fpay > 0 ? C.loss : C.mint }]}>
              {fpay > 0 ? "you pay " : "you get "}
              {money(Math.abs(fpay))}
            </Text>
          }
          last
        />
      </View>

      {err ? (
        <View
          style={[
            s.coach,
            {
              backgroundColor: "rgba(240,96,77,.10)",
              borderColor: "rgba(240,96,77,.4)",
            },
          ]}
        >
          <Text style={[s.coachH, { color: C.loss }]}>ORDER FAILED</Text>
          <Text style={s.coachT}>{err}</Text>
          <Text style={s.sub}>
            Nothing was placed. Tap the button below to try again.
          </Text>
        </View>
      ) : null}

      {short ? (
        <View style={s.coach}>
          <Text style={s.coachH}>
            {canMove ? "PERP ACCOUNT LOW" : "INSUFFICIENT FUNDS"}
          </Text>
          <Text style={s.coachT}>
            {canMove
              ? `Your perp account has ${money(usdc)}. Move ${money(needUp)} from your spot wallet to open this trade.`
              : `Your perp account has ${money(usdc)} and your spot wallet ${money(spotBal)}. Add ${money(needUp)} straight to your perp account to open this trade.`}
          </Text>
        </View>
      ) : bad ? (
        <View style={s.coach}>
          <Text style={s.coachH}>CHECK</Text>
          <Text style={s.coachT}>{bad}</Text>
        </View>
      ) : null}

      <HoldButton
        kind={side > 0 ? "long" : "short"}
        label={btnLabel}
        hold={holdNeeded}
        disabled={disabled}
        onBlocked={() =>
          toast("Keep holding to confirm", `A SAFETY CHECK FOR ${lev}X`)
        }
        onConfirm={() => {
          if (short) {
            if (canMove) onTransfer(needUp);
            else
              toast(
                "Add funds first",
                "DEPOSIT USDC, THEN MOVE IT TO YOUR PERP ACCOUNT",
              );
          } else go();
        }}
      />
      <Text
        style={[s.mono, { textAlign: "center", fontSize: 9, marginTop: -4 }]}
      >
        LEVERAGE CUTS BOTH WAYS · YOU CAN LOSE YOUR WHOLE MARGIN
      </Text>
    </Sheet>
  );
}

// ---------------------------------------------------------------- processing
function TicketBusy({
  side,
  otype,
  nm,
  lev,
}: {
  side: 1 | -1;
  otype: OrderType;
  nm: string;
  lev: number;
}) {
  return (
    <Sheet onClose={() => {}}>
      <View style={{ alignItems: "center", gap: 20, paddingVertical: 14 }}>
        <H2 style={{ fontSize: 19 }}>
          {otype === "Market" ? "Opening on Hyperliquid" : "Placing your order"}
        </H2>
        <ActivityIndicator color={C.mint} />
        <Text style={s.mono}>
          {sideTxt(side)} {nm.toUpperCase()} · {lev}X
        </Text>
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------- success
function TicketDone({
  t,
  result,
  onClose,
  onChart,
}: {
  t: ReturnType<typeof useOrderTicket>;
  result: { filled: boolean; entry: number | null; size: number };
  onClose: () => void;
  onChart: () => void;
}) {
  const { side, lev, mg, liq, fee, en, opx, tpOn, tp, sl, otype, nm, mk } = t;
  const isPos = result.filled;
  const isLimit = otype === "Limit";
  const entry = result.entry || en || mk || 0;
  const col = side > 0 ? C.mint : C.loss;

  const rows: [string, string][] = isPos
    ? [
        ["ENTRY", money(entry)],
        ["SIZE", money(result.size * entry) + " · " + lev + "x"],
        ["MARGIN", money(mg)],
        ["LIQUIDATION (EST.)", money(liq)],
        ["FEE (EST.)", money(fee)],
      ]
    : [
        [isLimit ? "PRICE" : "EST. PRICE", money(isLimit ? num(opx) : entry)],
        ["SIDE", sideTxt(side) + " · " + lev + "x"],
        ["MARGIN HELD", money(mg)],
      ];
  if (tpOn && tp) rows.push(["TAKE PROFIT", money(tp)]);
  if (tpOn && sl) rows.push(["STOP LOSS", money(sl)]);

  return (
    <Sheet onClose={onClose}>
      <View style={{ alignItems: "center", gap: 14, paddingTop: 6 }}>
        <Check color={col} />
        <H2 style={{ textAlign: "center" }}>
          {isPos
            ? `${side > 0 ? "Long" : "Short"} ${nm} is open`
            : `${otype} order placed`}
        </H2>
        <Body style={{ textAlign: "center", fontSize: 13 }}>
          {isPos
            ? "Your position is live on the chart, including its liquidation price."
            : isLimit
              ? `Your order will execute when ${nm} reaches ${money(num(opx))}. Your ${money(mg)} margin is reserved until then.`
              : `Your position is live on the chart, including its liquidation price.`}
        </Body>
      </View>
      <KvCard>
        {rows.map(([k, v], i) => (
          <Kv key={k} k={k} v={v} last={i === rows.length - 1} />
        ))}
      </KvCard>
      <Btn
        label="See it on the chart"
        onPress={() => {
          onClose();
          onChart();
        }}
      />
      <Btn kind="ghost" small label="Done" onPress={onClose} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.stroke,
    alignItems: "center",
    justifyContent: "center",
  },
  logoT: { fontFamily: FONT.mono400, fontSize: 10, color: C.ink2 },
  ttl: {
    fontFamily: FONT.sans800,
    fontSize: 16,
    letterSpacing: -0.3,
    color: C.ink1,
  },
  sub: { fontFamily: FONT.sans600, fontSize: 12.5, color: C.ink3 },
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
  otype: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A303A",
    justifyContent: "center",
  },
  otypeT: { fontFamily: FONT.sans800, fontSize: 13, color: C.ink3 },
  pxField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: CARD,
  },
  pxIn: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.mono400,
    fontSize: 16,
  },
  pct: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.stroke,
    justifyContent: "center",
  },
  pctT: { fontFamily: FONT.sans800, fontSize: 12.5, color: C.ink2 },
  amt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 62,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: CARD,
  },
  cur: { fontFamily: FONT.sans800, fontSize: 26, color: C.ink3 },
  amtIn: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.sans800,
    fontSize: 28,
    letterSpacing: -0.8,
  },
  xfer: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center" },
  xferT: { fontFamily: FONT.sans800, fontSize: 13.5, color: C.ink2 },
  levNum: { fontFamily: FONT.sans800, fontSize: 30, letterSpacing: -1.2 },
  liqBox: {
    gap: 10,
    padding: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#161A21",
    borderWidth: 1,
    borderColor: C.stroke,
  },
  say: {
    fontFamily: FONT.sans600,
    fontSize: 13.5,
    lineHeight: 20,
    color: C.ink1,
  },
  b: { fontFamily: FONT.sans800 },
  ai: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#232933",
  },
  aiDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  aiT: {
    flex: 1,
    fontFamily: FONT.sans600,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.ink2,
  },
  chips: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.stroke,
    justifyContent: "center",
  },
  chipT: { fontFamily: FONT.sans800, fontSize: 12.5, color: C.ink2 },
  kvV: { fontFamily: FONT.mono400, fontSize: 12.5, color: "#D6DAE0" },
  coach: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(232,163,61,.10)",
    borderWidth: 1,
    borderColor: "rgba(232,163,61,.35)",
  },
  coachH: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: AMBER,
  },
  coachT: {
    fontFamily: FONT.sans600,
    fontSize: 13,
    lineHeight: 19,
    color: C.ink1,
  },
  radio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.dotRing,
    alignItems: "center",
    justifyContent: "center",
  },
  radioFill: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: C.mint,
  },
});
