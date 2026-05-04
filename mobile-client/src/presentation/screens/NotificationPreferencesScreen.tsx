import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getNotificationPreferences,
  patchNotificationPreferences,
  type NotificationPreferences,
} from '../../api/users';
import { colors } from '../../constants/colors';

interface CategoryRow {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}

const MASTER_ROW: CategoryRow = {
  key: 'push',
  label: 'Push notifications',
  description: 'Master switch — turning this off silences every category below.',
};

const CATEGORY_ROWS: CategoryRow[] = [
  {
    key: 'chat',
    label: 'Chat messages',
    description: 'New messages in your handshakes and group chats.',
  },
  {
    key: 'handshakes',
    label: 'Handshakes',
    description: 'Requests, acceptances, denials, and cancellation status.',
  },
  {
    key: 'services',
    label: 'Service updates',
    description: 'When listings you have joined are edited, reminded, or confirmed.',
  },
  {
    key: 'reputation',
    label: 'Reputation',
    description: 'Positive feedback you receive from other members.',
  },
  {
    key: 'reports',
    label: 'Your reports',
    description: 'Status updates for reports you have filed.',
  },
  {
    key: 'system',
    label: 'Moderation & disputes',
    description: 'Admin warnings, dispute outcomes, and other system messages.',
  },
];

// Defaults map: when a key is missing from the API response, treat it as ON
// so opt-out is the explicit user action.
function valueOf(prefs: NotificationPreferences, key: keyof NotificationPreferences): boolean {
  return prefs[key] !== false;
}

export default function NotificationPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotificationPreferences()
      .then((p) => {
        if (!cancelled) setPrefs(p);
      })
      .catch(() => {
        if (!cancelled) setPrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setKey(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return;
    const optimistic: NotificationPreferences = { ...prefs, [key]: value };
    setPrefs(optimistic);
    setSaving(true);
    try {
      const persisted = await patchNotificationPreferences(optimistic);
      setPrefs(persisted);
    } catch (err) {
      // Revert on failure so the toggle reflects truth.
      setPrefs(prefs);
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!prefs) {
    return (
      <View style={styles.loadingShell}>
        <ActivityIndicator color={colors.GREEN} />
      </View>
    );
  }

  const masterOn = valueOf(prefs, 'push');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Choose which alerts you want delivered to your device. You can still
          read everything in the in-app notifications screen.
        </Text>
      </View>

      <Row
        row={MASTER_ROW}
        value={masterOn}
        onChange={(v) => setKey(MASTER_ROW.key, v)}
        disabled={saving}
      />

      <View style={styles.divider} />

      {CATEGORY_ROWS.map((row) => (
        <Row
          key={row.key}
          row={row}
          value={valueOf(prefs, row.key)}
          onChange={(v) => setKey(row.key, v)}
          disabled={saving || !masterOn}
        />
      ))}
    </ScrollView>
  );
}

interface RowProps {
  row: CategoryRow;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

function Row({ row, value, onChange, disabled }: RowProps) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>{row.label}</Text>
        <Text style={styles.rowDescription}>{row.description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.GREEN, false: '#D1D5DB' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    marginRight: 14,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  rowLabelDisabled: {
    color: '#6B7280',
  },
  rowDescription: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 14,
  },
  loadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
});
