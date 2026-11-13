// Withdraw to a crypto wallet through Intents (destination: "EXTERNAL").
// form -> (pick destination token) -> review (dry quote) -> busy (live quote + execute) -> track (status poll)
//
// Origins allowed by the API: Privy Solana USDC (spot) and Hyperliquid USDC (perp).
// destinationAsset must differ from the origin asset, so spot -> Solana USDC is not offered.
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
import { useAuth } from "@/context";
import { useIntentStatus, useIntentTokens } from "@/hooks/useIntents";
import { executeIntent, quoteIntent } from "@/services";
import type { IntentQuote, IntentToken } from "@/types/deposit";
import { HL_USDC_ASSET, findHlUsdc, findSolUsdc } from "@/lib/intentAssets";
import { CHAIN, chainName, fmtPrice, short, tint } from "@/lib/intentChains";
import { hTap } from "@/lib/haptics";
import { money } from "@/lib/format";
import { C, em, FONT } from "@/theme";
import { Body, Btn, CARD, Check, H2, Kv, KvCard, Lbl } from "./perps/PerpUi";

const MIN_USD = 20;
const POPULAR = ["USDC", "USDT", "ETH", "BTC", "SOL", "WBTC", "DAI", "BNB"];
const EVM = new Set([
  "eth",
  "base",
  "arb",
  "op",
  "pol",
  "bsc",
  "avax",
  "bera",
  "gnosis",
]);

const clean = (t: string) => {
  const x = t.replace(/[^0-9.]/g, "");
  const i = x.indexOf(".");
  return i < 0 ? x : x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, "");
};
const floor2 = (n: number) => Math.floor(n * 100) / 100;

const addrOk = (chain: string, v: string) => {
  if (EVM.has(chain)) return /^0x[0-9a-fA-F]{40}$/.test(v);
  if (chain === "sol") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
  return v.length >= 8; // other chains: the backend validates
};

// minAmountOut is in destination base units. amountOut and amountOutFormatted are the same
// figure, so their ratio gives the scale without knowing the token's decimals.
const atLeast = (q: IntentQuote) => {
  const out = Number(q.amountOut);
  const unit = out > 0 ? Number(q.amountOutFormatted) / out : 0;
  return Number((Number(q.minAmountOut) * unit).toPrecision(6));
};

const friendly = (m: string) =>
  /not set up/i.test(m)
    ? "Your perp account is not set up yet. Make a deposit into it first."
    : m;
const errMsg = (e: unknown) =>
  friendly(e instanceof Error ? e.message : "Something went wrong. Try again.");

type Src = "spot" | "perp";
type Stage = "form" | "pick" | "review" | "busy" | "track";

