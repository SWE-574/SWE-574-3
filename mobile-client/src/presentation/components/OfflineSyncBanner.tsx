import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatLastSynced } from '../../cache/offlineCache';

interface Props {
  /** Epoch ms of the last successful sync. Null hides the banner entirely. */
  lastSyncedAt: number | null;
  /** True when the rendered list came from disk (so we tell the user). */
  isFromCache: boolean;
  /** True while a fetch is in-flight; we show a small spinner. */
  isLoading: boolean;
  /** Optional: the most recent error string from the fetcher. */
  error: string | null;
  onRefresh: () => void;
}

// Tiny banner that sits at the top of an offline-cached list (#322).
// Tapping it triggers a manual refresh; the relative time auto-updates
// every 30s so a stale "1 min ago" doesn't sit there forever.
export default function OfflineSyncBanner({
  lastSyncedAt,
  isFromCache,
  isLoading,
  error,
  onRefresh,
}: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    if (lastSyncedAt == null) return;
    const id = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  if (lastSyncedAt == null && !error) return null;

  const status =
    error
      ? `Couldn't refresh. Showing cached data from ${formatLastSynced(lastSyncedAt ?? Date.now())}.`
      : isFromCache
        ? `Cached. Last synced ${formatLastSynced(lastSyncedAt!)}.`
        : `Up to date. Synced ${formatLastSynced(lastSyncedAt!)}.`;

  return (
    <Pressable
      onPress={onRefresh}
      style={[
        styles.row,
        error ? styles.rowError : isFromCache ? styles.rowCached : styles.rowFresh,
      ]}
    >
      <Text style={[styles.text, error && styles.textError]} numberOfLines={2}>
        {status}
      </Text>
      {isLoading ? (
        <ActivityIndicator size="small" color={error ? '#B45309' : '#374151'} />
      ) : (
        <View style={styles.dot} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
  },
  rowFresh: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  rowCached: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  rowError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    marginRight: 10,
  },
  textError: {
    color: '#991B1B',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
  },
});
