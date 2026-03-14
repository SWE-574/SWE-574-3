/**
 * Achievement IDs and display names for the profile achievements section.
 */

export enum AchievementId {
  FirstService = "first-service",
  TenOffers = "10-offers",
  KindnessHero = "kindness-hero",
  SuperHelper = "super-helper",
  PunctualPro = "punctual-pro",
  CommunityVoice = "community-voice",
  TimeGiverBronze = "time-giver-bronze",
  TrustedMember = "trusted-member",
  PerfectRecord = "perfect-record",
  TopRated = "top-rated",
  Seniority = "seniority",
  Registered3Months = "registered-3-months",
  Registered6Months = "registered-6-months",
  Registered9Months = "registered-9-months",
  Registered1Year = "registered-1-year",
  Registered2Years = "registered-2-years",
  Registered3Years = "registered-3-years",
}

export const ACHIEVEMENT_DISPLAY_NAMES: Record<AchievementId, string> = {
  [AchievementId.FirstService]: "First Service",
  [AchievementId.TenOffers]: "10+ Offers",
  [AchievementId.KindnessHero]: "Kindness Hero",
  [AchievementId.SuperHelper]: "Super Helper",
  [AchievementId.PunctualPro]: "Punctual Pro",
  [AchievementId.CommunityVoice]: "Community Voice",
  [AchievementId.TimeGiverBronze]: "Time Giver Bronze",
  [AchievementId.TrustedMember]: "Trusted Member",
  [AchievementId.PerfectRecord]: "Perfect Record",
  [AchievementId.TopRated]: "Top Rated",
  [AchievementId.Seniority]: "Seniority",
  [AchievementId.Registered3Months]: "Registered 3 Months",
  [AchievementId.Registered6Months]: "Registered 6 Months",
  [AchievementId.Registered9Months]: "Registered 9 Months",
  [AchievementId.Registered1Year]: "Registered 1 Year",
  [AchievementId.Registered2Years]: "Registered 2 Years",
  [AchievementId.Registered3Years]: "Registered 3 Years",
};

/** All achievement ids in display order (featured first, then rest). */
export const ACHIEVEMENT_ORDER: AchievementId[] = [
  AchievementId.FirstService,
  AchievementId.TenOffers,
  AchievementId.KindnessHero,
  AchievementId.SuperHelper,
  AchievementId.PunctualPro,
  AchievementId.CommunityVoice,
  AchievementId.TimeGiverBronze,
  AchievementId.TrustedMember,
  AchievementId.PerfectRecord,
  AchievementId.TopRated,
  AchievementId.Seniority,
  AchievementId.Registered3Months,
  AchievementId.Registered6Months,
  AchievementId.Registered9Months,
  AchievementId.Registered1Year,
  AchievementId.Registered2Years,
  AchievementId.Registered3Years,
];

export type AchievementProgress = {
  id: AchievementId;
  progress: number; // 0–100, 100 = completed
};
