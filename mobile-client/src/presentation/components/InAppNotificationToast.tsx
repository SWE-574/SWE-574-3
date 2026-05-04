import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useToastStore } from '../../store/useToastStore';
import { navigateToNotificationTarget } from '../../constants/notificationMappings';

const VISIBLE_MS = 4500;
const SLIDE_MS = 220;

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
        <Text numberOfLines={1} style={styles.title}>{current.title}</Text>
        {current.body ? (
          <Text numberOfLines={2} style={styles.body}>{current.body}</Text>
        ) : null}
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
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  body: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 17,
  },
});
