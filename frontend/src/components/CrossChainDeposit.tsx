import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/context";
import { useWallet } from "@/context/WalletContext";
import { useIntentStatus, useIntentTokens } from "@/hooks/useIntents";
import { quoteIntent } from "@/services";
import type {
  IntentDestination,
  IntentQuote,
  IntentStatus,
  IntentToken,
} from "@/types/deposit";
import { C, FONT, TYPE, em } from "@/theme";
import { hTap } from "@/lib/haptics";
import { useSheet } from "@/components/Sheet";
import { Button } from "@/components/ui/Button";
import { PressScale } from "@/components/ui/PressScale";
import { Step } from "@/components/trade/SheetParts";

const CHAIN: Record<string, string> = {
  sol: "Solana",
  eth: "Ethereum",
  base: "Base",
  arb: "Arbitrum",
  op: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  avax: "Avalanche",
  btc: "Bitcoin",
  near: "NEAR",
  ton: "TON",
  tron: "Tron",
  xrp: "XRP Ledger",
  doge: "Dogecoin",
  ltc: "Litecoin",
  sui: "Sui",
  aptos: "Aptos",
  cardano: "Cardano",
  bera: "Berachain",
  gnosis: "Gnosis",
};
const chainName = (b: string) => CHAIN[b] ?? b.toUpperCase();

const DEST: Record<
  IntentDestination,
  { title: string; sub: string; where: string }
> = {
  SOLANA: {
    title: "Spot wallet",
    sub: "USDC on Solana",
    where: "your Folio wallet",
  },
  HYPERLIQUID: {
    title: "Perp account",
    sub: "USDC on Hyperliquid",
    where: "your perp account",
  },
};

const STATUS_TXT: Record<IntentStatus, string> = {
  PENDING_DEPOSIT: "Waiting for your transfer",
  KNOWN_DEPOSIT_TX: "Transfer seen, confirming",
  PROCESSING: "Swapping to USDC",
  SUCCESS: "USDC has arrived",
  INCOMPLETE_DEPOSIT: "You sent less than the quoted amount",
  REFUNDED: "Refunded to your address",
  FAILED: "The swap failed",
};

const POPULAR = ["USDC", "USDT", "ETH", "BTC", "SOL", "WBTC", "DAI", "BNB"];
const MIN_USD = 20;

// 152 (bps) -> "1.52%"
const fmtBps = (bps?: number | null) =>
  typeof bps === "number" && bps > 0
    ? `${Number((bps / 100).toFixed(2))}%`
    : "—";

const clean = (t: string) => {
  const x = t.replace(/[^0-9.]/g, "");
  const i = x.indexOf(".");
  return i < 0 ? x : x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, "");
};
const short = (a: string, head = 6, tail = 4) =>
  a.length > head + tail + 3 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;
const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Try again.";

const fmtPrice = (p: number) => {
  if (!(p > 0)) return "—";
  const d = p >= 1 ? 2 : p >= 0.01 ? 4 : 6;
  return (
    "$" +
    p.toLocaleString("en-US", {
      minimumFractionDigits: p >= 1 ? 2 : 0,
      maximumFractionDigits: d,
    })
  );
};
const fmtQty = (n: number) =>
  n >= 1 ? n.toFixed(2) : String(Number(n.toPrecision(2)));

// Solana USDC to the Solana spot wallet is just the user's own wallet ("Crypto" option).
// To Hyperliquid it is a real route, so it stays in the list then.
const isSolUsdc = (t: IntentToken) =>
  t.blockchain === "sol" && t.symbol === "USDC";

const tint = (sym: string) => {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 360;
  return `hsl(${h}, 40%, 26%)`;
};

type Stage = "token" | "amount" | "send";

