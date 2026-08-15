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
import SelectField from '@/components/SelectField';
import TextField from '@/components/TextField';
import {
  getAutoBackupConfig,
  PER_DAY_CHOICES,
  PER_DAY_LABEL,
  runBackupNow,
  setAutoBackupEnabled,
  setBackupOnExit,
  setBackupsPerDay,
  type AutoBackupConfig,
  type PerDay,
} from '@/modules/backup/auto';
import DriveRestorePicker from '@/modules/backup/DriveRestorePicker';
import {
  backupToDriveNow,
  connectDrive,
  disconnectDrive,
  getClientId,
  getDriveStatus,
  setClientId,
  type DriveStatus,
} from '@/modules/backup/drive';
import { BACKUP_UPLOADERS } from '@/modules/backup/useAutoBackup';
import { backupJson, restoreBackup, shareBackupFile } from '@/modules/backup/service';
import { getAccount, signOut, type Account } from '@/modules/auth/service';
import { getLockCapability, isLockEnabled, promptUnlock, setLockEnabled } from '@/modules/auth/lock';
import LicenseCard from '@/modules/license/LicenseCard';
import {
  getDefaultTaxMode,
  listSettings,
  setDefaultTaxMode,
  setSetting,
} from '@/modules/settings/service';
import { matchOption } from '@/modules/voice/match';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { VOICE_LANG_LABEL, type VoiceLang } from '@/modules/voice/types';
import { INDIAN_STATES } from '@/utils/constants';
import { TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';

// Keys persisted in the settings key/value table.
const KEYS = {
  name: 'business_name',
  gstin: 'business_gstin',
  address: 'business_address',
  // The shop's own state. Decides whether a bill prints CGST+SGST (buyer in the
  // same state) or IGST (buyer elsewhere), so it belongs to the profile, not to
  // any one invoice.
  state: 'business_state',
  phone: 'business_phone',
  prefix: 'sale_prefix',
} as const;

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [bizState, setBizState] = useState('');
  const [phone, setPhone] = useState('');
  const [prefix, setPrefix] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');
  const [account, setAccount] = useState<Account | null>(null);
  const [lockOn, setLockOn] = useState(false);
  const [lockLabel, setLockLabel] = useState('Screen lock');
  const [lockEnrolled, setLockEnrolled] = useState(false);
  const [auto, setAuto] = useState<AutoBackupConfig | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [clientId, setClientIdInput] = useState('');
  const [showClientId, setShowClientId] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [drivePicker, setDrivePicker] = useState(false);
  const { status, lang, speakBack, changeLang, changeSpeakBack, setHelpOpen } = useVoice();

  // Voice: every button and field on this screen — "பேக்அப்", "லாக் ஆன்",
  // "ஜிஎஸ்டின் 33ABC…", "பெயர் பென்சிஸ்", "சேமி", "சைன் அவுட்".
  useVoiceCommands((intent) => {
    if (intent.kind === 'setTaxMode') {
      pickTaxMode(intent.mode);
      return true;
    }
    if (intent.kind === 'submit') {
      void saveProfile();
      return true;
    }
    if (intent.kind === 'setField') {
      switch (intent.field) {
        case 'name':
          setName(intent.value);
          return true;
        case 'gstin':
          setGstin(intent.value);
          return true;
        case 'address':
          setAddress(intent.value);
          return true;
        case 'state':
          setBizState(matchOption(intent.value, INDIAN_STATES) ?? intent.value);
          return true;
        case 'phone':
          setPhone(intent.value);
          return true;
        case 'prefix':
          setPrefix(intent.value);
          return true;
        default:
          return false;
      }
    }
    if (intent.kind !== 'action') return false;
    switch (intent.action) {
      case 'backup':
        void backupNow();
        return lang === 'ta-IN' ? 'பேக்அப் ஆகுது' : 'Backing up';
      case 'restore':
        void restore();
        return lang === 'ta-IN' ? 'ரீஸ்டோர் கோப்பை தேர்ந்தெடுங்க' : 'Pick a backup file';
      case 'signOut':
        doSignOut();
        return true;
      case 'lockOn':
        void toggleLock(true);
        return lang === 'ta-IN' ? 'பூட்டு ஆன்' : 'Lock on';
      case 'lockOff':
        void toggleLock(false);
        return lang === 'ta-IN' ? 'பூட்டு ஆஃப்' : 'Lock off';
      case 'autoBackupOn':
        void toggleAuto(true);
        return lang === 'ta-IN' ? 'தானியங்கி பேக்அப் ஆன்' : 'Automatic backup on';
      case 'autoBackupOff':
        void toggleAuto(false);
        return lang === 'ta-IN' ? 'தானியங்கி பேக்அப் ஆஃப்' : 'Automatic backup off';
      default:
        return false;
    }
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
        getDriveStatus(),
        getClientId(),
      ]).then(([acc, locked, cap, cfg, driveStatus, id]) => {
        if (!active) return;
        setAccount(acc);
        setLockOn(locked);
        setLockLabel(cap.label);
        setLockEnrolled(cap.enrolled);
        setAuto(cfg);
        setDrive(driveStatus);
        setClientIdInput(id);
      });
      listSettings().then((rows) => {
        if (!active) return;
        const map = new Map(rows.map((r) => [r.key, r.value ?? '']));
        setName(map.get(KEYS.name) ?? '');
        setGstin(map.get(KEYS.gstin) ?? '');
        setAddress(map.get(KEYS.address) ?? '');
        setBizState(map.get(KEYS.state) ?? '');
        setPhone(map.get(KEYS.phone) ?? '');
        setPrefix(map.get(KEYS.prefix) ?? '');
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
        setSetting(KEYS.state, bizState.trim()),
        setSetting(KEYS.phone, phone.trim()),
        setSetting(KEYS.prefix, prefix.trim()),
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

  const toggleOnExit = async (next: boolean) => {
    setAuto((a) => (a ? { ...a, onExit: next } : a));
    await setBackupOnExit(next);
  };

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const res = await runBackupNow(new Date().toISOString(), BACKUP_UPLOADERS);
      setAuto(await getAutoBackupConfig());
      Alert.alert('Backup done', res.message);
    } catch (e) {
      Alert.alert('Backup failed', (e as Error)?.message ?? String(e));
    } finally {
      setBackingUp(false);
    }
  };

  // ── Google Drive ───────────────────────────────────────────────────────────

  const saveClientId = async () => {
    await setClientId(clientId);
    setDrive(await getDriveStatus());
  };

  const connect = async () => {
    setDriveBusy(true);
    try {
      const email = await connectDrive();
      setDrive(await getDriveStatus());
      if (email) {
        Alert.alert(
          'Google Drive connected',
          `Backups will go to ${email}. Sign in with this same account after a reinstall to get your data back.`,
        );
      }
    } catch (e) {
      Alert.alert('Could not connect', (e as Error)?.message ?? String(e));
    } finally {
      setDriveBusy(false);
    }
  };

  const disconnect = () => {
    Alert.alert(
      'Disconnect Google Drive?',
      'Backups already in Drive stay there. New backups will only be kept on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnectDrive();
            setDrive(await getDriveStatus());
          },
        },
      ],
    );
  };

  const driveBackupNow = async () => {
    setDriveBusy(true);
    try {
      const now = new Date().toISOString();
      const name = await backupToDriveNow(now, await backupJson(now));
      Alert.alert('Uploaded', `${name} is in your Google Drive.`);
    } catch (e) {
      Alert.alert('Upload failed', (e as Error)?.message ?? String(e));
    } finally {
      setDriveBusy(false);
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
      await shareBackupFile(new Date().toISOString());
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
        <SelectField
          label="State"
          value={bizState}
          onSelect={setBizState}
          options={INDIAN_STATES}
          placeholder="Select state"
        />
        <Text style={styles.sectionHint}>
          Your own state. A bill to the same state prints CGST + SGST; anywhere else prints IGST.
        </Text>
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

        <Text style={styles.sectionTitle}>Licence</Text>
        <Text style={styles.sectionHint}>
          This copy is tied to this phone. Send the System ID to your vendor to renew.
        </Text>
        <LicenseCard />

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
              Each run saves a snapshot on the phone (last 10 kept) and uploads it to Google Drive
              when an account is connected below.
            </Text>

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

        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, auto?.onExit && styles.optionOn]}
            onPress={() => toggleOnExit(!auto?.onExit)}
          >
            <Text style={[styles.optionText, auto?.onExit && styles.optionTextOn]}>
              {auto?.onExit ? '✓  Ask to back up when closing' : 'Do not ask when closing'}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          Pressing back to close the app asks whether to back up first, so a day’s billing is never
          left only on the phone overnight.
        </Text>

        <Button label="Back up now" onPress={backupNow} loading={backingUp} tone="ghost" style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Google Drive backup</Text>
        <Text style={styles.sectionHint}>
          Like WhatsApp: sign in once and every backup goes to your own Google Drive. After a
          reinstall, sign in with the same account and your data comes straight back.
        </Text>

        {drive?.connected ? (
          <>
            <View style={styles.optionRow}>
              <Pressable style={[styles.option, styles.optionOn]} onPress={disconnect}>
                <Text style={[styles.optionText, styles.optionTextOn]}>
                  ✓  {drive.email ?? 'Google account connected'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              Backups live in a “Benesys Billing Backups” folder in that account. The app can only
              see the files it made there — nothing else in your Drive.
            </Text>
            <Button
              label="Back up to Drive now"
              onPress={driveBackupNow}
              loading={driveBusy}
              tone="ghost"
              style={styles.save}
            />
            <Button
              label="Restore from Drive"
              onPress={() => setDrivePicker(true)}
              tone="danger"
              style={styles.save}
            />
            <Pressable onPress={disconnect} hitSlop={8}>
              <Text style={styles.linkDanger}>Disconnect this Google account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Button
              label="Sign in with Google"
              onPress={connect}
              loading={driveBusy}
              style={styles.save}
            />
            <Text style={styles.sectionHint}>
              {drive?.configured
                ? 'Nothing leaves the phone until you sign in.'
                : 'Needs a one-time Google client ID — see DRIVE-SETUP.md, then paste it below.'}
            </Text>
          </>
        )}

        <Pressable onPress={() => setShowClientId((v) => !v)} hitSlop={8}>
          <Text style={styles.link}>
            {showClientId ? 'Hide Google client ID' : 'Google client ID (advanced)'}
          </Text>
        </Pressable>
        {showClientId ? (
          <>
            <TextField
              label="Google OAuth client ID"
              value={clientId}
              onChangeText={setClientIdInput}
              onBlur={saveClientId}
              placeholder="…apps.googleusercontent.com"
              autoCapitalize="none"
            />
            <Text style={styles.sectionHint}>
              From your own Google Cloud project (Android client, package com.benesys.billingapp).
              Steps are in DRIVE-SETUP.md. Not a secret — Android clients have none.
            </Text>
          </>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Local backup &amp; restore</Text>
        <Text style={styles.sectionHint}>
          Save a JSON copy of everything wherever you like — a memory card, Drive, WhatsApp to
          yourself. Restore replaces everything from such a file.
        </Text>
        <Button
          label="Save backup file"
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

      <DriveRestorePicker
        visible={drivePicker}
        onClose={() => setDrivePicker(false)}
        onRestored={() => void getAutoBackupConfig().then(setAuto)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  subTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 6 },
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
  link: { color: '#208AEF', fontSize: 13, fontWeight: '600' },
  linkDanger: { color: '#c0392b', fontSize: 13, fontWeight: '600' },
  optionOn: { borderColor: '#208AEF', backgroundColor: '#eef6ff' },
  optionText: { fontSize: 14, color: '#555', fontWeight: '600', textAlign: 'center' },
  optionTextOn: { color: '#208AEF' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd', marginVertical: 12 },
  version: { textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 16 },
});
