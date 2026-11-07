// Big total + delta, range picker (24h · 7d · 30d · All), and the scrubbable chart.
import { Pressable, Text, View } from "react-native";
import { C } from "@/theme";
import { Rise } from "@/components/ui";
import { PortfolioChart } from "@/components/folio/PortfolioChart";
import { money } from "@/lib/format";
import { hSelect } from "@/lib/haptics";
import { RANGES, type usePortfolioValue } from "./usePortfolioValue";
import { s } from "./styles";

type RiseProps = { when: boolean; delay: number; duration: number };

export function ValueHero({
  rise,
  value,
  loading,
}: {
  rise: (i: number) => RiseProps;
  value: ReturnType<typeof usePortfolioValue>;
  loading: boolean;
}) {
  const { range, setRange, points, setScrubIdx, shownValue, delta, deltaLabel } =
    value;
  return (
    <>
      <Rise {...rise(4)} style={s.heroRow}>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 8 }}>
          <HeroMoney value={loading ? 0 : shownValue} />
          <Text style={s.delta}>
            <Text style={{ color: delta >= 0 ? C.mint : C.loss }}>
              {delta >= 0 ? "+" : "−"}
              {money(Math.abs(delta))}
            </Text>{" "}
            <Text style={s.deltaLbl}>{deltaLabel}</Text>
          </Text>
        </View>
        <View style={s.rg} accessibilityRole="tablist">
          {RANGES.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => {
                if (r.key === range.key) return;
                hSelect();
                setRange(r);
              }}
              style={[s.rgBtn, r.key === range.key && s.rgOn]}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: r.key === range.key }}
            >
              <Text
                style={[s.rgText, r.key === range.key && { color: C.ink1 }]}
              >
                {r.key}
              </Text>
            </Pressable>
          ))}
        </View>
      </Rise>

      <Rise {...rise(5)} style={{ marginTop: 14 }}>
        <PortfolioChart
          points={points}
          onScrub={setScrubIdx}
          replayKey={range.key}
        />
        <Text style={s.chartNote}>BASED ON WHAT YOU HOLD NOW</Text>
      </Rise>
    </>
  );
}

/** $1,240<.50> — cents dimmed (prototype .heroNum .c) */
function HeroMoney({ value }: { value: number }) {
  const [d, c] = money(value).split(".");
  return (
    <Text style={s.hero} accessibilityLiveRegion="polite">
      {d}
      <Text style={{ color: "#4A515C" }}>.{c}</Text>
    </Text>
  );
}
