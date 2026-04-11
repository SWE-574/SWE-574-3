import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../constants/colors";

export type AchievementRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Epic"
  | "Legendary";

export type AchievementIconName = keyof typeof Ionicons.glyphMap;

export interface AchievementVisualMeta {
  icon: AchievementIconName;
  color: string;
  rarity: AchievementRarity;
  howToEarn: string;
}

const META: Record<string, AchievementVisualMeta> = {
  "first-service": {
    icon: "star-outline",
    color: colors.AMBER,
    rarity: "Common",
    howToEarn: "Complete your first exchange on the platform.",
  },
  "10-offers": {
    icon: "flash-outline",
    color: colors.GREEN,
    rarity: "Uncommon",
    howToEarn: "Publish at least 10 offers for the community.",
  },
  "kindness-hero": {
    icon: "heart-outline",
    color: colors.RED,
    rarity: "Rare",
    howToEarn:
      "Collect 20 kindness recognitions from completed exchanges.",
  },
  "super-helper": {
    icon: "trending-up-outline",
    color: colors.GREEN,
    rarity: "Rare",
    howToEarn: "Reach 15 helpful recognitions from other members.",
  },
  "punctual-pro": {
    icon: "time-outline",
    color: colors.BLUE,
    rarity: "Rare",
    howToEarn: "Reach 15 punctual recognitions from completed exchanges.",
  },
  "community-voice": {
    icon: "chatbubbles-outline",
    color: colors.PURPLE,
    rarity: "Uncommon",
    howToEarn: "Write at least 10 comments in the community.",
  },
  "time-giver-bronze": {
    icon: "ribbon-outline",
    color: colors.AMBER,
    rarity: "Uncommon",
    howToEarn: "Share at least 10 hours through your completed services.",
  },
  "trusted-member": {
    icon: "person-outline",
    color: colors.GREEN,
    rarity: "Epic",
    howToEarn: "Reach 25 completed exchanges as a reliable member.",
  },
  "perfect-record": {
    icon: "shield-checkmark-outline",
    color: colors.BLUE,
    rarity: "Legendary",
    howToEarn: "Complete 10 exchanges without any negative feedback.",
  },
  "top-rated": {
    icon: "trophy-outline",
    color: colors.PURPLE,
    rarity: "Legendary",
    howToEarn: "Reach 50 total positive reputation points.",
  },
  seniority: {
    icon: "ribbon-outline",
    color: colors.BLUE,
    rarity: "Uncommon",
    howToEarn: "Complete at least 5 services as a provider or participant.",
  },
  "registered-3-months": {
    icon: "time-outline",
    color: colors.BLUE,
    rarity: "Common",
    howToEarn: "Stay active on the platform for 3 months.",
  },
  "registered-6-months": {
    icon: "time-outline",
    color: colors.BLUE,
    rarity: "Uncommon",
    howToEarn: "Stay active on the platform for 6 months.",
  },
  "registered-9-months": {
    icon: "time-outline",
    color: colors.PURPLE,
    rarity: "Rare",
    howToEarn: "Stay active on the platform for 9 months.",
  },
  "registered-1-year": {
    icon: "time-outline",
    color: colors.AMBER,
    rarity: "Epic",
    howToEarn: "Stay active on the platform for 1 year.",
  },
  "registered-2-years": {
    icon: "time-outline",
    color: colors.AMBER,
    rarity: "Legendary",
    howToEarn: "Stay active on the platform for 2 years.",
  },
  "registered-3-years": {
    icon: "time-outline",
    color: colors.PURPLE,
    rarity: "Legendary",
    howToEarn: "Stay active on the platform for 3 years.",
  },
};

const DEFAULT_META: AchievementVisualMeta = {
  icon: "ribbon-outline",
  color: colors.AMBER,
  rarity: "Common",
  howToEarn: "Keep participating in the community to unlock this achievement.",
};

export function getAchievementMeta(badgeType: string): AchievementVisualMeta {
  return META[badgeType] ?? DEFAULT_META;
}
