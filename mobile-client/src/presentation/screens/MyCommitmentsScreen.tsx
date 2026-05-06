import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useOfflineCommitments } from '../../hooks/useOfflineCommitments';
import OfflineSyncBanner from '../components/OfflineSyncBanner';
import type { Handshake } from '../../api/handshakes';
import { colors } from '../../constants/colors';

// Offline-first surface for #322 — active handshakes plus events the user has
// joined, both readable when the device is offline. Uses the generic
// useCachedFetch hook so any other future "show me my data" screen can adopt
// the same pattern by composing it.

interface SectionRow {
  kind: 'header' | 'item';
  key: string;
  title?: string;
  handshake?: Handshake;
}

function buildRows(payload: { active_handshakes: Handshake[]; joined_events: Handshake[] } | null): SectionRow[] {
  if (!payload) return [];
  const out: SectionRow[] = [];
  if (payload.active_handshakes.length > 0) {
    out.push({ kind: 'header', key: 'h-active', title: 'Active handshakes' });
    for (const h of payload.active_handshakes) {
      out.push({ kind: 'item', key: `h-${h.id}`, handshake: h });
    }
  }
  if (payload.joined_events.length > 0) {
    out.push({ kind: 'header', key: 'h-events', title: 'Joined events' });
    for (const h of payload.joined_events) {
      out.push({ kind: 'item', key: `e-${h.id}`, handshake: h });
    }
  }
  return out;
}

export default function MyCommitmentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = (user as { id?: string } | null)?.id ?? null;
  const state = useOfflineCommitments(userId);
  const rows = buildRows(state.data as any);

  const renderItem = ({ item }: { item: SectionRow }) => {
    if (item.kind === 'header') {
      return <Text style={styles.header}>{item.title}</Text>;
    }
    const h = item.handshake!;
    const onPress = () => {
      const serviceId =
        (typeof h.service === 'string' ? h.service : (h as any).service_id) ?? null;
      if (serviceId) {
        navigation.navigate('ServiceDetail', { id: serviceId });
      }
    };
    return (
      <Pressable onPress={onPress} style={styles.card}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {h.service_title ?? 'Untitled'}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {h.service_type ?? 'Service'} • {h.status}
        </Text>
        {h.counterpart && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            with {h.counterpart.first_name} {h.counterpart.last_name}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <OfflineSyncBanner
        lastSyncedAt={state.lastSyncedAt}
        isFromCache={state.isFromCache}
        isLoading={state.isLoading}
        error={state.error}
        onRefresh={state.refresh}
      />

      {state.isLoading && rows.length === 0 ? (
        <View style={styles.loadingShell}>
          <ActivityIndicator color={colors.GREEN} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyShell}>
          <Text style={styles.emptyTitle}>Nothing scheduled yet</Text>
          <Text style={styles.emptyBody}>
            When you start a handshake or join an event, it will show up here —
            even when you are offline.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(r) => r.key}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={
            <RefreshControl refreshing={state.isLoading} onRefresh={state.refresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  header: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#6B7280',
    marginTop: 14,
    marginBottom: 6,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
  },
});
