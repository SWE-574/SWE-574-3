import React from "react";
import { Alert, View, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { patchMe } from "../../api/users";
import ProfileEditSheet from "../components/profile/ProfileEditSheet";

type ProfileEditRoute = RouteProp<ProfileStackParamList, "ProfileEdit">;
type ProfileEditNavigation = NativeStackNavigationProp<
  ProfileStackParamList,
  "ProfileEdit"
>;

export default function ProfileEditScreen() {
  const route = useRoute<ProfileEditRoute>();
  const navigation = useNavigation<ProfileEditNavigation>();
  const { user, refreshUser } = useAuth();

  const uploadProfileImage = async (kind: "avatar" | "banner") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow photo library access to update your profile photos.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: kind === "avatar" ? [1, 1] : [16, 5],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const formData = new FormData();
    formData.append(kind, {
      uri: asset.uri,
      name: asset.fileName ?? `${kind}-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);

    try {
      await patchMe(formData as Parameters<typeof patchMe>[0]);
      await refreshUser();
    } catch (err) {
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Could not update your profile photo.",
      );
    }
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
        void refreshUser();
        navigation.goBack();
      }}
      user={user}
      onAvatarChangePress={() => void uploadProfileImage("avatar")}
      onCoverPhotoChangePress={() => void uploadProfileImage("banner")}
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
