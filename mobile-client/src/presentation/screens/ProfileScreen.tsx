import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  useNavigation,
  type CompositeNavigationProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import type { BottomTabParamList } from "../../navigation/BottomTabNavigator";
import { useAuth } from "../../context/AuthContext";
import { colors } from "../../constants/colors";
import { Ionicons, SimpleLineIcons } from "@expo/vector-icons";
import { listServices } from "../../api/services";
import { getUserHistory } from "../../api/users";
import type { Service, UserHistoryItem } from "../../api/types";
import { groupHistoryItems, isOwnHistoryItem } from "../../utils/historyGrouping";
import AchievementsSection from "../components/AchievementsSection";
import ProfileListingStatsRow from "../components/ProfileListingStatsRow";
import ServiceCard from "../components/ServiceCard";

type ProfileHomeNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ProfileStackParamList, "ProfileHome">,
  BottomTabNavigationProp<BottomTabParamList>
>;

type EditableProfile = {
  first_name: string;
  last_name: string;
  email: string;
  bio: string;
  location: string;
  avatar_url: string;
  banner_url: string;
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<ProfileHomeNavigation>();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeServices, setActiveServices] = useState<Service[]>([]);
  const [activeServicesOpen, setActiveServicesOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<UserHistoryItem[]>([]);

  const initialForm = useMemo<EditableProfile>(
    () => ({
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      email: user?.email ?? "",
      bio: user?.bio ?? "",
      location: (user as typeof user & { location?: string })?.location ?? "",
      avatar_url:
        (user as typeof user & { avatar_url?: string })?.avatar_url ?? "",
      banner_url:
        (user as typeof user & { banner_url?: string })?.banner_url ?? "",
    }),
    [user],
  );

  const [form, setForm] = useState<EditableProfile>(initialForm);

  useEffect(() => {
    if (!user?.id) return;
    const ownerId = String(user.id);
    let cancelled = false;
    setActiveServices([]);
    setActiveServicesOpen(false);
    listServices({ user: ownerId, page_size: 50 })
      .then((res) => {
        if (cancelled) return;
        const rows = res.results ?? [];
        setActiveServices(rows.filter((s) => s.is_visible !== false));
      })
      .catch(() => {
        if (!cancelled) setActiveServices([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setHistoryItems([]);
      return;
    }
    const uid = String(user.id);
    let cancelled = false;
    getUserHistory(uid)
      .then((rows) => {
        if (!cancelled) setHistoryItems(rows);
      })
      .catch(() => {
        if (!cancelled) setHistoryItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleChange = (key: keyof EditableProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // TODO:
      // Replace this block with your real API call, something like:
      // await updateProfile({
      //   first_name: form.first_name,
      //   last_name: form.last_name,
      //   email: form.email,
      //   bio: form.bio,
      //   location: form.location,
      //   avatar_url: form.avatar_url,
      //   banner_url: form.banner_url,
      // });

      await new Promise((resolve) => setTimeout(resolve, 600));

      setIsEditing(false);
      Alert.alert("Profile updated", "Your profile changes have been saved.");
    } catch (error) {
      Alert.alert("Error", "Could not save your profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView edges={["top"]} style={styles.authContainer}>
        <View style={styles.loggedOutCard}>
          <Text style={styles.loggedOutTitle}>Your profile</Text>
          <Text style={styles.loggedOutSubtitle}>
            Sign in to view your profile, update your details, manage your
            public info, and track your timebank activity.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Login")}
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Register")}
          >
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const typedUser = user as typeof user & {
    avatar_url?: string;
    banner_url?: string;
    location?: string;
    timebank_balance?: string | number;
    karma_score?: number;
    role?: string;
    date_joined?: string;
    badges?: string[];
    skills?: Array<{ id: string; name: string }>;
    portfolio_images?: string[];
    is_verified?: boolean;
    helpful_count?: number;
    kind_count?: number;
    punctual_count?: number;
    achievements?: string[];
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const joinedDate = typedUser.date_joined
    ? new Date(typedUser.date_joined).toLocaleDateString()
    : null;

  const activeListingServices = activeServices.filter((s) => s.status === "Active");
  const offersCount = activeListingServices.filter((s) => s.type === "Offer").length;
  const needsCount = activeListingServices.filter((s) => s.type === "Need").length;
  const exchangesCount = groupHistoryItems(
    historyItems.filter(isOwnHistoryItem),
  ).length;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Image
            source={{
              uri:
                form.banner_url ||
                "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
            }}
            style={styles.banner}
          />

          <View style={styles.avatarWrapper}>
            <Image
              source={{
                uri:
                  form.avatar_url ||
                  "https://api.dicebear.com/9.x/avataaars/png?seed=profile",
              }}
              style={styles.avatar}
            />
          </View>

          <View style={styles.profileHeaderContent}>
            {!isEditing ? (
              <>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{fullName || "Unnamed User"}</Text>
                  {typedUser.is_verified ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedBadgeText}>Verified</Text>
                    </View>
                  ) : null}
                </View>

                {form.email ? (
                  <Text style={styles.email}>{form.email}</Text>
                ) : null}

                {form.location ? (
                  <Text style={styles.location}>{form.location}</Text>
                ) : null}

                {form.bio ? <Text style={styles.bio}>{form.bio}</Text> : null}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.primarySmallButton}
                    onPress={() => setIsEditing(true)}
                  >
                    <Ionicons name="pencil" size={16} color={colors.GRAY500} />
                    <Text style={styles.primarySmallButtonText}>
                      {" Edit profile"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <InputField
                  label="First name"
                  value={form.first_name}
                  editable
                  onChangeText={(value) => handleChange("first_name", value)}
                />
                <InputField
                  label="Last name"
                  value={form.last_name}
                  editable
                  onChangeText={(value) => handleChange("last_name", value)}
                />
                <InputField
                  label="Email"
                  value={form.email}
                  editable
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onChangeText={(value) => handleChange("email", value)}
                />
                <InputField
                  label="Location"
                  value={form.location}
                  editable
                  onChangeText={(value) => handleChange("location", value)}
                />
                <InputField
                  label="Bio"
                  value={form.bio}
                  editable
                  multiline
                  onChangeText={(value) => handleChange("bio", value)}
                />
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.secondarySmallButton}
                    onPress={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <Text style={styles.secondarySmallButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryGreenButton}
                    onPress={() => void handleSave()}
                    disabled={isSaving}
                  >
                    <Text style={styles.primaryGreenButtonText}>
                      {isSaving ? "Saving..." : "Save changes"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        <ProfileListingStatsRow
          offersCount={offersCount}
          needsCount={needsCount}
          exchangesCount={exchangesCount}
        />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="time-outline" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>
                {Number(typedUser.timebank_balance)?.toFixed(0) ?? "0"}
              </Text>
            </View>
            <Text style={styles.statLabel}>hours available</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Ionicons name="heart-outline" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>{typedUser.karma_score ?? 0}</Text>
            </View>
            <Text style={styles.statLabel}>karma</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <SimpleLineIcons name="badge" size={20} color={colors.GREEN} />
              <Text style={styles.statValue}>
                {typedUser.badges?.length ?? 0}
              </Text>
            </View>
            <Text style={styles.statLabel}>Badges</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.helpful_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Helpful</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.kind_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Kind</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillValue}>
              {typedUser.punctual_count ?? 0}
            </Text>
            <Text style={styles.metricPillLabel}>Punctual</Text>
          </View>
        </View>

        {/* <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Role</Text>
            <Text style={styles.infoValue}>{typedUser.role ?? "member"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Joined</Text>
            <Text style={styles.infoValue}>{joinedDate ?? "-"}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Verification</Text>
            <Text style={styles.infoValue}>
              {typedUser.is_verified ? "Verified" : "Not verified"}
            </Text>
          </View>
        </View> */}

        {activeServices.length > 0 ? (
          <View style={styles.sectionCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Active services"
              accessibilityHint={
                activeServicesOpen
                  ? "Double tap to collapse the list"
                  : "Double tap to expand the list"
              }
              accessibilityState={{ expanded: activeServicesOpen }}
              onPress={() => setActiveServicesOpen((open) => !open)}
              style={({ pressed }) => [
                styles.activeServicesAccordionHeader,
                activeServicesOpen && styles.activeServicesAccordionHeaderOpen,
                pressed && styles.activeServicesAccordionHeaderPressed,
              ]}
            >
              <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                Active services
              </Text>
              <View style={styles.activeServicesHeaderTrailing}>
                <View style={styles.activeServicesCountPill}>
                  <Text style={styles.activeServicesCountText}>
                    {activeServices.length}
                  </Text>
                </View>
                <Ionicons
                  name={activeServicesOpen ? "chevron-up" : "chevron-down"}
                  size={22}
                  color={colors.GRAY700}
                />
              </View>
            </Pressable>
            {activeServicesOpen
              ? activeServices.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open service ${service.title}`}
                    onPress={() =>
                      navigation.navigate("Home", {
                        screen: "ServiceDetail",
                        params: { id: service.id },
                      })
                    }
                    style={({ pressed }) => [
                      styles.serviceCardPressable,
                      pressed && styles.serviceCardPressablePressed,
                    ]}
                  >
                    <ServiceCard
                      service={service}
                      style={styles.serviceCardInProfile}
                    />
                  </Pressable>
                ))
              : null}
          </View>
        ) : null}

        {!!typedUser.skills?.length && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.tagsWrap}>
              {typedUser.skills.map((skill) => (
                <View key={skill.id} style={styles.tag}>
                  <Text style={styles.tagText}>{skill.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <AchievementsSection
          completedIds={
            [...new Set([...(typedUser.achievements ?? []), ...(typedUser.badges ?? [])])]
          }
          onViewAll={
            user?.id
              ? () =>
                  navigation.navigate("AchievementsList", {
                    userId: user.id,
                  })
              : undefined
          }
        />

        {!!typedUser.portfolio_images?.length && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {typedUser.portfolio_images.map((imageUrl, index) => (
                <Image
                  key={`${imageUrl}-${index}`}
                  source={{ uri: imageUrl }}
                  style={styles.portfolioImage}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => void logout()}
        >
          <Text style={styles.logoutButtonText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

type InputFieldProps = {
  label: string;
  value: string;
  editable?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  onChangeText: (value: string) => void;
};

function InputField({
  label,
  value,
  editable = false,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  onChangeText,
}: InputFieldProps) {
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => getStyles(insets.top, insets.bottom),
    [insets.top, insets.bottom],
  );
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        editable={editable}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.GRAY400}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          !editable && styles.readOnlyInput,
        ]}
      />
    </View>
  );
}

const getStyles = (top: number, bottom: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.GRAY100,
    },
    scrollContent: {
      paddingBottom: 32,
      paddingTop: top + 16,
    },
    authContainer: {
      flex: 1,
      backgroundColor: colors.GRAY50,
      padding: 16,
      justifyContent: "center",
    },
    loggedOutCard: {
      backgroundColor: colors.WHITE,
      borderRadius: 24,
      padding: 24,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    loggedOutTitle: {
      fontSize: 28,
      fontWeight: "700",
      color: colors.GRAY900,
      marginBottom: 10,
    },
    loggedOutSubtitle: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.GRAY500,
      marginBottom: 24,
    },
    heroCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 28,
      overflow: "hidden",
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    banner: {
      width: "100%",
      height: 150,
      backgroundColor: colors.GRAY200,
    },
    avatarWrapper: {
      position: "absolute",
      top: 98,
      left: 20,
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: colors.WHITE,
      alignItems: "center",
      justifyContent: "center",
      padding: 4,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.GRAY200,
    },
    profileHeaderContent: {
      paddingHorizontal: 20,
      paddingTop: 62,
      paddingBottom: 20,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    },
    name: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.GRAY900,
    },
    verifiedBadge: {
      backgroundColor: colors.BLUE_LT,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    verifiedBadgeText: {
      color: colors.BLUE,
      fontSize: 12,
      fontWeight: "700",
    },
    email: {
      fontSize: 14,
      color: colors.GRAY500,
      marginBottom: 6,
    },
    location: {
      fontSize: 14,
      color: colors.GRAY500,
      marginBottom: 10,
    },
    bio: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.GRAY700,
      marginBottom: 16,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 16,
      marginTop: 16,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.WHITE,
      borderRadius: 20,
      paddingVertical: 18,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.GREEN,
    },
    statIconWrap: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    statValue: {
      color: colors.GREEN,
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 4,
    },
    statLabel: {
      color: colors.GRAY500,
      fontSize: 13,
      fontWeight: "400",
    },

    metricsRow: {
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    metricPill: {
      flex: 1,
      backgroundColor: colors.WHITE,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
    },
    metricPillValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.GRAY900,
    },
    metricPillLabel: {
      fontSize: 12,
      color: colors.GRAY500,
      marginTop: 2,
    },

    sectionCard: {
      backgroundColor: colors.WHITE,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 24,
      padding: 18,
      shadowColor: colors.GRAY900,
      shadowOpacity: 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.GRAY900,
      marginBottom: 14,
    },
    sectionTitleInline: {
      marginBottom: 0,
    },
    activeServicesAccordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
      marginHorizontal: -4,
      paddingHorizontal: 4,
      borderRadius: 12,
    },
    activeServicesAccordionHeaderOpen: {
      marginBottom: 12,
    },
    activeServicesAccordionHeaderPressed: {
      opacity: 0.75,
    },
    activeServicesHeaderTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    activeServicesCountPill: {
      backgroundColor: colors.GREEN_LT,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: "center",
    },
    activeServicesCountText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.GREEN,
    },
    serviceCardPressable: {
      borderRadius: 14,
      marginBottom: 12,
    },
    serviceCardPressablePressed: {
      opacity: 0.92,
    },
    serviceCardInProfile: {
      marginHorizontal: 0,
      marginBottom: 0,
    },
    inputGroup: {
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.GRAY600,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.GRAY50,
      borderWidth: 1,
      borderColor: colors.GRAY200,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.GRAY900,
    },
    multilineInput: {
      minHeight: 100,
    },
    readOnlyInput: {
      color: colors.GRAY700,
      backgroundColor: colors.GRAY100,
    },

    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.GRAY100,
    },
    infoLabel: {
      fontSize: 15,
      color: colors.GRAY500,
    },
    infoValue: {
      fontSize: 15,
      color: colors.GRAY900,
      fontWeight: "600",
      maxWidth: "55%",
      textAlign: "right",
    },

    tagsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    tag: {
      backgroundColor: colors.GREEN_LT,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    tagText: {
      color: colors.GREEN,
      fontSize: 13,
      fontWeight: "600",
    },

    portfolioImage: {
      width: 170,
      height: 110,
      borderRadius: 16,
      marginRight: 12,
      backgroundColor: colors.GRAY200,
    },

    primaryButton: {
      backgroundColor: colors.GREEN,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
      marginBottom: 12,
    },
    primaryButtonText: {
      color: colors.WHITE,
      fontSize: 16,
      fontWeight: "700",
    },
    secondaryButton: {
      backgroundColor: colors.WHITE,
      borderWidth: 1,
      borderColor: colors.GRAY300,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
    },
    secondaryButtonText: {
      color: colors.GRAY900,
      fontSize: 16,
      fontWeight: "700",
    },

    primarySmallButton: {
      backgroundColor: colors.WHITE,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      borderWidth: 1,
      borderColor: colors.GRAY500,
    },
    primarySmallButtonText: {
      color: colors.GRAY500,
      fontSize: 14,
      fontWeight: "500",
    },
    secondarySmallButton: {
      backgroundColor: colors.WHITE,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.RED,
    },
    secondarySmallButtonText: {
      color: colors.RED,
      fontSize: 14,
      fontWeight: "500",
    },
    primaryGreenButton: {
      backgroundColor: colors.GREEN,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    primaryGreenButtonText: {
      color: colors.WHITE,
      fontSize: 14,
      fontWeight: "700",
    },
    logoutButton: {
      marginHorizontal: 16,
      marginTop: 18,
      backgroundColor: colors.RED_LT,
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.RED,
    },
    logoutButtonText: {
      color: colors.RED,
      fontSize: 15,
      fontWeight: "700",
    },
  });