export function CrossChainDeposit({
  back,
  copy,
}: {
  back: React.ReactNode;
  copy: (text: string, title: string) => void | Promise<void>;
}) {
  const sheet = useSheet();
  const { idToken } = useAuth();
  const { refresh } = useWallet();
  const { tokens, loading, error, reload } = useIntentTokens();

  const [stage, setStage] = useState<Stage>("token");
  const [chain, setChain] = useState<string | null>(null); // nothing selected at first
  const [chainOpen, setChainOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState<IntentToken | null>(null);
  const [dest, setDest] = useState<IntentDestination>("SOLANA");
  const [amount, setAmount] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [preview, setPreview] = useState<IntentQuote | null>(null);
  const [live, setLive] = useState<IntentQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const { status } = useIntentStatus(live?.depositId);
  const shown: IntentStatus | null = status ?? live?.status ?? null;

  // refresh balances once when the swap lands
  const refreshed = useRef(false);
  useEffect(() => {
    if (shown === "SUCCESS" && !refreshed.current) {
      refreshed.current = true;
      refresh();
    }
  }, [shown, refresh]);

  // only chains from CHAIN that actually have tokens, in CHAIN's order
  const chains = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tokens) {
      if (isSolUsdc(t) || t.symbol.includes("DEPRECATED")) continue;
      if (!(t.blockchain in CHAIN)) continue;
      m.set(t.blockchain, (m.get(t.blockchain) ?? 0) + 1);
    }
    return Object.keys(CHAIN)
      .filter((k) => m.has(k))
      .map((k) => [k, m.get(k)!] as const); // [key, count][]
  }, [tokens]);

  const list = useMemo(() => {
    if (!chain) return [];
    const q = search.trim().toLowerCase();
    const rank = (sym: string) => {
      const i = POPULAR.indexOf(sym);
      return i < 0 ? 99 : i;
    };
    return tokens
      .filter(
        (t) =>
          !isSolUsdc(t) &&
          !t.symbol.includes("DEPRECATED") &&
          t.blockchain === chain,
      )
      .filter(
        (t) =>
          !q ||
          t.symbol.toLowerCase().includes(q) ||
          (t.contractAddress ?? "").toLowerCase().startsWith(q),
      )
      .sort(
        (a, b) =>
          rank(a.symbol) - rank(b.symbol) || a.symbol.localeCompare(b.symbol),
      );
  }, [tokens, search, chain]);

  const n = parseFloat(amount) || 0;
  const usd = token && token.price > 0 ? n * token.price : 0;
  const minQty = token && token.price > 0 ? MIN_USD / token.price : 0;
  const canQuote = !!token && n > 0 && refundTo.trim().length >= 8;

  // slippage the live deposit was created with (falls back to the suggestion)
  const appliedBps = live?.slippageBps ?? live?.suggestedSlippageBps;

  async function getPreview() {
    if (!token || !idToken) return;
    hTap();
    Keyboard.dismiss();
    setErr("");
    setBusy(true);
    try {
      const res = await quoteIntent(
        {
          originAsset: token.assetId,
          amount,
          destination: dest,
          refundTo: refundTo.trim(),
          dry: true,
        },
        idToken,
      );
      setPreview(res.data);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // creates the deposit, so call it only when the user confirms
  async function confirm() {
    if (!token || !idToken || !preview) return;
    hTap();
    setErr("");
    setBusy(true);
    try {
      const res = await quoteIntent(
        {
          originAsset: token.assetId,
          amount,
          destination: dest,
          refundTo: refundTo.trim(),
          dry: false,
          // use the slippage the first quote suggested
          slippageBps: preview.suggestedSlippageBps,
        },
        idToken,
      );
      if (!res.data.depositId || !res.data.depositAddress)
        throw new Error("No deposit address came back. Try again.");
      refreshed.current = false;
      setLive(res.data);
      setStage("send");
    } catch (e) {
      setPreview(null);
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ send / status

  if (stage === "send" && live && token) {
    const terminal =
      shown === "SUCCESS" ||
      shown === "REFUNDED" ||
      shown === "FAILED" ||
      shown === "INCOMPLETE_DEPOSIT";

    const bad =
      shown === "REFUNDED" ||
      shown === "FAILED" ||
      shown === "INCOMPLETE_DEPOSIT";

    return (
      <Step id="xchain-send">
        <Text style={TYPE.h2}>
          {shown === "SUCCESS" ? "Deposit complete" : `Send ${token.symbol}`}
        </Text>

        <View style={s.pill}>
          {!terminal ? <ActivityIndicator color={C.mint} size="small" /> : null}
          <Text style={[s.pillT, bad && { color: C.loss }]}>
            {STATUS_TXT[shown ?? "PENDING_DEPOSIT"]}
          </Text>
        </View>

        {shown === "SUCCESS" ? (
          <Text style={TYPE.body}>
            About {live.amountOutFormatted} USDC landed in {DEST[dest].where}.
          </Text>
        ) : bad ? (
          <Text style={s.warn}>
            {shown === "INCOMPLETE_DEPOSIT"
              ? "You sent less than the quoted amount, so the swap did not run. Your funds are returned to "
              : "Your funds go back to "}
            {short(live.refundTo ?? refundTo, 8, 6)} on{" "}
            {chainName(token.blockchain)}. It can take a few minutes.
          </Text>
        ) : (
          <>
            <Text style={[TYPE.body, { fontSize: 13, marginTop: -6 }]}>
              Send exactly this amount from your own wallet. You pay the network
              fee on {chainName(token.blockchain)}.
            </Text>

            {/* Compact QR + amount section */}
            <View style={s.sendSummary}>
              {!live.depositMemo ? (
                <View style={s.qrCompact}>
                  <QRCode
                    value={live.depositAddress!}
                    size={112}
                    color="#0A0B0E"
                    backgroundColor="#FFFFFF"
                    ecl="M"
                  />
                </View>
              ) : null}

              <View style={{ flex: 1, gap: 5 }}>
                <Text style={s.lbl}>SEND EXACTLY</Text>

                <Text style={s.sendAmount}>
                  {live.amount} {token.symbol}
                </Text>

                <Text style={s.help}>{chainName(token.blockchain)}</Text>

                <View style={{ gap: 2, marginTop: 5 }}>
                  <Text style={s.lbl}>YOU RECEIVE</Text>
                  <Text style={[s.val, { color: C.mint }]}>
                    ≈ {live.amountOutFormatted} USDC
                  </Text>
                </View>
              </View>
            </View>

            {/* Deposit details */}
            <View style={s.card}>
              <Row
                k="TO ADDRESS"
                v={live.depositAddress!}
                mono
                onCopy={() => copy(live.depositAddress!, "Address copied")}
              />

              {live.depositMemo ? (
                <Row
                  k="MEMO (REQUIRED)"
                  v={live.depositMemo}
                  mono
                  onCopy={() => copy(live.depositMemo!, "Memo copied")}
                />
              ) : null}

              <Row
                k="AT LEAST"
                v={`${(Number(live.minAmountOut) / 1e6).toFixed(2)} USDC`}
              />

              <Row k="SLIPPAGE" v={fmtBps(appliedBps)} />

              <Row k="ARRIVES IN" v={DEST[dest].title} last />
            </View>

            {/* Memo warning */}
            {live.depositMemo ? (
              <Text style={s.warn}>
                Include the memo or the transfer cannot be matched.
              </Text>
            ) : null}

            {/* Deadline and refund information */}
            <Text style={s.help}>
              Send before {new Date(live.deadline).toLocaleTimeString()}.
              Sending less than the quoted amount triggers a refund. Closing
              this sheet does not cancel the deposit.
            </Text>
          </>
        )}

        <Button
          title={terminal ? "Done" : "Close"}
          variant={terminal ? undefined : "quiet"}
          onPress={() => sheet.close()}
        />
      </Step>
    );
  }

  // ------------------------------------------------------------ amount
  if (stage === "amount" && token) {
    return (
      <Step id="xchain-amount">
        <PressScale
          scaleTo={0.985}
          onPress={() => {
            setPreview(null);
            setErr("");
            setStage("token");
          }}
          style={s.link}
          accessibilityRole="button"
        >
          <Text style={s.linkT}>‹ Change token</Text>
        </PressScale>

        <View style={s.hero}>
          <View style={[s.avatar, { backgroundColor: tint(token.symbol) }]}>
            <Text style={s.avatarT}>{token.symbol.slice(0, 3)}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={TYPE.h2}>{token.symbol}</Text>
            <Text style={TYPE.sub}>
              {chainName(token.blockchain)} · {fmtPrice(token.price)}
            </Text>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.lbl}>DEPOSIT INTO</Text>
          <View style={s.seg}>
            {(["SOLANA", "HYPERLIQUID"] as IntentDestination[]).map((d) => {
              const on = dest === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    hTap();
                    setDest(d);
                    setPreview(null);
                  }}
                  style={[s.segBtn, on && s.segOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segT, on && { color: C.ink1 }]}>
                    {DEST[d].title}
                  </Text>
                  <Text style={s.segS}>{DEST[d].sub}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.lbl}>AMOUNT ({token.symbol})</Text>
          <TextInput
            style={s.input}
            value={amount}
            onChangeText={(t) => {
              setAmount(clean(t));
              setPreview(null);
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.ink4}
          />
          <Text style={s.help}>
            {usd > 0 ? `≈ $${usd.toFixed(2)} · ` : ""}
            {minQty > 0
              ? `Minimum about ${fmtQty(minQty)} ${token.symbol} ($${MIN_USD})`
              : `Minimum about $${MIN_USD}`}
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.lbl}>
            YOUR {chainName(token.blockchain).toUpperCase()} ADDRESS (FOR
            REFUNDS)
          </Text>
          <TextInput
            style={[s.input, { fontFamily: FONT.mono400, fontSize: 13 }]}
            value={refundTo}
            onChangeText={(t) => {
              setRefundTo(t.trim());
              setPreview(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder="Paste the address you will send from"
            placeholderTextColor={C.ink4}
          />
          <Text style={s.help}>
            If anything goes wrong, funds return here. Use an address on{" "}
            {chainName(token.blockchain)} that you control.
          </Text>
        </View>

        {preview ? (
          <View style={s.card}>
            <Row k="YOU SEND" v={`${preview.amount} ${token.symbol}`} />
            <Row k="YOU GET" v={`≈ ${preview.amountOutFormatted} USDC`} />
            <Row
              k="AT LEAST"
              v={`${(Number(preview.minAmountOut) / 1e6).toFixed(2)} USDC`}
            />
            <Row
              k="SUGGESTED SLIPPAGE"
              v={fmtBps(preview.suggestedSlippageBps)}
            />
            <Row k="ARRIVES IN" v={DEST[dest].title} last />
          </View>
        ) : null}
        {preview ? (
          <Text style={s.help}>
            We will use this slippage when creating your deposit. The minimum
            you receive is shown on the next screen.
          </Text>
        ) : null}

        {err ? <Text style={s.err}>{err}</Text> : null}
        {busy ? <ActivityIndicator color={C.mint} /> : null}

        {preview ? (
          <Button
            title="Get deposit address"
            onPress={confirm}
            disabled={busy}
          />
        ) : (
          <Button
            title="Get quote"
            onPress={getPreview}
            disabled={!canQuote || busy}
          />
        )}
      </Step>
    );
  }

  // ------------------------------------------------------------ token (chain dropdown + assets)
  return (
    <Step id="xchain-token">
      {back}
      <Text style={TYPE.h2}>Deposit from another chain</Text>
      <Text style={[TYPE.body, { fontSize: 13.5, marginTop: -6 }]}>
        Pick a chain, then the token you will send. It arrives as USDC.
      </Text>

      {loading ? (
        <ActivityIndicator color={C.mint} />
      ) : error ? (
        <>
          <Text style={s.err}>{error}</Text>
          <Button title="Try again" onPress={() => reload()} />
        </>
      ) : (
        <>
          {/* chain dropdown */}
          <View>
            <Pressable
              onPress={() => {
                hTap();
                Keyboard.dismiss();
                setChainOpen((o) => !o);
              }}
              style={[s.dd, chainOpen && s.ddOpen]}
              accessibilityRole="button"
              accessibilityState={{ expanded: chainOpen }}
            >
              {chain ? (
                <View style={[s.ddDot, { backgroundColor: tint(chain) }]}>
                  <Text style={s.ddDotT}>
                    {chain.slice(0, 3).toUpperCase()}
                  </Text>
                </View>
              ) : null}
              <Text style={[s.ddVal, !chain && { color: C.ink4 }]}>
                {chain ? chainName(chain) : "Select chain"}
              </Text>
              <Text style={s.ddCaret}>{chainOpen ? "⌃" : "⌄"}</Text>
            </Pressable>

            {chainOpen ? (
              <View style={s.ddMenu}>
                <ScrollView
                  style={{ maxHeight: 280 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {chains.map(([c, count], i, a) => {
                    const on = chain === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => {
                          hTap();
                          setChain(c);
                          setSearch("");
                          setChainOpen(false);
                        }}
                        style={[s.ddItem, i < a.length - 1 && s.hair]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                      >
                        <View style={[s.ddDot, { backgroundColor: tint(c) }]}>
                          <Text style={s.ddDotT}>
                            {c.slice(0, 3).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[s.ddItemT, on && { color: C.mint }]}>
                          {chainName(c)}
                        </Text>
                        <Text style={s.ddCount}>{count}</Text>
                        {on ? <Text style={{ color: C.mint }}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>

          {/* assets (hidden while the dropdown is open, so the sheet stays short) */}
          {!chainOpen ? (
            !chain ? (
              <Text style={TYPE.sub}>Select a chain to see its tokens.</Text>
            ) : (
              <>
                <TextInput
                  style={s.input}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={`Search ${chainName(chain)} token or contract`}
                  placeholderTextColor={C.ink4}
                />
                <Text style={s.lbl}>
                  {list.length} {list.length === 1 ? "TOKEN" : "TOKENS"}
                </Text>
                <ScrollView
                  style={{ maxHeight: 300 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {list.length === 0 ? (
                    <Text style={TYPE.sub}>No match.</Text>
                  ) : (
                    list.slice(0, 80).map((t, i, a) => (
                      <PressScale
                        key={t.assetId}
                        scaleTo={0.985}
                        onPress={() => {
                          hTap();
                          setToken(t);
                          setAmount("");
                          setRefundTo("");
                          setPreview(null);
                          setErr("");
                          setStage("amount");
                        }}
                        style={[s.tokRow, i < a.length - 1 && s.hair]}
                        accessibilityRole="button"
                      >
                        <View
                          style={[
                            s.avatar,
                            { backgroundColor: tint(t.symbol) },
                          ]}
                        >
                          <Text style={s.avatarT}>{t.symbol.slice(0, 3)}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={TYPE.ttl}>{t.symbol}</Text>
                          <Text style={TYPE.sub}>
                            {t.contractAddress
                              ? short(t.contractAddress, 6, 4)
                              : "Native coin"}
                          </Text>
                        </View>
                        <Text style={s.price}>{fmtPrice(t.price)}</Text>
                      </PressScale>
                    ))
                  )}
                </ScrollView>
              </>
            )
          ) : null}
        </>
      )}
    </Step>
  );
}

function Row({
  k,
  v,
  mono,
  last,
  onCopy,
}: {
  k: string;
  v: string;
  mono?: boolean;
  last?: boolean;
  onCopy?: () => void;
}) {
  return (
    <View style={[s.row, !last && s.hair]}>
      <Text style={s.lbl}>{k}</Text>
      <Text
        style={[s.val, mono && { fontFamily: FONT.mono400, fontSize: 12.5 }]}
        selectable
      >
        {v}
      </Text>
      {onCopy ? (
        <PressScale
          scaleTo={0.96}
          onPress={onCopy}
          style={s.copy}
          accessibilityRole="button"
        >
          <Text style={s.linkT}>Copy</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },
  lbl: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: em(9.5, 0.16),
    color: C.ink4,
  },
  val: { fontFamily: FONT.sans400, fontSize: 14, color: C.ink1 },
  input: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    color: C.ink1,
    fontFamily: FONT.sans400,
    fontSize: 15,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: { gap: 6, paddingVertical: 12 },
  copy: { alignSelf: "flex-start", minHeight: 28, justifyContent: "center" },

  // chain dropdown
  dd: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  sendSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },

  qrCompact: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },

  sendAmount: {
    fontFamily: FONT.sans700,
    fontSize: 21,
    color: C.ink1,
  },
  ddOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  ddVal: { flex: 1, fontFamily: FONT.sans600, fontSize: 15, color: C.ink1 },
  ddCaret: { fontFamily: FONT.sans600, fontSize: 16, color: C.ink3 },
  ddDot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  ddDotT: { fontFamily: FONT.sans700, fontSize: 9, color: C.ink1 },
  ddMenu: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.hair,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
  },
  ddItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  ddItemT: { flex: 1, fontFamily: FONT.sans600, fontSize: 14, color: C.ink2 },
  ddCount: { fontFamily: FONT.mono400, fontSize: 11.5, color: C.ink4 },

  // token list
  tokRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarT: { fontFamily: FONT.sans700, fontSize: 11.5, color: C.ink1 },
  price: {
    fontFamily: FONT.mono400,
    fontSize: 13,
    color: C.ink2,
    fontVariant: ["tabular-nums"],
  },

  // amount screen
  hero: { flexDirection: "row", alignItems: "center", gap: 12 },
  seg: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1,
    gap: 3,
    padding: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segOn: { borderColor: C.mint },
  segT: { fontFamily: FONT.sans700, fontSize: 14, color: C.ink3 },
  segS: { fontFamily: FONT.sans400, fontSize: 11.5, color: C.ink4 },

  link: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  linkT: { fontFamily: FONT.sans600, fontSize: 13, color: C.mint },
  qr: {
    alignSelf: "center",
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surface,
  },
  pillT: { fontFamily: FONT.sans600, fontSize: 13, color: C.ink1 },
  help: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.ink3,
  },
  warn: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
  err: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
});
