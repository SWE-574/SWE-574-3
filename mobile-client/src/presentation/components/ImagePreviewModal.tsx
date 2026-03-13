import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
};

export default function ImagePreviewModal({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<string>>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);

      requestAnimationFrame(() => {
        flatListRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      });
    }
  }, [visible, initialIndex]);

  const onMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.counter}>
            {images.length > 0 ? `${currentIndex + 1} / ${images.length}` : ""}
          </Text>

          <View style={styles.topBarSpacer} />
        </View>

        <FlatList
          ref={flatListRef}
          data={images}
          keyExtractor={(_, index) => `preview-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <Image source={{ uri: item }} style={styles.image} />
            </View>
          )}
        />

        {images.length > 1 && (
          <View
            style={[
              styles.pagination,
              { bottom: Math.max(24, insets.bottom + 8) },
            ]}
          >
            {images.map((_, index) => (
              <View
                key={`modal-dot-${index}`}
                style={[styles.dot, currentIndex === index && styles.activeDot]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  counter: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  topBarSpacer: {
    width: 42,
    height: 42,
  },

  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },

  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.78,
    resizeMode: "contain",
  },

  pagination: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginHorizontal: 4,
  },

  activeDot: {
    width: 18,
    backgroundColor: "#fff",
  },
});
