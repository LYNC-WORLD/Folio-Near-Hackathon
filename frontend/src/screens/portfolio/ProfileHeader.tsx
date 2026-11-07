// Avatar · name · Share / Activity / Settings, then chip · following · followers · owns · trades.
import { Image, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { C } from "@/theme";
import { Chip, IconButton, PressScale, Rise } from "@/components/ui";
import { GearIcon, HistoryIcon, ShareIcon } from "@/components/Icons";
import { hTap } from "@/lib/haptics";
import { s } from "./styles";

type RiseProps = { when: boolean; delay: number; duration: number };

export function ProfileHeader({
  rise,
  name,
  initial,
  handle,
  photo,
  title,
  following,
  owns,
  tradeCount,
  onAccount,
  onShare,
  onActivity,
}: {
  rise: (i: number) => RiseProps;
  name: string;
  initial: string;
  handle: string;
  photo: string | null;
  /** investor-profile title, once onboarding is done */
  title: string | null;
  following: number;
  /** "US stocks · Pre-IPOs" */
  owns: string | null;
  tradeCount: number;
  onAccount: () => void;
  onShare: () => void;
  onActivity: () => void;
}) {
  return (
    <>
      <Rise {...rise(0)} style={s.head}>
        <PressScale
          scaleTo={0.95}
          onPress={() => {
            hTap();
            onAccount();
          }}
          style={s.ava}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          {photo ? (
            <Image source={{ uri: photo }} style={s.avaImg} />
          ) : (
            <Text style={s.avaText}>{initial}</Text>
          )}
        </PressScale>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text style={s.name} numberOfLines={1}>
            {name}
          </Text>
          {handle ? <Text style={s.handle}>{handle}</Text> : null}
        </View>
        <View style={s.tools}>
          <IconButton label="Share your profile" onPress={onShare}>
            <ShareIcon />
          </IconButton>
          <IconButton label="Activity" onPress={onActivity}>
            <HistoryIcon />
          </IconButton>
          <IconButton label="Settings" onPress={onAccount}>
            <GearIcon />
          </IconButton>
        </View>
      </Rise>

      <Rise {...rise(1)} style={s.meta}>
        {title ? <Chip variant="mint" label={title.toUpperCase()} /> : null}
        <Text style={s.stat}>
          <Text style={s.statB}>{following}</Text> following
        </Text>
        <Text style={s.stat}>
          <Text style={s.statB}>0</Text> followers
        </Text>
        {owns ? <Meta icon="grid" text={owns} /> : null}
        <Meta
          icon="swap"
          text={`${tradeCount} ${tradeCount === 1 ? "trade" : "trades"}`}
        />
      </Rise>
      <View style={s.hr} />
    </>
  );
}

function Meta({ icon, text }: { icon: "grid" | "swap"; text: string }) {
  return (
    <View style={s.metaItem}>
      <Svg
        width={15}
        height={15}
        viewBox="0 0 20 20"
        fill="none"
        stroke={C.ink4}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === "grid" ? (
          <>
            <Rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" />
            <Rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" />
            <Rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" />
            <Rect x="11" y="11" width="5.5" height="5.5" rx="1.2" />
          </>
        ) : (
          <Path d="M4 7h11l-3-3M16 13H5l3 3" />
        )}
      </Svg>
      <Text style={s.metaText}>{text}</Text>
    </View>
  );
}
