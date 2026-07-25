import { getDocumentAsync } from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import {
  getAutoBackupConfig,
  PER_DAY_CHOICES,
  PER_DAY_LABEL,
  runBackupNow,
  setAutoBackupEnabled,
  setBackupsPerDay,
  type AutoBackupConfig,
  type PerDay,
} from '@/modules/backup/auto';
import {
  clearBackupFolder,
  copyToChosenFolder,
  folderLabel,
  getBackupFolder,
  pickBackupFolder,
} from '@/modules/backup/destination';
import { exportBackupByEmail, restoreBackup } from '@/modules/backup/service';
import { getAccount, signOut, type Account } from '@/modules/auth/service';
import { getLockCapability, isLockEnabled, promptUnlock, setLockEnabled } from '@/modules/auth/lock';
import {
  getDefaultTaxMode,
  listSettings,
  setDefaultTaxMode,
  setSetting,
} from '@/modules/settings/service';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { VOICE_LANG_LABEL, type VoiceLang } from '@/modules/voice/types';
import { TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';

// Keys persisted in the settings key/value table.
const KEYS = {
  name: 'business_name',
  gstin: 'business_gstin',
  address: 'business_address',
  phone: 'business_phone',
  prefix: 'sale_prefix',
  backupEmail: 'backup_email',
} as const;

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [prefix, setPrefix] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');
  const [account, setAccount] = useState<Account | null>(null);
  const [lockOn, setLockOn] = useState(false);
  const [lockLabel, setLockLabel] = useState('Screen lock');
  const [lockEnrolled, setLockEnrolled] = useState(false);
  const [auto, setAuto] = useState<AutoBackupConfig | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const { status, lang, speakBack, changeLang, changeSpeakBack, setHelpOpen } = useVoice();

  useVoiceCommands((intent) => {
    if (intent.kind === 'setTaxMode') {
      pickTaxMode(intent.mode);
      return true;
    }
    return false;
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getDefaultTaxMode().then((m) => {
        if (active) setTaxMode(m);
      });
      Promise.all([
        getAccount(),
        isLockEnabled(),
        getLockCapability(),
        getAutoBackupConfig(),
        getBackupFolder(),
      ]).then(([acc, locked, cap, cfg, dir]) => {
        if (!active) return;
        setAccount(acc);
        setLockOn(locked);
        setLockLabel(cap.label);
        setLockEnrolled(cap.enrolled);
        setAuto(cfg);
        setFolder(dir);
      });
      listSettings().then((rows) => {
        if (!active) return;
        const map = new Map(rows.map((r) => [r.key, r.value ?? '']));
        setName(map.get(KEYS.name) ?? '');
        setGstin(map.get(KEYS.gstin) ?? '');
        setAddress(map.get(KEYS.address) ?? '');
        setPhone(map.get(KEYS.phone) ?? '');
        setPrefix(map.get(KEYS.prefix) ?? '');
        setBackupEmail(map.get(KEYS.backupEmail) ?? '');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const saveProfile = async () => {
    setSaving(true);
    try {
      await Promise.all([
        setSetting(KEYS.name, name.trim()),
        setSetting(KEYS.gstin, gstin.trim()),
        setSetting(KEYS.address, address.trim()),
        setSetting(KEYS.phone, phone.trim()),
        setSetting(KEYS.prefix, prefix.trim()),
        setSetting(KEYS.backupEmail, backupEmail.trim()),
      ]);
      Alert.alert('Saved', 'Business profile updated. It will appear on invoice PDFs.');
    } catch (e) {
      Alert.alert('Could not save', (e as Error)?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const pickTaxMode = (mode: TaxMode) => {
    setTaxMode(mode);
    void setDefaultTaxMode(mode);
  };

  // Turning the lock ON asks for the phone's unlock first — otherwise a stranger
  // holding the phone could enable it and lock the real owner out.
  const toggleLock = async (next: boolean) => {
    if (next && !lockEnrolled) {
      Alert.alert(
        'No screen lock set',
        'Set a fingerprint, PIN or pattern in your phone Settings first, then enable this.',
      );
      return;
    }
    if (next && !(await promptUnlock())) return;
    setLockOn(next);
    await setLockEnabled(next);
  };

  const toggleAuto = async (next: boolean) => {
    setAuto((a) => (a ? { ...a, enabled: next } : a));
    await setAutoBackupEnabled(next);
  };

  const pickPerDay = async (perDay: PerDay) => {
    setAuto((a) => (a ? { ...a, perDay } : a));
    await setBackupsPerDay(perDay);
  };

  const chooseFolder = async () => {
    try {
      setFolder(await pickBackupFolder());
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if (!/cancel/i.test(msg)) Alert.alert('Could not set folder', msg);
    }
  };

  const forgetFolder = async () => {
    await clearBackupFolder();
    setFolder(null);
  };

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const res = await runBackupNow(new Date().toISOString(), copyToChosenFolder);
      setAuto(await getAutoBackupConfig());
      Alert.alert('Backup done', res.message);
    } catch (e) {
      Alert.alert('Backup failed', (e as Error)?.message ?? String(e));
    } finally {
      setBackingUp(false);
    }
  };

  const doSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password to get back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          Alert.alert('Signed out', 'Close and reopen the app to sign in again.');
        },
      },
    ]);
  };

  const exportBackup = async () => {
    setExporting(true);
    try {
      await exportBackupByEmail(new Date().toISOString());
    } catch (e) {
      Alert.alert('Backup failed', (e as Error)?.message ?? String(e));
    } finally {
      setExporting(false);
    }
  };

  const restore = async () => {
    const res = await getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    Alert.alert(
      'Restore and overwrite?',
      `This will DELETE all current data and replace it with "${asset.name}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const counts = await restoreBackup(asset.uri);
              Alert.alert(
                'Restored',
                `${counts.parties} parties, ${counts.items} items, ${counts.invoices} invoices, ${counts.payments} payments loaded.`,
              );
            } catch (e) {
              Alert.alert('Restore failed', (e as Error)?.message ?? String(e));
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Business profile</Text>
        <Text style={styles.sectionHint}>Shown on the invoice PDFs you share.</Text>
        <TextField label="Business name" value={name} onChangeText={setName} placeholder="My Business" />
        <TextField
          label="GSTIN"
          value={gstin}
          onChangeText={setGstin}
          placeholder="15-digit GST number"
          autoCapitalize="characters"
        />
        <TextField label="Address" value={address} onChangeText={setAddress} placeholder="Business address" multiline />
        <TextField
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="Contact number"
          keyboardType="phone-pad"
        />
        <TextField
          label="Invoice prefix (sales)"
          value={prefix}
          onChangeText={setPrefix}
          placeholder="INV"
          autoCapitalize="characters"
        />
        <Text style={styles.sectionHint}>
          Sale invoices are numbered like {`{prefix}`}/2026-27/001. Leave blank for “INV”.
        </Text>

        <Button label="Save profile" onPress={saveProfile} loading={saving} style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>GST entry method</Text>
        <Text style={styles.sectionHint}>
          The default for new bills. Counter shops usually price with GST already inside the rate;
          B2B invoicing usually adds it on top. You can still flip it on any single invoice.
        </Text>
        <View style={styles.optionRow}>
          {(['exclusive', 'inclusive'] as TaxMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.option, taxMode === mode && styles.optionOn]}
              onPress={() => pickTaxMode(mode)}
            >
              <Text style={[styles.optionText, taxMode === mode && styles.optionTextOn]}>
                {TAX_MODE_LABEL[mode]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionHint}>
          {taxMode === 'inclusive'
            ? 'Example: ₹118 rate at 18% → taxable ₹100 + GST ₹18. Customer pays ₹118.'
            : 'Example: ₹100 rate at 18% → GST ₹18. Customer pays ₹118.'}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Voice commands — குரல் கட்டளை</Text>
        <Text style={styles.sectionHint}>
          {status.available
            ? 'Tap the 🎙 button on any screen and speak. Say “உதவி” / “help” for the full list.'
            : 'Not available in Expo Go — the microphone needs the development build. See VOICE-SETUP.md.'}
        </Text>
        <View style={styles.optionRow}>
          {(['ta-IN', 'en-IN'] as VoiceLang[]).map((l) => (
            <Pressable
              key={l}
              style={[styles.option, lang === l && styles.optionOn]}
              onPress={() => changeLang(l)}
            >
              <Text style={[styles.optionText, lang === l && styles.optionTextOn]}>
                {VOICE_LANG_LABEL[l]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, speakBack && styles.optionOn]}
            onPress={() => changeSpeakBack(!speakBack)}
          >
            <Text style={[styles.optionText, speakBack && styles.optionTextOn]}>
              {speakBack ? '🔊  Speaks confirmations' : '🔇  Silent confirmations'}
            </Text>
          </Pressable>
        </View>
        <Button
          label="What can I say?"
          tone="ghost"
          onPress={() => setHelpOpen(true)}
          style={styles.save}
        />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Account &amp; lock</Text>
        {account ? (
          <Text style={styles.sectionHint}>
            {account.username} · {account.email}
            {'\n'}Stored only on this phone — restoring a backup never changes your login.
          </Text>
        ) : null}
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, lockOn && styles.optionOn]}
            onPress={() => toggleLock(!lockOn)}
          >
            <Text style={[styles.optionText, lockOn && styles.optionTextOn]}>
              {lockOn ? `🔒  App lock on — ${lockLabel}` : `🔓  App lock off`}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {lockEnrolled
            ? 'Asks for your phone’s fingerprint/PIN when the app opens and each time you come back to it.'
            : 'Set a fingerprint, PIN or pattern on your phone first to use this.'}
        </Text>
        <Button label="Sign out" tone="ghost" onPress={doSignOut} style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Automatic backup</Text>
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, auto?.enabled && styles.optionOn]}
            onPress={() => toggleAuto(!auto?.enabled)}
          >
            <Text style={[styles.optionText, auto?.enabled && styles.optionTextOn]}>
              {auto?.enabled ? '✓  Automatic backup on' : 'Automatic backup off'}
            </Text>
          </Pressable>
        </View>

        {auto?.enabled ? (
          <>
            <Text style={styles.sectionHint}>How many times a day?</Text>
            <View style={styles.optionRow}>
              {PER_DAY_CHOICES.map((n) => (
                <Pressable
                  key={n}
                  style={[styles.chip, auto.perDay === n && styles.optionOn]}
                  onPress={() => pickPerDay(n)}
                >
                  <Text style={[styles.optionText, auto.perDay === n && styles.optionTextOn]}>
                    {n}×
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.sectionHint}>{PER_DAY_LABEL[auto.perDay]}</Text>

            <Text style={styles.sectionHint}>
              Backups are always saved on the phone (last 10 kept). Pick a folder that Google Drive
              syncs and each backup lands in your Drive automatically — no login needed.
            </Text>
            <View style={styles.optionRow}>
              <Pressable style={[styles.option, !!folder && styles.optionOn]} onPress={chooseFolder}>
                <Text style={[styles.optionText, !!folder && styles.optionTextOn]}>
                  {folder ? `📁  ${folderLabel(folder)}` : '📁  Choose a sync folder (optional)'}
                </Text>
              </Pressable>
            </View>
            {folder ? (
              <Pressable onPress={forgetFolder} hitSlop={8}>
                <Text style={styles.linkDanger}>Remove folder — keep backups on phone only</Text>
              </Pressable>
            ) : null}

            <Text style={styles.sectionHint}>
              {auto.lastAt
                ? `Last backup: ${new Date(auto.lastAt).toLocaleString()}\n${auto.lastResult ?? ''}`
                : 'No automatic backup has run yet.'}
            </Text>
            <Text style={styles.sectionHint}>
              Android stops apps in the background, so a due backup runs the next time you open the
              app (and while it stays open).
            </Text>
          </>
        ) : null}

        <Button label="Back up now" onPress={backupNow} loading={backingUp} tone="ghost" style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Manual backup &amp; restore</Text>
        <Text style={styles.sectionHint}>
          Export emails a JSON copy of all your data. Restore replaces everything from a backup file.
        </Text>
        <TextField
          label="Backup email (optional)"
          value={backupEmail}
          onChangeText={setBackupEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Button
          label="Export backup (email)"
          onPress={exportBackup}
          loading={exporting}
          tone="ghost"
          style={styles.save}
        />
        <Button
          label="Restore from file"
          onPress={restore}
          loading={restoring}
          tone="danger"
          style={styles.save}
        />

        <Text style={styles.version}>Billing App v1.0.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  sectionHint: { fontSize: 12, color: '#888', marginTop: -8 },
  save: { marginTop: 4 },
  optionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  option: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minWidth: 52,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkDanger: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  optionOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  optionText: { fontSize: 14, color: '#555', fontWeight: '600', textAlign: 'center' },
  optionTextOn: { color: '#208AEF' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginVertical: 12 },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 16 },
});