export function ExternalWithdraw({
  spot,
  perp,
  address,
  onBack,
  onDone,
}: {
  spot: number;
  perp: number;
  address: string; // the user's own Solana wallet, used as the refund address
  onBack: () => void;
  onDone: () => void;
}) {
  const { idToken } = useAuth();
  const { tokens, loading, error, reload } = useIntentTokens();

  const [stage, setStage] = useState<Stage>("form");
  const [src, setSrc] = useState<Src>(
    spot >= MIN_USD || perp < MIN_USD ? "spot" : "perp",
  );
  const [txt, setTxt] = useState("");
  const [dtoken, setDtoken] = useState<IntentToken | null>(null);
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<IntentQuote | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // picker state
  const [chain, setChain] = useState<string | null>(null);
  const [chainOpen, setChainOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { status } = useIntentStatus(transferId ?? undefined);

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const srcBal = src === "spot" ? spot : perp;
  const amt = parseFloat(txt) || 0;
  const over = amt > srcBal + 1e-9;
  const under = amt > 0 && amt < MIN_USD;
  const addr = to.trim();

  const originAsset = useMemo(
    () =>
      src === "spot"
        ? findSolUsdc(tokens)?.assetId
        : (findHlUsdc(tokens)?.assetId ?? HL_USDC_ASSET),
    [src, tokens],
  );

  // a destination can't equal the origin asset, so drop the pick if the source changes under it
  useEffect(() => {
    if (dtoken && dtoken.assetId === originAsset) setDtoken(null);
  }, [originAsset, dtoken]);

  const pool = useMemo(
    () =>
      tokens.filter(
        (t) =>
          t.assetId !== originAsset &&
          t.assetId !== HL_USDC_ASSET &&
          !t.symbol.includes("DEPRECATED") &&
          t.blockchain in CHAIN,
      ),
    [tokens, originAsset],
  );
  const chains = useMemo(
    () =>
      Object.keys(CHAIN)
        .map((k) => [k, pool.filter((t) => t.blockchain === k).length] as const)
        .filter(([, n]) => n > 0),
    [pool],
  );
  const list = useMemo(() => {
    if (!chain) return [];
    const q = search.trim().toLowerCase();
    const rank = (s: string) => {
      const i = POPULAR.indexOf(s);
      return i < 0 ? 99 : i;
    };
    return pool
      .filter((t) => t.blockchain === chain)
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
  }, [pool, chain, search]);

  const goodAddr = !!dtoken && addrOk(dtoken.blockchain, addr);
  const canReview =
    !!originAsset && !!dtoken && amt >= MIN_USD && !over && goodAddr && !busy;

  const base = () => ({
    originAsset: originAsset!,
    amount: String(amt),
    destination: "EXTERNAL" as const,
    destinationAsset: dtoken!.assetId,
    recipient: addr,
    // Solana origin: the user's own wallet. Hyperliquid origin: the server replaces it.
    refundTo: address,
  });

  async function review() {
    if (!canReview || !idToken) return;
    hTap();
    Keyboard.dismiss();
    setErr("");
    setBusy(true);
    try {
      const res = await quoteIntent({ ...base(), dry: true }, idToken);
      if (!alive.current) return;
      setPreview(res.data);
      setStage("review");
    } catch (e) {
      if (alive.current) setErr(errMsg(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function send() {
    if (!preview || !idToken || !originAsset || !dtoken) return;
    hTap();
    setErr("");
    setStage("busy");
    try {
      // live quote creates the transfer; reuse the slippage the dry quote suggested
      const live = await quoteIntent(
        { ...base(), dry: false, slippageBps: preview.suggestedSlippageBps },
        idToken,
      );
      const id = live.data.transferId;
      if (!id) throw new Error("No transfer id came back. Try again.");
      // the backend signs and sends the origin transfer
      await executeIntent(id, idToken);
      if (!alive.current) return;
      setTransferId(id);
      setStage("track");
    } catch (e) {
      if (!alive.current) return;
      setErr(errMsg(e));
      setPreview(null); // price may have moved: quote again
      setStage("form");
    }
  }

  // ------------------------------------------------------------ track / done
  if (stage === "track" && dtoken) {
    if (status === "SUCCESS")
      return (
        <View style={{ gap: 16 }}>
          <View style={[s.center, { gap: 14, paddingTop: 6 }]}>
            <Check />
            <H2 style={{ textAlign: "center" }}>
              {preview
                ? `≈ ${preview.amountOutFormatted} ${dtoken.symbol}`
                : "Sent"}{" "}
              is on its way
            </H2>
            <Body style={{ textAlign: "center", fontSize: 13 }}>
              Delivered to {short(addr, 6, 4)} on {chainName(dtoken.blockchain)}
              .
            </Body>
          </View>
          <Btn label="Done" onPress={onDone} />
        </View>
      );
    if (status === "REFUNDED" || status === "FAILED")
      return (
        <View style={{ gap: 16 }}>
          <View style={s.coach}>
            <Text style={s.coachH}>
              {status === "REFUNDED" ? "TRANSFER REFUNDED" : "TRANSFER FAILED"}
            </Text>
            <Text style={s.coachT}>
              {status === "REFUNDED"
                ? "The transfer did not complete and your funds were returned."
                : "The transfer failed. Your balance was not changed, or it will be returned shortly."}
            </Text>
          </View>
          <Btn label="Close" onPress={onDone} />
        </View>
      );
    return (
      <View style={s.center}>
        <H2 style={{ fontSize: 19, textAlign: "center" }}>
          Sending to {chainName(dtoken.blockchain)}
        </H2>
        <ActivityIndicator color={C.mint} size="large" />
        <Text style={s.mono}>
          {money(amt)} USDC · THIS CAN TAKE A FEW MINUTES
        </Text>
        <Btn label="Close, keep going in background" onPress={onDone} />
      </View>
    );
  }

  // ------------------------------------------------------------ busy
  if (stage === "busy")
    return (
      <View style={s.center}>
        <H2 style={{ fontSize: 19 }}>Signing in your wallet</H2>
        <ActivityIndicator color={C.mint} size="large" />
        <Text style={s.mono}>SENDING {money(amt)} USDC</Text>
        <Text style={[s.mono, { fontSize: 9, marginTop: -8 }]}>
          DON'T CLOSE THE APP
        </Text>
      </View>
    );

  // ------------------------------------------------------------ review
  if (stage === "review" && preview && dtoken)
    return (
      <View style={{ gap: 16 }}>
        <Pressable onPress={() => setStage("form")} style={s.back} hitSlop={8}>
          <Text style={s.backT}>‹ Edit</Text>
        </Pressable>
        <H2>Check and send</H2>
        <KvCard>
          <Kv k="YOU SEND" v={`${money(amt)} USDC`} />
          <Kv k="FROM" v={src === "spot" ? "Spot wallet" : "Perp account"} />
          <Kv
            k="THEY RECEIVE"
            v={`≈ ${preview.amountOutFormatted} ${dtoken.symbol}`}
          />
          <Kv k="AT LEAST" v={`${atLeast(preview)} ${dtoken.symbol}`} />
          <Kv k="NETWORK" v={chainName(dtoken.blockchain)} />
          <Kv k="TO" v={short(addr, 8, 6)} />
          <Kv
            k={src === "spot" ? "SPOT AFTER" : "PERP AFTER"}
            v={money(Math.max(0, srcBal - amt))}
            last
          />
        </KvCard>
        {err ? (
          <View style={s.coach}>
            <Text style={s.coachH}>TRANSFER FAILED</Text>
            <Text style={s.coachT}>{err}</Text>
          </View>
        ) : (
          <Text style={[s.help, { color: C.loss }]}>
            Crypto transfers cannot be reversed. Sending to the wrong address or
            network loses the funds.
          </Text>
        )}
        {src === "perp" ? (
          <Text style={s.help}>
            A flat 0.20 USDC fee applies to perp transfers. It is already in the
            amount above.
          </Text>
        ) : (
          <Text style={s.help}>
            Your wallet needs a little SOL to pay the network fee.
          </Text>
        )}
        <Btn label={`Send ${money(amt)}`} onPress={send} />
      </View>
    );

  // ------------------------------------------------------------ pick destination token
  if (stage === "pick")
    return (
      <View style={{ gap: 14 }}>
        <Pressable onPress={() => setStage("form")} style={s.back} hitSlop={8}>
          <Text style={s.backT}>‹ Back</Text>
        </Pressable>
        <H2>Send as</H2>

        {loading ? (
          <ActivityIndicator color={C.mint} />
        ) : error ? (
          <>
            <Text style={s.err}>{error}</Text>
            <Btn label="Try again" onPress={() => reload()} />
          </>
        ) : (
          <>
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
                <Text style={[s.ddVal, !chain && { color: C.ink4 }]}>
                  {chain ? chainName(chain) : "Select chain"}
                </Text>
                <Text style={s.ddCaret}>{chainOpen ? "⌃" : "⌄"}</Text>
              </Pressable>
              {chainOpen ? (
                <View style={s.ddMenu}>
                  <ScrollView
                    style={{ maxHeight: 240 }}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {chains.map(([c, n], i, a) => (
                      <Pressable
                        key={c}
                        onPress={() => {
                          hTap();
                          setChain(c);
                          setSearch("");
                          setChainOpen(false);
                        }}
                        style={[s.ddItem, i < a.length - 1 && s.hair]}
                      >
                        <Text
                          style={[s.ddItemT, chain === c && { color: C.mint }]}
                        >
                          {chainName(c)}
                        </Text>
                        <Text style={s.ddCount}>{n}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {!chainOpen ? (
              !chain ? (
                <Text style={s.help}>
                  Select the chain the receiving wallet is on.
                </Text>
              ) : (
                <>
                  <View style={[s.field, { height: 48 }]}>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={`Search ${chainName(chain)} token`}
                      placeholderTextColor={C.ink4}
                      style={[
                        s.input,
                        {
                          fontFamily: FONT.sans400,
                          fontSize: 15,
                          letterSpacing: 0,
                        },
                      ]}
                    />
                  </View>
                  <ScrollView
                    style={{ maxHeight: 280 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {list.length === 0 ? (
                      <Text style={s.help}>No match.</Text>
                    ) : (
                      list.slice(0, 80).map((t, i, a) => (
                        <Pressable
                          key={t.assetId}
                          onPress={() => {
                            hTap();
                            if (dtoken && dtoken.blockchain !== t.blockchain)
                              setTo("");
                            setDtoken(t);
                            setPreview(null);
                            setStage("form");
                          }}
                          style={[s.tokRow, i < a.length - 1 && s.hair]}
                        >
                          <View
                            style={[
                              s.avatar,
                              { backgroundColor: tint(t.symbol) },
                            ]}
                          >
                            <Text style={s.avatarT}>
                              {t.symbol.slice(0, 3)}
                            </Text>
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={s.tokT}>{t.symbol}</Text>
                            <Text style={s.tokS}>
                              {t.contractAddress
                                ? short(t.contractAddress, 6, 4)
                                : "Native coin"}
                            </Text>
                          </View>
                          <Text style={s.price}>{fmtPrice(t.price)}</Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </>
              )
            ) : null}
          </>
        )}
      </View>
    );

  // ------------------------------------------------------------ form
  const noOrigin = !loading && !originAsset;
  return (
    <View style={{ gap: 16 }}>
      <Pressable onPress={onBack} style={s.back} hitSlop={8}>
        <Text style={s.backT}>‹ Withdraw</Text>
      </Pressable>
      <H2>Send to a crypto wallet</H2>

      {/* source */}
      <View style={{ gap: 8 }}>
        <Lbl>FROM</Lbl>
        <View style={s.seg}>
          {(["spot", "perp"] as Src[]).map((k) => {
            const on = src === k;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  hTap();
                  setSrc(k);
                  setPreview(null);
                  setErr("");
                }}
                style={[s.segBtn, on && s.segOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.segT, on && { color: C.ink1 }]}>
                  {k === "spot" ? "Spot wallet" : "Perp account"}
                </Text>
                <Text style={s.segS}>{money(k === "spot" ? spot : perp)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* amount */}
      <View style={{ gap: 10 }}>
        <View style={s.row}>
          <View style={{ flex: 1, gap: 8 }}>
            <Lbl>AMOUNT</Lbl>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[25, 50, 75, 100].map((v) => (
                <Pressable
                  key={v}
                  hitSlop={{ top: 8, bottom: 8 }}
                  onPress={() => {
                    hTap();
                    setTxt(String(floor2((srcBal * v) / 100) || ""));
                    setPreview(null);
                  }}
                  style={s.pct}
                >
                  <Text style={s.pctT}>{v === 100 ? "Max" : v + "%"}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3 }}>
            <Text style={s.avail}>{money(srcBal)}</Text>
            <Text style={s.availK}>
              {src === "spot" ? "IN SPOT WALLET" : "FREE IN PERP"}
            </Text>
          </View>
        </View>
        <View style={[s.field, (over || under) && { borderColor: C.loss }]}>
          <Text style={s.cur}>$</Text>
          <TextInput
            value={txt}
            onChangeText={(t) => {
              setTxt(clean(t));
              setPreview(null);
              setErr("");
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.ink4}
            style={s.input}
          />
          <Text style={s.k}>USDC</Text>
        </View>
      </View>

      {/* destination token */}
      <View style={{ gap: 8 }}>
        <Lbl>RECEIVE AS</Lbl>
        <Pressable
          onPress={() => {
            hTap();
            Keyboard.dismiss();
            if (dtoken && !chain) setChain(dtoken.blockchain);
            setStage("pick");
          }}
          style={s.dd}
          accessibilityRole="button"
        >
          {dtoken ? (
            <View
              style={[s.avatarSm, { backgroundColor: tint(dtoken.symbol) }]}
            >
              <Text style={s.avatarT}>{dtoken.symbol.slice(0, 3)}</Text>
            </View>
          ) : null}
          <Text style={[s.ddVal, !dtoken && { color: C.ink4 }]}>
            {dtoken
              ? `${dtoken.symbol} on ${chainName(dtoken.blockchain)}`
              : "Choose chain and token"}
          </Text>
          <Text style={s.ddCaret}>›</Text>
        </Pressable>
        {src === "spot" ? (
          <Text style={s.help}>
            USDC on Solana is not offered from your spot wallet, because it is
            the same asset. Pick USDC on another chain, or another token.
          </Text>
        ) : null}
      </View>

      {/* recipient */}
      {dtoken ? (
        <View style={{ gap: 8 }}>
          <Lbl>TO ADDRESS ({chainName(dtoken.blockchain).toUpperCase()})</Lbl>
          <View
            style={[
              s.field,
              { height: 54 },
              !!addr && !goodAddr && { borderColor: C.loss },
            ]}
          >
            <TextInput
              value={to}
              onChangeText={(t) => {
                setTo(t);
                setPreview(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Paste address"
              placeholderTextColor={C.ink4}
              style={[
                s.input,
                { fontFamily: FONT.mono400, fontSize: 14, letterSpacing: 0 },
              ]}
            />
          </View>
          <Text
            style={[s.help, !!addr && { color: goodAddr ? C.mint : C.loss }]}
          >
            {!addr
              ? `Paste the ${dtoken.symbol} address on ${chainName(dtoken.blockchain)}.`
              : goodAddr
                ? "Looks like a valid address. Check the first and last characters."
                : "That is not a valid address for this chain."}
          </Text>
        </View>
      ) : null}

      {noOrigin ? (
        <Text style={s.err}>This route is not available right now.</Text>
      ) : null}
      {err ? (
        <View style={s.coach}>
          <Text style={s.coachH}>COULD NOT CONTINUE</Text>
          <Text style={s.coachT}>{err}</Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color={C.mint} /> : null}

      <Btn
        disabled={!canReview}
        label={
          over
            ? `More than you have in your ${src === "spot" ? "spot wallet" : "perp account"}`
            : under
              ? `Minimum is ${money(MIN_USD)}`
              : !dtoken
                ? "Choose what to receive"
                : "Review"
        }
        onPress={review}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center: { alignItems: "center", gap: 20, paddingVertical: 14 },
  mono: {
    fontFamily: FONT.mono400,
    fontSize: 10,
    letterSpacing: 1.6,
    color: C.ink4,
    textAlign: "center",
  },
  back: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" },
  backT: { fontFamily: FONT.sans600, fontSize: 14, color: C.ink3 },
  help: {
    fontFamily: FONT.sans600,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.ink3,
  },
  err: {
    fontFamily: FONT.sans400,
    fontSize: 12.5,
    lineHeight: 19,
    color: C.loss,
  },
  hair: { borderBottomWidth: 1, borderBottomColor: C.hair },

  seg: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1,
    gap: 3,
    padding: 12,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segOn: { borderColor: C.mint },
  segT: { fontFamily: FONT.sans700, fontSize: 14, color: C.ink3 },
  segS: { fontFamily: FONT.mono400, fontSize: 12, color: C.ink4 },

  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  pct: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.stroke,
    justifyContent: "center",
  },
  pctT: { fontFamily: FONT.sans800, fontSize: 12.5, color: C.ink2 },
  avail: { fontFamily: FONT.mono400, fontSize: 13.5, color: "#E4E8EE" },
  availK: {
    fontFamily: FONT.mono400,
    fontSize: 8.5,
    letterSpacing: 1.5,
    color: C.ink4,
  },
  k: {
    fontFamily: FONT.mono400,
    fontSize: 9,
    letterSpacing: 1.5,
    color: C.ink4,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 62,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cur: { fontFamily: FONT.sans800, fontSize: 26, color: C.ink3 },
  input: {
    flex: 1,
    height: "100%",
    color: C.ink1,
    fontFamily: FONT.sans800,
    fontSize: 28,
    letterSpacing: -0.8,
  },

  // dropdown (destination + chain)
  dd: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: CARD,
  },
  ddOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  ddVal: { flex: 1, fontFamily: FONT.sans600, fontSize: 15, color: C.ink1 },
  ddCaret: { fontFamily: FONT.sans600, fontSize: 16, color: C.ink3 },
  ddMenu: {
    backgroundColor: CARD,
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
    minHeight: 60,
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
  avatarSm: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarT: { fontFamily: FONT.sans700, fontSize: 10.5, color: C.ink1 },
  tokT: { fontFamily: FONT.sans700, fontSize: 15, color: C.ink1 },
  tokS: { fontFamily: FONT.sans400, fontSize: 12, color: C.ink3 },
  price: { fontFamily: FONT.mono400, fontSize: 13, color: C.ink2 },

  coach: {
    gap: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(240,96,77,.10)",
    borderWidth: 1,
    borderColor: "rgba(240,96,77,.4)",
  },
  coachH: {
    fontFamily: FONT.mono400,
    fontSize: 9.5,
    letterSpacing: 1.6,
    color: C.loss,
  },
  coachT: {
    fontFamily: FONT.sans600,
    fontSize: 13,
    lineHeight: 19,
    color: C.ink1,
  },
});
