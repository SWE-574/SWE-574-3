import React, { useCallback, useEffect, useState } from "react";
import { Alert, View, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import {
  getAchievementProgress,
  type AchievementProgressItem,
} from "../../api/achievementProgress";
import ProfileEditSheet, {
  type PickedImageAsset,
} from "../components/profile/ProfileEditSheet";
import type { BadgeProgress } from "../components/profile/BadgeShowcase";

function mapAchievementToBadgeProgress(items: AchievementProgressItem[]): BadgeProgress[] {
  return items.map((item) => {
    const current = item.current ?? 0;
    const threshold = item.threshold ?? 0;
    let progress_hint: string | undefined;
    if (!item.earned) {
      if (threshold > 0) {
        const remaining = Math.max(0, threshold - current);
        progress_hint = `${remaining} more to unlock`;
      } else {
        progress_hint = "Keep participating to unlock";
      }
    }
    return {
      id: item.badge_type,
      name: item.achievement.name,
      description: item.achievement.description,
      icon_url: item.achievement.icon_url ?? null,
      earned_at: item.earned_at ?? null,
      is_earned: item.earned,
      progress_hint,
    };
  });
}

type ProfileEditRoute = RouteProp<ProfileStackParamList, "ProfileEdit">;
type ProfileEditNavigation = NativeStackNavigationProp<
  ProfileStackParamList,
  "ProfileEdit"
>;

export default function ProfileEditScreen() {
  const route = useRoute<ProfileEditRoute>();
  const navigation = useNavigation<ProfileEditNavigation>();
  const { user, refreshUser } = useAuth();

  const [badgeProgress, setBadgeProgress] = useState<BadgeProgress[]>([]);
  const [badgeProgressLoading, setBadgeProgressLoading] = useState(true);
  const [badgeProgressError, setBadgeProgressError] = useState<string | null>(null);

  const loadBadgeProgress = useCallback(() => {
    if (!user?.id) return;
    setBadgeProgressLoading(true);
    setBadgeProgressError(null);
    getAchievementProgress(String(user.id))
      .then((items) => {
        setBadgeProgress(mapAchievementToBadgeProgress(items));
      })
      .catch((err: unknown) => {
        setBadgeProgressError(
          err instanceof Error ? err.message : "Could not load badges.",
        );
        setBadgeProgress([]);
      })
      .finally(() => {
        setBadgeProgressLoading(false);
      });
  }, [user?.id]);

  useEffect(() => {
    loadBadgeProgress();
  }, [loadBadgeProgress]);

  const pickProfileImage = async (
    kind: "avatar" | "banner",
  ): Promise<PickedImageAsset | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow photo library access to update your profile photos.",
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [16, 5],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return null;

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.fileName ?? `${kind}-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    };
  };

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.GREEN} />
      </View>
    );
  }

  return (
    <ProfileEditSheet
      visible
      presentation="screen"
      initialTab={route.params?.initialTab ?? "identity"}
      onClose={() => navigation.goBack()}
      onSaveSuccess={() => {
        void refreshUser({ force: true });
        navigation.goBack();
      }}
      user={user}
      badgeProgress={badgeProgress}
      badgeProgressLoading={badgeProgressLoading}
      badgeProgressError={badgeProgressError}
      onBadgeProgressRetry={loadBadgeProgress}
      onPickAvatar={() => pickProfileImage("avatar")}
      onPickCoverPhoto={() => pickProfileImage("banner")}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GRAY50,
  },
});
