import type { IconType } from 'react-icons'
import {
  FiAward,
  FiClock,
  FiHeart,
  FiMessageSquare,
  FiShield,
  FiStar,
  FiTrendingUp,
  FiUserCheck,
  FiZap,
} from 'react-icons/fi'

import { AMBER, BLUE, GREEN, PURPLE, RED } from '@/theme/tokens'

export interface AchievementMeta {
  icon: IconType
  color: string
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary'
  howToEarn: string
}

const META: Record<string, AchievementMeta> = {
  'first-service': {
    icon: FiStar,
    color: AMBER,
    rarity: 'Common',
    howToEarn: 'Complete your first exchange on the platform.',
  },
  '10-offers': {
    icon: FiZap,
    color: GREEN,
    rarity: 'Uncommon',
    howToEarn: 'Publish at least 10 offers for the community.',
  },
  'kindness-hero': {
    icon: FiHeart,
    color: RED,
    rarity: 'Rare',
    howToEarn: 'Collect 20 kindness recognitions from completed exchanges.',
  },
  'super-helper': {
    icon: FiTrendingUp,
    color: GREEN,
    rarity: 'Rare',
    howToEarn: 'Reach 15 helpful recognitions from other members.',
  },
  'punctual-pro': {
    icon: FiClock,
    color: BLUE,
    rarity: 'Rare',
    howToEarn: 'Reach 15 punctual recognitions from completed exchanges.',
  },
  'community-voice': {
    icon: FiMessageSquare,
    color: PURPLE,
    rarity: 'Uncommon',
    howToEarn: 'Write at least 10 comments in the community.',
  },
  'time-giver-bronze': {
    icon: FiAward,
    color: AMBER,
    rarity: 'Uncommon',
    howToEarn: 'Share at least 10 hours through your completed services.',
  },
  'trusted-member': {
    icon: FiUserCheck,
    color: GREEN,
    rarity: 'Epic',
    howToEarn: 'Reach 25 completed exchanges as a reliable member.',
  },
  'perfect-record': {
    icon: FiShield,
    color: BLUE,
    rarity: 'Legendary',
    howToEarn: 'Complete 10 exchanges without any negative feedback.',
  },
  'top-rated': {
    icon: FiAward,
    color: PURPLE,
    rarity: 'Legendary',
    howToEarn: 'Reach 50 total positive reputation points.',
  },
  'seniority': {
    icon: FiAward,
    color: BLUE,
    rarity: 'Uncommon',
    howToEarn: 'Complete at least 5 services as a provider or participant.',
  },
  'registered-3-months': {
    icon: FiClock,
    color: BLUE,
    rarity: 'Common',
    howToEarn: 'Stay active on the platform for 3 months.',
  },
  'registered-6-months': {
    icon: FiClock,
    color: BLUE,
    rarity: 'Uncommon',
    howToEarn: 'Stay active on the platform for 6 months.',
  },
  'registered-9-months': {
    icon: FiClock,
    color: PURPLE,
    rarity: 'Rare',
    howToEarn: 'Stay active on the platform for 9 months.',
  },
  'registered-1-year': {
    icon: FiClock,
    color: AMBER,
    rarity: 'Epic',
    howToEarn: 'Stay active on the platform for 1 year.',
  },
  'registered-2-years': {
    icon: FiClock,
    color: AMBER,
    rarity: 'Legendary',
    howToEarn: 'Stay active on the platform for 2 years.',
  },
  'registered-3-years': {
    icon: FiClock,
    color: PURPLE,
    rarity: 'Legendary',
    howToEarn: 'Stay active on the platform for 3 years.',
  },
}

const DEFAULT_META: AchievementMeta = {
  icon: FiAward,
  color: AMBER,
  rarity: 'Common',
  howToEarn: 'Keep participating in the community to unlock this achievement.',
}

export function getAchievementMeta(badgeType: string): AchievementMeta {
  return META[badgeType] ?? DEFAULT_META
}
