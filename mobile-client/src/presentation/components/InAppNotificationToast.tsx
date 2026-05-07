import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useToastStore } from '../../store/useToastStore';
import { navigateToNotificationTarget } from '../../constants/notificationMappings';
import { colors } from '../../constants/colors';

const VISIBLE_MS = 4500;
const SLIDE_MS = 220;
const hiveIcon = require("../../assets/icon.png");

// In-app foreground toast for #370. When the app is open, instead of relying
// on the OS push banner (which Expo suppresses for foreground delivery), we
// render a non-blocking toast above the navigator that taps into the same
// deep-link routing the OS notification tap path uses.
export default function InAppNotificationToast() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const queue = useToastStore((s) => s.queue);
  const shift = useToastStore((s) => s.shift);
  const current = queue[0] ?? null;
  const slide = useRef(new Animated.Value(-200)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!current) return;
    Animated.timing(slide, {
      toValue: 0,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start();

    dismissTimer.current = setTimeout(() => {
      Animated.timing(slide, {
        toValue: -200,
        duration: SLIDE_MS,
        useNativeDriver: true,
      }).start(() => shift());
    }, VISIBLE_MS);

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
        dismissTimer.current = null;
      }
    };
  }, [current?.id, slide, shift]);

  if (!current) return null;

  const primaryText = current.body || current.title;

  const onTap = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (current.payload?.type) {
      navigateToNotificationTarget(
        {
          id: current.payload.notification_id ?? current.id,
          type: current.payload.type as any,
          title: current.title,
          message: current.body ?? '',
          is_read: false,
          related_handshake: current.payload.related_handshake ?? null,
          related_service: current.payload.related_service ?? null,
          created_at: '',
        },
        navigation,
      );
    }
    shift();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          top: insets.top + 8,
          transform: [{ translateY: slide }],
        },
      ]}
    >
      <Pressable onPress={onTap} style={styles.toast}>
        <View style={styles.iconBadge}>
          <Image
            source={hiveIcon}
            style={styles.appIcon}
            resizeMode="cover"
          />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.appLabel}>THE HIVE</Text>
          <Text numberOfLines={2} style={styles.title}>{primaryText}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  toast: {
    backgroundColor: '#1F2937',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  appIcon: {
    width: 38,
    height: 38,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  appLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
});
