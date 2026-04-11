import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ExpoLocation from "expo-location";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createService } from "../../../api/services";
import { createTag, listTags } from "../../../api/tags";
import { searchWikidata } from "../../../api/wikidata";
import type { Tag } from "../../../api/types";
import type { PostStackParamList } from "../../../navigation/PostStack";
import { colors } from "../../../constants/colors";
import {
  getMapboxToken,
  reverseGeocodeLocation,
  searchMapboxLocations,
  type LocationValue,
} from "../../../utils/mapboxLocation";
import LeafletLocationPickerModal from "./LeafletLocationPickerModal";

type ServiceType = "Offer" | "Need" | "Event";

type WizardImage = {
  uri: string;
  name: string;
  type: string;
};

type ServiceWizardProps = {
  type: ServiceType;
  organizerBanned?: boolean;
  organizerBanText?: string | null;
};

type NavProp = NativeStackNavigationProp<PostStackParamList>;

const STEPS = ["Basics", "Schedule", "Location", "Tags", "Review"];

function normalizeTagsResponse(
  data: Tag[] | { results?: Tag[] },
): Tag[] {
  return Array.isArray(data) ? data : data?.results ?? [];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isWikidataQid(value: string): boolean {
  return /^Q\d+$/i.test(value);
}

function formatDate(date: Date | null): string {
  if (!date) return "Select date";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(date: Date | null): string {
  if (!date) return "Select time";
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStepperValue(value: number, options?: { suffix?: string; trimZero?: boolean }) {
  const { suffix = "", trimZero = false } = options ?? {};
  const raw = trimZero && Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
  return suffix ? `${raw}${suffix}` : raw;
}

export default function ServiceWizard({
  type,
  organizerBanned = false,
  organizerBanText,
}: ServiceWizardProps) {
  const navigation = useNavigation<NavProp>();
  const accent =
    type === "Event" ? colors.AMBER : type === "Offer" ? colors.GREEN : colors.BLUE;
  const accentLight =
    type === "Event" ? colors.AMBER_LT : type === "Offer" ? colors.GREEN_LT : colors.BLUE_LT;
  const tokenAvailable = !!getMapboxToken();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(type === "Event" ? "1.5" : "1");
  const [maxParticipants, setMaxParticipants] = useState("1");
  const [locationType, setLocationType] = useState<"In-Person" | "Online">("In-Person");
  const [scheduleType, setScheduleType] = useState<"One-Time" | "Recurrent">("One-Time");
  const [scheduleDetails, setScheduleDetails] = useState("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [pickerMode, setPickerMode] = useState<"date" | "time" | null>(null);
  const [onlineLocation, setOnlineLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<LocationValue[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const suppressLocationSearch = React.useRef(false);
  const [locationInputFocused, setLocationInputFocused] = React.useState(false);
  const [exactLocation, setExactLocation] = useState<LocationValue | null>(null);
  const [publicLocation, setPublicLocation] = useState<LocationValue | null>(null);
  const [locationGuide, setLocationGuide] = useState("");
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [images, setImages] = useState<WizardImage[]>([]);
  const [showMapPicker, setShowMapPicker] = useState(false);

  const isFixedGroupOffer =
    type === "Offer" &&
    scheduleType === "One-Time" &&
    Number(maxParticipants || "1") > 1;

  const heroTitle =
    type === "Event"
      ? "Create an event"
      : type === "Offer"
        ? "Create an offer"
        : "Create a need";

  const heroDescription =
    type === "Event"
      ? "Plan a community event with a guided step-by-step flow."
      : type === "Offer"
        ? "Share a skill, service, or time with the community."
        : "Describe what you need so the right people can find you.";

  useEffect(() => {
    if (type === "Need") {
      setMaxParticipants("1");
    }
  }, [type]);

  useEffect(() => {
    let active = true;

    if (tagQuery.trim().length < 2) {
      setTagSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      setLoadingTags(true);
      try {
        const [tagsResponse, wikidataResponse] = await Promise.all([
          listTags({ search: tagQuery.trim() }),
          searchWikidata({ q: tagQuery.trim(), limit: 5 }),
        ]);

        if (!active) return;

        const existing = normalizeTagsResponse(tagsResponse);
        const wikidata = wikidataResponse.map((item) => ({
          id: item.id,
          name: String(item.label || item.id),
        }));

        const merged = [...existing, ...wikidata].filter(
          (candidate, index, list) =>
            list.findIndex((item) => item.id === candidate.id) === index &&
            !selectedTags.some((tag) => tag.id === candidate.id),
        );

        setTagSuggestions(merged.slice(0, 8));
      } catch {
        if (active) setTagSuggestions([]);
      } finally {
        if (active) setLoadingTags(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [selectedTags, tagQuery]);

  useEffect(() => {
    let active = true;

    if (suppressLocationSearch.current) {
      suppressLocationSearch.current = false;
      return;
    }

    if (locationType !== "In-Person" || !tokenAvailable || locationQuery.trim().length < 2) {
      setLocationSuggestions([]);
      setLoadingLocations(false);
      return;
    }

    const handle = setTimeout(async () => {
      setLoadingLocations(true);
      try {
        const results = await searchMapboxLocations(locationQuery.trim(), "full");
        if (!active) return;
        setLocationSuggestions(results.slice(0, 6));
      } catch {
        if (active) setLocationSuggestions([]);
      } finally {
        if (active) setLoadingLocations(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [locationQuery, locationType, tokenAvailable]);

  const clearError = (key: string) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const applyResolvedLocation = (value: LocationValue) => {
    suppressLocationSearch.current = true;
    setExactLocation(value);
    setLocationQuery(value.fullAddress ?? value.label);
    setLocationSuggestions([]);
    clearError("location");

    if (isFixedGroupOffer) {
      const publicLabel = value.district || value.label;
      setPublicLocation({
        ...value,
        label: publicLabel,
        fullAddress: publicLabel,
      });
      return;
    }

    setPublicLocation(value);
  };

  const durationValue = useMemo(() => {
    const parsed = Number(duration);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : type === "Event" ? 1.5 : 1;
  }, [duration, type]);

  const participantsValue = useMemo(() => {
    if (type === "Need") return 1;
    const parsed = Number(maxParticipants);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  }, [maxParticipants, type]);

  const adjustDuration = (direction: "decrease" | "increase") => {
    const step = type === "Event" ? 0.5 : 1;
    const min = type === "Event" ? 0.5 : 1;
    const max = type === "Event" ? 12 : 10;
    const next =
      direction === "increase"
        ? Math.min(max, durationValue + step)
        : Math.max(min, durationValue - step);
    setDuration(type === "Event" ? next.toFixed(1).replace(/\.0$/, "") : String(next));
    clearError("duration");
  };

  const adjustParticipants = (direction: "decrease" | "increase") => {
    if (type === "Need") {
      setMaxParticipants("1");
      clearError("maxParticipants");
      return;
    }

    const min = 1;
    const max = 20;
    const next =
      direction === "increase"
        ? Math.min(max, participantsValue + 1)
        : Math.max(min, participantsValue - 1);
    setMaxParticipants(String(next));
    clearError("maxParticipants");
  };

  const addTag = async (tag: Tag) => {
    if (selectedTags.some((item) => item.id === tag.id)) return;
    setSelectedTags((prev) => [...prev, tag]);
    setTagQuery("");
    setTagSuggestions([]);
  };

  const addCustomTag = async () => {
    const name = tagQuery.trim();
    if (!name) return;
    try {
      const created = await createTag({ name });
      await addTag(created);
    } catch {
      await addTag({ id: `custom:${name.toLowerCase()}`, name });
    }
  };

  const useCurrentLocation = async () => {
    try {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Location permission is required to use your current position.",
        );
        return;
      }

      const coords = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });

      const resolved = await reverseGeocodeLocation(
        coords.coords.latitude,
        coords.coords.longitude,
      );

      const nextValue =
        resolved ??
        ({
          label: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          fullAddress: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          district: `${coords.coords.latitude.toFixed(5)}, ${coords.coords.longitude.toFixed(5)}`,
          lat: coords.coords.latitude,
          lng: coords.coords.longitude,
        } satisfies LocationValue);

      applyResolvedLocation(nextValue);
    } catch {
      Alert.alert("Location unavailable", "Please try again.");
    }
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Photo library access is required to upload images.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - images.length),
      quality: 0.85,
    });

    if (result.canceled) return;

    const nextImages = result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `service-photo-${Date.now()}-${index}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
    }));

    setImages((prev) => [...prev, ...nextImages].slice(0, 5));
  };

  const onDateTimeChange = (
    event: DateTimePickerEvent,
    selectedValue?: Date,
  ) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }
    if (event.type === "dismissed" || !selectedValue) return;

    const base = scheduledAt ? new Date(scheduledAt) : new Date();
    if (pickerMode === "date") {
      base.setFullYear(
        selectedValue.getFullYear(),
        selectedValue.getMonth(),
        selectedValue.getDate(),
      );
    } else {
      base.setHours(selectedValue.getHours(), selectedValue.getMinutes(), 0, 0);
    }
    setScheduledAt(base);
    clearError("scheduledTime");
  };

  const validateStep = (targetStep: number): boolean => {
    const nextErrors: Record<string, string> = {};
    const durationNumber = Number(duration);
    const participantsNumber = Number(maxParticipants || "1");

    if (targetStep >= 1) {
      if (title.trim().length < 3) {
        nextErrors.title = "Title must be at least 3 characters.";
      }
      if (description.trim().length < 10) {
        nextErrors.description = "Description must be at least 10 characters.";
      }
    }

    if (targetStep >= 2) {
      if (!Number.isFinite(durationNumber)) {
        nextErrors.duration = "Duration must be a valid number.";
      } else if (type === "Event") {
        if (durationNumber <= 0) {
          nextErrors.duration = "Duration must be greater than 0.";
        }
      } else if (
        !Number.isInteger(durationNumber) ||
        durationNumber < 1 ||
        durationNumber > 10
      ) {
        nextErrors.duration = "Duration must be a whole number between 1 and 10.";
      }

      if (
        type !== "Need" &&
        (!Number.isFinite(participantsNumber) || participantsNumber < 1)
      ) {
        nextErrors.maxParticipants = "Participant count must be at least 1.";
      }

      if (type === "Event" || isFixedGroupOffer) {
        if (!scheduledAt) {
          nextErrors.scheduledTime = "Date and time are required.";
        } else if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
          nextErrors.scheduledTime = "Date and time must be in the future.";
        }
      }
    }

    if (targetStep >= 3) {
      if (locationType === "In-Person" && !exactLocation) {
        nextErrors.location =
          "Select an address from the dropdown, map, or current location.";
      }
      if (locationType === "Online" && isFixedGroupOffer && !onlineLocation.trim()) {
        nextErrors.onlineLocation = "A meeting link or platform is required.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const buildFormData = (): FormData => {
    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("type", type);
    formData.append("duration", String(Number(duration)));
    formData.append("location_type", locationType);
    formData.append(
      "max_participants",
      type === "Need" ? "1" : String(Number(maxParticipants || "1")),
    );
    formData.append("schedule_type", type === "Event" ? "One-Time" : scheduleType);

    if (scheduleDetails.trim()) {
      formData.append("schedule_details", scheduleDetails.trim());
    }

    if (locationType === "In-Person" && publicLocation) {
      formData.append("location_area", publicLocation.label.slice(0, 100));
      formData.append("location_lat", publicLocation.lat.toFixed(6));
      formData.append("location_lng", publicLocation.lng.toFixed(6));
    } else if (locationType === "Online" && isFixedGroupOffer) {
      formData.append("location_area", onlineLocation.trim().slice(0, 100));
    }

    if ((type === "Event" || isFixedGroupOffer) && scheduledAt) {
      formData.append("scheduled_time", scheduledAt.toISOString());
    }

    if (isFixedGroupOffer && locationType === "In-Person" && exactLocation) {
      formData.append(
        "session_exact_location",
        (exactLocation.fullAddress ?? exactLocation.label).slice(0, 255),
      );
      formData.append("session_exact_location_lat", exactLocation.lat.toFixed(6));
      formData.append("session_exact_location_lng", exactLocation.lng.toFixed(6));
      formData.append("session_location_guide", locationGuide.trim().slice(0, 255));
    } else {
      formData.append("session_exact_location", "");
      formData.append("session_exact_location_lat", "");
      formData.append("session_exact_location_lng", "");
      formData.append("session_location_guide", "");
    }

    const wikidataLabelMap: Record<string, string> = {};
    selectedTags.forEach((tag) => {
      if (isUuid(tag.id) || isWikidataQid(tag.id)) {
        formData.append("tag_ids", tag.id);
        if (isWikidataQid(tag.id) && tag.name.trim()) {
          wikidataLabelMap[tag.id.toUpperCase()] = tag.name.trim();
        }
        return;
      }

      formData.append("tag_names", tag.name.trim());
    });

    if (Object.keys(wikidataLabelMap).length > 0) {
      formData.append("wikidata_labels_json", JSON.stringify(wikidataLabelMap));
    }

    images.forEach((image, index) => {
      formData.append("media", {
        uri: image.uri,
        name: image.name || `service-photo-${index + 1}.jpg`,
        type: image.type || "image/jpeg",
      } as unknown as Blob);
    });

    return formData;
  };

  const handleSubmit = async () => {
    if (!validateStep(STEPS.length)) return;

    if (organizerBanned) {
      Alert.alert(
        "Event creation locked",
        organizerBanText ?? "You cannot create an event right now.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await createService(buildFormData());
      Alert.alert(
        "Success",
        type === "Event"
          ? "Event created."
          : type === "Offer"
            ? "Offer created."
            : "Need created.",
      );

      const parentNavigation = navigation.getParent();
      if (parentNavigation) {
        (parentNavigation as unknown as {
          navigate: (name: string, params?: unknown) => void;
        }).navigate("Home", {
          screen: "ServiceDetail",
          params: { id: created.id },
        });
      } else {
        navigation.goBack();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred while saving.";
      Alert.alert("Could not save", message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderIntro = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>How it works</Text>
      <Text style={styles.sectionTitle}>{heroTitle}</Text>
      <Text style={styles.sectionBody}>{heroDescription}</Text>

      {type === "Event" ? (
        <View style={[styles.infoBanner, { backgroundColor: colors.AMBER_LT }]}>
          <Text style={[styles.infoBannerTitle, { color: colors.AMBER }]}>
            Event flow
          </Text>
          <Text style={[styles.infoBannerText, { color: "#92400E" }]}>
            Events do not transfer time credits. A date and time are required, and
            participants can join before the event begins.
          </Text>
        </View>
      ) : null}

      {organizerBanned ? (
        <View style={[styles.infoBanner, { backgroundColor: colors.RED_LT }]}>
          <Text style={[styles.infoBannerTitle, { color: colors.RED }]}>
            Event creation locked
          </Text>
          <Text style={[styles.infoBannerText, { color: "#991B1B" }]}>
            {organizerBanText ?? "You cannot create a new event during this period."}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderBasic = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>Basics</Text>
      <InputLabel label="Title" error={errors.title}>
        <TextInput
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            clearError("title");
          }}
          placeholder={
            type === "Offer"
              ? "e.g. Beginner guitar lessons"
              : type === "Need"
                ? "e.g. Looking for a Turkish tutor"
                : "e.g. Saturday morning yoga in the park"
          }
          placeholderTextColor={colors.GRAY400}
          style={styles.input}
        />
      </InputLabel>

      <InputLabel label="Description" error={errors.description}>
        <TextInput
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            clearError("description");
          }}
          placeholder="Describe what participants can expect — schedule, materials, skill level…"
          placeholderTextColor={colors.GRAY400}
          multiline
          style={[styles.input, styles.textarea]}
        />
      </InputLabel>
    </View>
  );

  const renderSchedule = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>Schedule</Text>

      <InputLabel
        label={type === "Event" ? "Duration (hours)" : "Duration / credits (hours)"}
        error={errors.duration}
      >
        <StepperField
          value={formatStepperValue(durationValue, {
            suffix: type === "Event" ? " h" : " h",
            trimZero: true,
          })}
          onDecrease={() => adjustDuration("decrease")}
          onIncrease={() => adjustDuration("increase")}
          decreaseDisabled={durationValue <= (type === "Event" ? 0.5 : 1)}
          increaseDisabled={durationValue >= (type === "Event" ? 12 : 10)}
        />
      </InputLabel>

      <InputLabel label="Maximum participants" error={errors.maxParticipants}>
        <StepperField
          value={formatStepperValue(participantsValue)}
          onDecrease={() => adjustParticipants("decrease")}
          onIncrease={() => adjustParticipants("increase")}
          decreaseDisabled={participantsValue <= 1}
          increaseDisabled={type === "Need" || participantsValue >= 20}
        />
      </InputLabel>
      {type === "Need" ? (
        <Text style={styles.helperText}>
          Need posts stay one-to-one, so participant count remains fixed at 1.
        </Text>
      ) : null}

      {type !== "Event" ? (
        <SegmentRow
          label="Schedule type"
          value={scheduleType}
          onChange={(value) => setScheduleType(value as "One-Time" | "Recurrent")}
          options={[
            { value: "One-Time", label: "One-time" },
            { value: "Recurrent", label: "Recurring" },
          ]}
          accent={accent}
        />
      ) : null}

      {type === "Event" || isFixedGroupOffer ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Date and time</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.input, styles.rowInput, styles.pickerButton]}
              onPress={() => setPickerMode("date")}
            >
              <Text style={scheduledAt ? styles.pickerValue : styles.pickerPlaceholder}>
                {formatDate(scheduledAt)}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.input, styles.rowInput, styles.pickerButton]}
              onPress={() => setPickerMode("time")}
            >
              <Text style={scheduledAt ? styles.pickerValue : styles.pickerPlaceholder}>
                {formatTime(scheduledAt)}
              </Text>
            </Pressable>
          </View>
          {errors.scheduledTime ? (
            <Text style={styles.errorText}>{errors.scheduledTime}</Text>
          ) : null}
        </View>
      ) : (
        <InputLabel
          label={
            scheduleType === "Recurrent"
              ? "Schedule details"
              : "Schedule details (optional)"
          }
        >
          <TextInput
            value={scheduleDetails}
            onChangeText={setScheduleDetails}
            placeholder={
              scheduleType === "Recurrent"
                ? "e.g. Every Tuesday 18:00–19:00"
                : "e.g. Any weekend morning, flexible"
            }
            placeholderTextColor={colors.GRAY400}
            style={styles.input}
          />
        </InputLabel>
      )}
    </View>
  );

  const renderLocation = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>Location</Text>

      <SegmentRow
        label="Location type"
        value={locationType}
        onChange={(value) => setLocationType(value as "In-Person" | "Online")}
        options={[
          { value: "In-Person", label: "In-person" },
          { value: "Online", label: "Online" },
        ]}
        accent={accent}
      />

      {locationType === "In-Person" ? (
        <>
          <InputLabel
            label={isFixedGroupOffer ? "Exact meeting address" : "Address"}
            error={errors.location}
          >
            <View style={styles.inputRow}>
              <TextInput
                value={locationQuery}
                onChangeText={(value) => {
                  setLocationQuery(value);
                  if (!value.trim()) {
                    setLocationSuggestions([]);
                    setExactLocation(null);
                    if (!isFixedGroupOffer) setPublicLocation(null);
                  }
                }}
                onFocus={() => setLocationInputFocused(true)}
                onBlur={() => setLocationInputFocused(false)}
                selection={locationInputFocused ? undefined : { start: 0, end: 0 }}
                placeholder="Search for an address"
                placeholderTextColor={colors.GRAY400}
                style={[styles.input, styles.inputRowField]}
              />
              {(locationQuery.length > 0 || exactLocation) ? (
                <Pressable
                  onPress={() => {
                    setLocationQuery("");
                    setLocationSuggestions([]);
                    setExactLocation(null);
                    if (!isFixedGroupOffer) setPublicLocation(null);
                    clearError("location");
                  }}
                  style={styles.inputClearBtn}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={18} color={colors.GRAY400} />
                </Pressable>
              ) : null}
            </View>
          </InputLabel>

          {loadingLocations ? (
            <Text style={styles.helperText}>Searching addresses...</Text>
          ) : null}

          {locationSuggestions.length > 0 ? (
            <View style={styles.dropdown}>
              {locationSuggestions.map((item) => (
                <Pressable
                  key={`${item.lat}-${item.lng}-${item.fullAddress}`}
                  style={styles.dropdownItem}
                  onPress={() => applyResolvedLocation(item)}
                >
                  <Text style={styles.dropdownTitle}>{item.fullAddress ?? item.label}</Text>
                  <Text style={styles.dropdownSubtitle}>{item.district ?? item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <LocationCard
            title={isFixedGroupOffer ? "Address privacy" : "Address tools"}
            subtitle={
              exactLocation?.fullAddress ??
              "Search for the address above, then refine it on the map if needed."
            }
            onMapPress={() => setShowMapPicker(true)}
            onCurrentLocation={useCurrentLocation}
          />

          {exactLocation ? (
            <View style={styles.selectedLocationCard}>
              <Text style={styles.selectedLocationTitle}>Selected address</Text>
              <Text style={styles.selectedLocationBody}>
                {exactLocation.fullAddress ?? exactLocation.label}
              </Text>
              <Text style={styles.selectedLocationMeta}>
                {exactLocation.lat.toFixed(5)}, {exactLocation.lng.toFixed(5)}
              </Text>
            </View>
          ) : null}

          {isFixedGroupOffer && publicLocation ? (
            <View style={styles.privacyCard}>
              <Text style={styles.privacyTitle}>Privacy note</Text>
              <Text style={styles.privacyBody}>
                Public listing area: {publicLocation.label}
              </Text>
              <Text style={styles.privacyBody}>
                Approved participants only can see the exact location.
              </Text>
            </View>
          ) : null}

          {isFixedGroupOffer ? (
            <InputLabel label="Location guide (optional)">
              <TextInput
                value={locationGuide}
                onChangeText={setLocationGuide}
                placeholder="e.g. Blue entrance on the left side of the building"
                placeholderTextColor={colors.GRAY400}
                style={styles.input}
              />
            </InputLabel>
          ) : null}
        </>
      ) : (
        <InputLabel
          label={isFixedGroupOffer ? "Meeting link / platform" : "Online service"}
          error={errors.onlineLocation}
        >
          <TextInput
            value={onlineLocation}
            onChangeText={(value) => {
              setOnlineLocation(value);
              clearError("onlineLocation");
            }}
            placeholder={
              isFixedGroupOffer
                ? "e.g. Zoom / Meet / Discord link"
                : "This field is only required for fixed online group offers."
            }
            placeholderTextColor={colors.GRAY400}
            style={styles.input}
            editable={isFixedGroupOffer}
          />
        </InputLabel>
      )}

      {!tokenAvailable ? (
        <Text style={styles.helperText}>
          A Mapbox token is required for address search and reverse geocoding.
        </Text>
      ) : null}
    </View>
  );

  const renderTagsAndMedia = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>Tags and media</Text>

      <InputLabel label="Search or create tags">
        <TextInput
          value={tagQuery}
          onChangeText={setTagQuery}
          placeholder="e.g. cooking, language, photography"
          placeholderTextColor={colors.GRAY400}
          style={styles.input}
        />
      </InputLabel>

      {loadingTags ? <Text style={styles.helperText}>Loading tag suggestions...</Text> : null}

      <View style={styles.chipWrap}>
        {tagSuggestions.map((tag) => (
          <Pressable
            key={tag.id}
            style={[styles.chip, { backgroundColor: accentLight }]}
            onPress={() => addTag(tag)}
          >
            <Text style={[styles.chipText, { color: accent }]}>{tag.name}</Text>
          </Pressable>
        ))}
        {tagQuery.trim().length >= 2 ? (
          <Pressable style={[styles.chip, styles.customChip]} onPress={addCustomTag}>
            <Ionicons name="add" size={14} color={colors.GRAY700} />
            <Text style={styles.customChipText}>Create tag: {tagQuery.trim()}</Text>
          </Pressable>
        ) : null}
      </View>

      {selectedTags.length > 0 ? (
        <>
          <Text style={styles.fieldLabel}>Selected tags</Text>
          <View style={styles.chipWrap}>
            {selectedTags.map((tag) => (
              <Pressable
                key={tag.id}
                style={[styles.chip, styles.selectedChip]}
                onPress={() =>
                  setSelectedTags((prev) => prev.filter((item) => item.id !== tag.id))
                }
              >
                <Text style={styles.selectedChipText}>#{tag.name}</Text>
                <Ionicons name="close" size={14} color={colors.WHITE} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.mediaCard}>
        <View style={styles.mediaHeader}>
          <View style={styles.mediaInfo}>
            <Text style={styles.fieldLabel}>Photos</Text>
            <Text style={styles.helperText}>
              Up to 5 photos. The first one becomes the cover.
            </Text>
          </View>
          <Pressable
            style={[styles.smallButton, { backgroundColor: accent }]}
            onPress={pickImages}
          >
            <Ionicons name="images-outline" size={16} color={colors.WHITE} />
            <Text style={styles.smallButtonText}>Choose</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
        >
          {images.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.imageTile}>
              <Image source={{ uri: image.uri }} style={styles.imagePreview} />
              <View style={styles.imageOverlay}>
                <Text style={styles.imageIndex}>{index === 0 ? "Cover" : `${index + 1}`}</Text>
                <Pressable
                  onPress={() =>
                    setImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Ionicons name="close-circle" size={20} color={colors.WHITE} />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  const renderReview = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionEyebrow}>Review</Text>
      <ReviewRow label="Title" value={title || "—"} />
      <ReviewRow label="Description" value={description || "—"} />
      <ReviewRow label="Duration" value={`${duration || "0"} hour(s)`} />
      <ReviewRow
        label="Participants"
        value={type === "Need" ? "1 participant" : `${maxParticipants || "1"} participants`}
      />
      <ReviewRow label="Location type" value={locationType} />
      <ReviewRow
        label="Location"
        value={
          locationType === "In-Person"
            ? publicLocation?.fullAddress ?? "Not selected"
            : onlineLocation || "Online"
        }
      />
      {isFixedGroupOffer && locationType === "In-Person" ? (
        <ReviewRow label="Exact address" value={exactLocation?.fullAddress ?? "Not selected"} />
      ) : null}
      {(type === "Event" || isFixedGroupOffer) && scheduledAt ? (
        <ReviewRow
          label="Date"
          value={scheduledAt.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
      ) : null}
      {selectedTags.length > 0 ? (
        <ReviewRow
          label="Tags"
          value={selectedTags.map((tag) => `#${tag.name}`).join(", ")}
        />
      ) : null}
      <ReviewRow label="Photos" value={`${images.length} selected`} />
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return renderBasic();
      case 2:
        return renderSchedule();
      case 3:
        return renderLocation();
      case 4:
        return renderTagsAndMedia();
      default:
        return renderReview();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.progressWrap}>
        {STEPS.map((item, index) => (
          <View key={item} style={styles.progressItem}>
            <View
              style={[
                styles.progressDot,
                { backgroundColor: index + 1 <= step ? accent : colors.GRAY200 },
              ]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.progressLabel,
                { color: index + 1 <= step ? colors.GRAY800 : colors.GRAY400 },
              ]}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderStep()}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.backButton}
          onPress={() => (step === 1 ? navigation.goBack() : setStep((prev) => prev - 1))}
        >
          <Text style={styles.backButtonText}>{step === 1 ? "Back" : "Previous"}</Text>
        </Pressable>

        {step < STEPS.length ? (
          <Pressable style={[styles.nextButton, { backgroundColor: accent }]} onPress={goNext}>
            <Text style={styles.nextButtonText}>Continue</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.nextButton,
              { backgroundColor: accent },
              submitting && styles.disabledButton,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.nextButtonText}>
              {submitting
                ? "Saving..."
                : type === "Event"
                  ? "Create event"
                  : type === "Offer"
                    ? "Post offer"
                    : "Post need"}
            </Text>
          </Pressable>
        )}
      </View>

      {pickerMode ? (
        <DateTimePicker
          value={scheduledAt ?? new Date()}
          mode={pickerMode}
          minimumDate={pickerMode === "date" ? new Date() : undefined}
          is24Hour
          onChange={onDateTimeChange}
        />
      ) : null}

      <LeafletLocationPickerModal
        visible={showMapPicker}
        title="Choose location"
        description="Refine the exact address on the map."
        initialValue={exactLocation}
        onClose={() => setShowMapPicker(false)}
        onConfirm={(value) => {
          applyResolvedLocation(value);
          setShowMapPicker(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function InputLabel({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function SegmentRow({
  label,
  value,
  onChange,
  options,
  accent,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  accent: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmentWrap}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              style={[
                styles.segmentButton,
                active && { backgroundColor: accent },
              ]}
              onPress={() => onChange(option.value)}
            >
              <Text
                style={[
                  styles.segmentText,
                  active && { color: colors.WHITE },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LocationCard({
  title,
  subtitle,
  onMapPress,
  onCurrentLocation,
}: {
  title: string;
  subtitle: string;
  onMapPress: () => void;
  onCurrentLocation: () => void;
}) {
  return (
    <View style={styles.locationCard}>
      <Text style={styles.locationCardTitle}>{title}</Text>
      <Text style={styles.locationCardSubtitle}>{subtitle}</Text>
      <View style={styles.locationActionRow}>
        <Pressable style={styles.locationAction} onPress={onMapPress}>
          <Ionicons name="map-outline" size={16} color={colors.GRAY700} />
          <Text style={styles.locationActionText}>Map</Text>
        </Pressable>
        <Pressable style={styles.locationAction} onPress={onCurrentLocation}>
          <Ionicons name="locate-outline" size={16} color={colors.GRAY700} />
          <Text style={styles.locationActionText}>Current location</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function StepperField({
  value,
  onDecrease,
  onIncrease,
  decreaseDisabled,
  increaseDisabled,
}: {
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
}) {
  return (
    <View style={styles.stepperWrap}>
      <Pressable
        style={[styles.stepperButton, decreaseDisabled && styles.stepperButtonDisabled]}
        onPress={onDecrease}
        disabled={decreaseDisabled}
      >
        <Ionicons
          name="remove"
          size={18}
          color={decreaseDisabled ? colors.GRAY400 : colors.GRAY800}
        />
      </Pressable>

      <View style={styles.stepperValueWrap}>
        <Text style={styles.stepperValue}>{value}</Text>
      </View>

      <Pressable
        style={[styles.stepperButton, increaseDisabled && styles.stepperButtonDisabled]}
        onPress={onIncrease}
        disabled={increaseDisabled}
      >
        <Ionicons
          name="add"
          size={18}
          color={increaseDisabled ? colors.GRAY400 : colors.GRAY800}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.GRAY50,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 24,
  },
  heroKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
    letterSpacing: 0.9,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.WHITE,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    color: "rgba(255,255,255,0.88)",
    marginTop: 8,
  },
  progressWrap: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  progressItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionCard: {
    backgroundColor: colors.WHITE,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    marginTop: 8,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.GRAY500,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.GRAY600,
    marginTop: 8,
  },
  infoBanner: {
    borderRadius: 18,
    padding: 14,
    marginTop: 16,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  infoBannerText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  fieldGroup: {
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY700,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.GRAY900,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    minHeight: 52,
  },
  inputRowField: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    minHeight: 52,
    backgroundColor: "transparent",
  },
  inputClearBtn: {
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  stepperWrap: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.GRAY100,
  },
  stepperButtonDisabled: {
    backgroundColor: colors.GRAY50,
  },
  stepperValueWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: colors.RED,
  },
  helperText: {
    fontSize: 12,
    color: colors.GRAY500,
    marginTop: 8,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowInput: {
    flex: 1,
  },
  pickerButton: {
    justifyContent: "center",
  },
  pickerValue: {
    fontSize: 15,
    color: colors.GRAY900,
    fontWeight: "600",
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: colors.GRAY400,
    fontWeight: "500",
  },
  segmentWrap: {
    flexDirection: "row",
    backgroundColor: colors.GRAY100,
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  locationCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.GRAY50,
    padding: 14,
  },
  locationCardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.GRAY900,
  },
  locationCardSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.GRAY600,
    marginTop: 6,
  },
  locationActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  locationAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  locationActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  dropdown: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.GRAY900,
  },
  dropdownSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.GRAY500,
  },
  selectedLocationCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
    padding: 14,
  },
  selectedLocationTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.GRAY700,
  },
  selectedLocationBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: colors.GRAY900,
    fontWeight: "600",
  },
  selectedLocationMeta: {
    marginTop: 6,
    fontSize: 12,
    color: colors.GRAY500,
  },
  privacyCard: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.AMBER_LT,
    padding: 14,
  },
  privacyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.AMBER,
  },
  privacyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 20,
    color: "#92400E",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  customChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GRAY100,
  },
  customChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY700,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.GRAY800,
  },
  selectedChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.WHITE,
  },
  mediaCard: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    padding: 14,
    backgroundColor: colors.GRAY50,
  },
  mediaHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  mediaInfo: {
    flex: 1,
    minWidth: 0,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  smallButtonText: {
    color: colors.WHITE,
    fontSize: 12,
    fontWeight: "800",
  },
  imageRow: {
    gap: 10,
    paddingTop: 12,
  },
  imageTile: {
    width: 112,
    height: 112,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.GRAY200,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  imageOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  imageIndex: {
    backgroundColor: "rgba(17,24,39,0.72)",
    color: colors.WHITE,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "800",
  },
  reviewRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY100,
  },
  reviewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.GRAY500,
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.GRAY900,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.GRAY200,
    backgroundColor: colors.WHITE,
  },
  backButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.WHITE,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.GRAY700,
  },
  nextButton: {
    flex: 1.5,
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.WHITE,
  },
  disabledButton: {
    opacity: 0.65,
  },
});
