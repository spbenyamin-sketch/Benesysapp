import { getDocumentAsync } from 'expo-document-picker';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  Alert,
  Image,
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
import ServerBackupSection from '@/components/ServerBackupSection';
import StaffSection from '@/components/StaffSection';
import TextField from '@/components/TextField';
import { APP_LANG_LABEL, t, type AppLang } from '@/i18n';
import { useAppLang } from '@/i18n/I18nProvider';
import {
  deleteBrandImage,
  pickBrandImage,
  type BrandImage,
} from '@/modules/settings/brandImages';
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
  getPrintFormat,
  listSettings,
  parseSaleStartNo,
  PRINT_FORMAT_LABEL,
  SALE_START_KEY,
  setDefaultTaxMode,
  setPrintFormat,
  setSaleStartNo,
  setSetting,
  type PrintFormat,
} from '@/modules/settings/service';
import { matchOption } from '@/modules/voice/match';
import { useVoice, useVoiceCommands } from '@/modules/voice/VoiceProvider';
import { VOICE_LANG_LABEL, type VoiceLang } from '@/modules/voice/types';
import { INDIAN_STATES } from '@/utils/constants';
import { TAX_MODE_LABEL, type TaxMode } from '@/utils/gst';
import { financialYear } from '@/utils/invoiceNumber';
import { getSession } from '@/web/session';

// Keys persisted in the settings key/value table.
/** The web app is Online mode: no phone lock, licence file, backups or voice. */
const isWeb = Platform.OS === 'web';

/**
 * Online mode: the server refuses a staff member's changes to the shop's
 * profile, print, tax and numbering settings, so the controls are not offered.
 * The phone (Offline mode) is always its owner.
 */
function canEditShop(): boolean {
  return !isWeb || getSession()?.user.role === 'owner';
}

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
  // What the printed bill carries beyond the numbers: the shop's mark at the
  // top, its signature at the foot, its terms, and a code to pay it by.
  logo: 'business_logo',
  signature: 'business_signature',
  terms: 'invoice_terms',
  upi: 'business_upi',
} as const;

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [bizState, setBizState] = useState('');
  const [phone, setPhone] = useState('');
  const [prefix, setPrefix] = useState('');
  // Where this year's sale numbers carry on from — '' = from 001 as usual.
  const [startNo, setStartNo] = useState('');
  const [logo, setLogo] = useState('');
  const [signature, setSignature] = useState('');
  const [terms, setTerms] = useState('');
  const [upi, setUpi] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [taxMode, setTaxMode] = useState<TaxMode>('exclusive');
  const [paper, setPaper] = useState<PrintFormat>('a4');
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
  const { status, lang, speakBack, enabled, changeLang, changeSpeakBack, changeEnabled, setHelpOpen } =
    useVoice();
  const { lang: appLang, setLang: setAppLang } = useAppLang();
  const shopEditable = canEditShop();

  // Voice: every button and field on this screen — "பேக்அப்", "லாக் ஆன்",
  // "ஜிஎஸ்டின் 33ABC…", "பெயர் பென்சிஸ்", "சேமி", "சைன் அவுட்".
  useVoiceCommands((intent) => {
    if (intent.kind === 'setTaxMode') {
      if (!shopEditable) return false;
      pickTaxMode(intent.mode);
      return true;
    }
    if (intent.kind === 'submit') {
      if (!shopEditable) return false;
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
      getPrintFormat().then((f) => {
        if (active) setPaper(f);
      });
      // In a browser only the account applies: the lock, backups and Drive all
      // read the phone's secure store, which the web build doesn't have.
      if (isWeb) {
        getAccount().then((acc) => {
          if (active) setAccount(acc);
        });
      } else Promise.all([
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
        // A starting number set for an earlier year no longer applies, so it
        // is not shown either.
        const start = parseSaleStartNo(map.get(SALE_START_KEY));
        setStartNo(start && start.fy === financialYear(new Date()).label ? String(start.from) : '');
        setLogo(map.get(KEYS.logo) ?? '');
        setSignature(map.get(KEYS.signature) ?? '');
        setTerms(map.get(KEYS.terms) ?? '');
        setUpi(map.get(KEYS.upi) ?? '');
      });
      return () => {
        active = false;
      };
    }, []),
  );

  /**
   * Pick a logo or a signature. The old file is deleted as soon as a new one is
   * chosen — these live in the app's own storage and would otherwise pile up
   * inside every backup.
   */
  const chooseBrandImage = async (kind: BrandImage) => {
    try {
      const picked = await pickBrandImage(kind);
      if (!picked) return;
      const previous = kind === 'logo' ? logo : signature;
      if (kind === 'logo') setLogo(picked);
      else setSignature(picked);
      await setSetting(kind === 'logo' ? KEYS.logo : KEYS.signature, picked);
      if (previous && previous !== picked) deleteBrandImage(previous);
    } catch (e) {
      Alert.alert(t('Could not use that image'), (e as Error)?.message ?? String(e));
    }
  };

  const clearBrandImage = async (kind: BrandImage) => {
    const previous = kind === 'logo' ? logo : signature;
    if (kind === 'logo') setLogo('');
    else setSignature('');
    await setSetting(kind === 'logo' ? KEYS.logo : KEYS.signature, '');
    deleteBrandImage(previous);
  };

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
        setSaleStartNo(financialYear(new Date()).label, parseInt(startNo.trim(), 10) || null),
        setSetting(KEYS.logo, logo),
        setSetting(KEYS.signature, signature),
        setSetting(KEYS.terms, terms.trim()),
        setSetting(KEYS.upi, upi.trim()),
      ]);
      Alert.alert(t('Saved'), t('Business profile updated. It will appear on invoice PDFs.'));
    } catch (e) {
      Alert.alert(t('Could not save'), (e as Error)?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const pickTaxMode = (mode: TaxMode) => {
    setTaxMode(mode);
    void setDefaultTaxMode(mode);
  };

  const pickPaper = (format: PrintFormat) => {
    setPaper(format);
    void setPrintFormat(format);
  };

  // Turning the lock ON asks for the phone's unlock first — otherwise a stranger
  // holding the phone could enable it and lock the real owner out.
  const toggleLock = async (next: boolean) => {
    if (next && !lockEnrolled) {
      Alert.alert(
        t('No screen lock set'),
        t('Set a fingerprint, PIN or pattern in your phone Settings first, then enable this.'),
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
      Alert.alert(t('Backup done'), res.message);
    } catch (e) {
      Alert.alert(t('Backup failed'), (e as Error)?.message ?? String(e));
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
          t('Google Drive connected'),
          t('Backups will go to {email}. Sign in with this same account after a reinstall to get your data back.', { email }),
        );
      }
    } catch (e) {
      Alert.alert(t('Could not connect'), (e as Error)?.message ?? String(e));
    } finally {
      setDriveBusy(false);
    }
  };

  const disconnect = () => {
    Alert.alert(
      t('Disconnect Google Drive?'),
      t('Backups already in Drive stay there. New backups will only be kept on this phone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Disconnect'),
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
      Alert.alert(t('Uploaded'), t('{name} is in your Google Drive.', { name }));
    } catch (e) {
      Alert.alert(t('Upload failed'), (e as Error)?.message ?? String(e));
    } finally {
      setDriveBusy(false);
    }
  };

  const doSignOut = () => {
    // react-native-web's Alert shows nothing, so the browser's own confirm asks
    // instead, and a reload brings the sign-in screen back.
    if (isWeb) {
      if (window.confirm(t('Sign out? You will need your password to get back in.'))) {
        void signOut().then(() => window.location.reload());
      }
      return;
    }
    Alert.alert(t('Sign out?'), t('You will need your password to get back in.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Sign out'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          Alert.alert(t('Signed out'), t('Close and reopen the app to sign in again.'));
        },
      },
    ]);
  };

  const exportBackup = async () => {
    setExporting(true);
    try {
      await shareBackupFile(new Date().toISOString());
    } catch (e) {
      Alert.alert(t('Backup failed'), (e as Error)?.message ?? String(e));
    } finally {
      setExporting(false);
    }
  };

  const restore = async () => {
    const res = await getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    Alert.alert(
      t('Restore and overwrite?'),
      t('This will DELETE all current data and replace it with "{file}". This cannot be undone.', {
        file: asset.name,
      }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Restore'),
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const counts = await restoreBackup(asset.uri);
              Alert.alert(
                t('Restored'),
                t('{parties} parties, {items} items, {invoices} invoices, {payments} payments loaded.', {
                  parties: counts.parties,
                  items: counts.items,
                  invoices: counts.invoices,
                  payments: counts.payments,
                }),
              );
            } catch (e) {
              Alert.alert(t('Restore failed'), (e as Error)?.message ?? String(e));
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
        {/* Signing out used to be at the bottom of a long page, past backups and
            the licence. It is the one thing on here somebody may need in a hurry,
            so it opens the page instead. Online mode has it in the corner of
            every page already (components/HeaderSignOut.web.tsx), so there it
            would only be the same button twice. */}
        {isWeb ? null : (
        <View style={styles.accountBar}>
          <View style={styles.accountWho}>
            <Text style={styles.accountName} numberOfLines={1}>
              {account?.username ?? t('Signed in')}
            </Text>
            <Text style={styles.accountHint} numberOfLines={1}>
              {isWeb ? t('This shop’s online books') : t('This phone’s books')}
            </Text>
          </View>
          <Pressable style={styles.signOutBtn} onPress={doSignOut}>
            <Text style={styles.signOutText}>{t('Sign out')}</Text>
          </Pressable>
        </View>
        )}

        {/* The screen's own language, apart from what the mic listens for. It
            sits at the top so a shop that cannot read English can still find it
            — the second chip is written in Tamil either way. */}
        <Text style={styles.sectionTitle}>{t('App language')} — மொழி</Text>
        <View style={styles.optionRow}>
          {(['en', 'ta'] as AppLang[]).map((l) => (
            <Pressable
              key={l}
              style={[styles.option, appLang === l && styles.optionOn]}
              onPress={() => setAppLang(l)}
            >
              <Text style={[styles.optionText, appLang === l && styles.optionTextOn]}>
                {APP_LANG_LABEL[l]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionHint}>
          {t('Changes the words on screen. Printed bills and reports stay in English.')}
        </Text>

        <View style={styles.divider} />

        {shopEditable ? (
        <>
        <Text style={styles.sectionTitle}>{t('Business profile')}</Text>
        <Text style={styles.sectionHint}>{t('Shown on the invoice PDFs you share.')}</Text>
        <TextField label={t('Business name')} value={name} onChangeText={setName} placeholder={t('My Business')} />
        <TextField
          label="GSTIN"
          value={gstin}
          onChangeText={setGstin}
          placeholder={t('15-digit GST number')}
          autoCapitalize="characters"
        />
        <TextField
          label={t('Address')}
          value={address}
          onChangeText={setAddress}
          placeholder={t('Business address')}
          multiline
        />
        <SelectField
          label={t('State')}
          value={bizState}
          onSelect={setBizState}
          options={INDIAN_STATES}
          placeholder={t('Select state')}
        />
        <Text style={styles.sectionHint}>
          {t('Your own state. A bill to the same state prints CGST + SGST; anywhere else prints IGST.')}
        </Text>
        <TextField
          label={t('Phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder={t('Contact number')}
          keyboardType="phone-pad"
        />
        <TextField
          label={t('Invoice prefix (sales)')}
          value={prefix}
          onChangeText={setPrefix}
          placeholder="INV"
          autoCapitalize="characters"
        />
        <Text style={styles.sectionHint}>
          {t('Sale invoices are numbered like PREFIX/2026-27/001. Leave blank for “INV”.')}
        </Text>
        <TextField
          label={t('Start sale numbers from')}
          value={startNo}
          onChangeText={(v) => setStartNo(v.replace(/[^0-9]/g, ''))}
          placeholder="1"
          keyboardType="number-pad"
        />
        <Text style={styles.sectionHint}>
          {t(
            'Moving from another app? Enter your next bill number (e.g. 501) and this year’s sales carry on from there. Numbering starts again at 001 next April.',
          )}
        </Text>

        {/* Everything below is optional and prints only when it is filled in —
            a shop that ignores this section gets the bill it got before. */}
        <View style={styles.brandRow}>
          <BrandImageField
            label={t('Logo')}
            uri={logo}
            square
            onPick={() => chooseBrandImage('logo')}
            onClear={() => clearBrandImage('logo')}
          />
          <BrandImageField
            label={t('Signature')}
            uri={signature}
            onPick={() => chooseBrandImage('signature')}
            onClear={() => clearBrandImage('signature')}
          />
        </View>

        <TextField
          label={t('Terms on the bill')}
          value={terms}
          onChangeText={setTerms}
          placeholder={t('Goods once sold will not be taken back.')}
          multiline
        />

        <TextField
          label={t('UPI id')}
          value={upi}
          onChangeText={setUpi}
          placeholder="shop@okaxis"
          autoCapitalize="none"
        />
        <Text style={styles.sectionHint}>
          {t('Printed on the bill as a scan-to-pay code, with the amount already in it. Leave blank for no code.')}
        </Text>

        <Button label={t('Save profile')} onPress={saveProfile} loading={saving} style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('GST entry method')}</Text>
        <Text style={styles.sectionHint}>
          {t(
            'The default for new bills. Counter shops usually price with GST already inside the rate; B2B invoicing usually adds it on top. You can still flip it on any single invoice.',
          )}
        </Text>
        <View style={styles.optionRow}>
          {(['exclusive', 'inclusive'] as TaxMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.option, taxMode === mode && styles.optionOn]}
              onPress={() => pickTaxMode(mode)}
            >
              <Text style={[styles.optionText, taxMode === mode && styles.optionTextOn]}>
                {t(TAX_MODE_LABEL[mode])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionHint}>
          {taxMode === 'inclusive'
            ? t('Example: ₹118 rate at 18% → taxable ₹100 + GST ₹18. Customer pays ₹118.')
            : t('Example: ₹100 rate at 18% → GST ₹18. Customer pays ₹118.')}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('Paper size')}</Text>
        <View style={styles.optionRow}>
          {(['a4', 'thermal58', 'thermal80'] as PrintFormat[]).map((format) => (
            <Pressable
              key={format}
              style={[styles.option, paper === format && styles.optionOn]}
              onPress={() => pickPaper(format)}
            >
              <Text style={[styles.optionText, paper === format && styles.optionTextOn]}>
                {t(PRINT_FORMAT_LABEL[format])}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionHint}>
          {t(
            'Choose the roll your counter printer takes — 58mm is the small one, 80mm the wider. Every Print and Share button then uses it; A4 stays the full tax invoice sheet.',
          )}
        </Text>

        <View style={styles.divider} />
        </>
        ) : (
        <>
        <Text style={styles.sectionHint}>
          {t('The shop’s profile, bill printing, GST and numbering can be changed by an owner only.')}
        </Text>

        <View style={styles.divider} />
        </>
        )}

        {/* Voice and the phone-bound licence are phone features; the web app is
            Online mode at a desk. */}
        {isWeb ? null : (
        <>
        <Text style={styles.sectionTitle}>{t('Voice commands')} — குரல் கட்டளை</Text>
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, enabled && styles.optionOn]}
            onPress={() => changeEnabled(!enabled)}
          >
            <Text style={[styles.optionText, enabled && styles.optionTextOn]}>
              {enabled ? t('🎙  Mic button on') : t('🚫  Mic button hidden')}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {!enabled
            ? t('The floating mic is off every screen. Turn it back on here whenever you want it.')
            : status.available
              ? t('Tap the 🎙 button on any screen and speak. Say “உதவி” / “help” for the full list.')
              : t('Not available in Expo Go — the microphone needs the development build. See VOICE-SETUP.md.')}
        </Text>
        {enabled ? (
        <>
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
              {speakBack ? t('🔊  Speaks confirmations') : t('🔇  Silent confirmations')}
            </Text>
          </Pressable>
        </View>
        <Button
          label={t('What can I say?')}
          tone="ghost"
          onPress={() => setHelpOpen(true)}
          style={styles.save}
        />
        </>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('Licence')}</Text>
        <Text style={styles.sectionHint}>
          {t('This copy is tied to this phone. Send the System ID to your vendor to renew.')}
        </Text>
        <LicenseCard />

        <View style={styles.divider} />
        </>
        )}

        {isWeb ? (
          <>
            <Text style={styles.sectionTitle}>{t('Account')}</Text>
            {account ? (
              <Text style={styles.sectionHint}>
                {account.username}
                {account.email ? ` · ${account.email}` : ''}
                {'\n'}
                {t('Signed in to this shop’s online books.')}
              </Text>
            ) : null}

            <View style={styles.divider} />

            <StaffSection />
            <ServerBackupSection />
          </>
        ) : (
        <>
        <Text style={styles.sectionTitle}>{t('Account & lock')}</Text>
        {account ? (
          <Text style={styles.sectionHint}>
            {account.username} · {account.email}
            {'\n'}
            {t('Stored only on this phone — restoring a backup never changes your login.')}
          </Text>
        ) : null}
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, lockOn && styles.optionOn]}
            onPress={() => toggleLock(!lockOn)}
          >
            <Text style={[styles.optionText, lockOn && styles.optionTextOn]}>
              {lockOn ? t('🔒  App lock on — {kind}', { kind: t(lockLabel) }) : t('🔓  App lock off')}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {lockEnrolled
            ? t('Asks for your phone’s fingerprint/PIN when the app opens and each time you come back to it.')
            : t('Set a fingerprint, PIN or pattern on your phone first to use this.')}
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('Automatic backup')}</Text>
        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, auto?.enabled && styles.optionOn]}
            onPress={() => toggleAuto(!auto?.enabled)}
          >
            <Text style={[styles.optionText, auto?.enabled && styles.optionTextOn]}>
              {auto?.enabled ? t('✓  Automatic backup on') : t('Automatic backup off')}
            </Text>
          </Pressable>
        </View>

        {auto?.enabled ? (
          <>
            <Text style={styles.sectionHint}>{t('How many times a day?')}</Text>
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
            <Text style={styles.sectionHint}>{t(PER_DAY_LABEL[auto.perDay])}</Text>

            <Text style={styles.sectionHint}>
              {t(
                'Each run saves a snapshot on the phone (last 10 kept) and uploads it to Google Drive when an account is connected below.',
              )}
            </Text>

            <Text style={styles.sectionHint}>
              {auto.lastAt
                ? `${t('Last backup: {when}', { when: new Date(auto.lastAt).toLocaleString() })}\n${auto.lastResult ?? ''}`
                : t('No automatic backup has run yet.')}
            </Text>
            <Text style={styles.sectionHint}>
              {t(
                'Android stops apps in the background, so a due backup runs the next time you open the app (and while it stays open).',
              )}
            </Text>
          </>
        ) : null}

        <View style={styles.optionRow}>
          <Pressable
            style={[styles.option, auto?.onExit && styles.optionOn]}
            onPress={() => toggleOnExit(!auto?.onExit)}
          >
            <Text style={[styles.optionText, auto?.onExit && styles.optionTextOn]}>
              {auto?.onExit ? t('✓  Ask to back up when closing') : t('Do not ask when closing')}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          {t(
            'Pressing back to close the app asks whether to back up first, so a day’s billing is never left only on the phone overnight.',
          )}
        </Text>

        <Button label={t('Back up now')} onPress={backupNow} loading={backingUp} tone="ghost" style={styles.save} />

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('Google Drive backup')}</Text>
        <Text style={styles.sectionHint}>
          {t(
            'Like WhatsApp: sign in once and every backup goes to your own Google Drive. After a reinstall, sign in with the same account and your data comes straight back.',
          )}
        </Text>

        {drive?.connected ? (
          <>
            <View style={styles.optionRow}>
              <Pressable style={[styles.option, styles.optionOn]} onPress={disconnect}>
                <Text style={[styles.optionText, styles.optionTextOn]}>
                  ✓  {drive.email ?? t('Google account connected')}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              {t(
                'Backups live in a “Benesys Billing Backups” folder in that account. The app can only see the files it made there — nothing else in your Drive.',
              )}
            </Text>
            <Button
              label={t('Back up to Drive now')}
              onPress={driveBackupNow}
              loading={driveBusy}
              tone="ghost"
              style={styles.save}
            />
            <Button
              label={t('Restore from Drive')}
              onPress={() => setDrivePicker(true)}
              tone="danger"
              style={styles.save}
            />
            <Pressable onPress={disconnect} hitSlop={8}>
              <Text style={styles.linkDanger}>{t('Disconnect this Google account')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.driveWarn}>
              {t(
                '⚠ Right now every backup is only on this phone. If the phone is lost, broken or the app is uninstalled, your bills go with it. Sign in once to keep a copy in Drive.',
              )}
            </Text>
            <Button
              label={t('Sign in with Google')}
              onPress={connect}
              loading={driveBusy}
              style={styles.save}
            />
            <Text style={styles.sectionHint}>
              {drive?.configured
                ? t('Nothing leaves the phone until you sign in.')
                : t('Needs a one-time Google client ID — see DRIVE-SETUP.md, then paste it below.')}
            </Text>
          </>
        )}

        <Pressable onPress={() => setShowClientId((v) => !v)} hitSlop={8}>
          <Text style={styles.link}>
            {showClientId ? t('Hide Google client ID') : t('Google client ID (advanced)')}
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
              {t(
                'From your own Google Cloud project (Android client, package com.benesys.billingapp). Steps are in DRIVE-SETUP.md. Not a secret — Android clients have none.',
              )}
            </Text>
          </>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>{t('Local backup & restore')}</Text>
        <Text style={styles.sectionHint}>
          {t(
            'Save a JSON copy of everything wherever you like — a memory card, Drive, WhatsApp to yourself. Restore replaces everything from such a file.',
          )}
        </Text>
        <Button
          label={t('Save backup file')}
          onPress={exportBackup}
          loading={exporting}
          tone="ghost"
          style={styles.save}
        />
        <Button
          label={t('Restore from file')}
          onPress={restore}
          loading={restoring}
          tone="danger"
          style={styles.save}
        />
        </>
        )}

        <Text style={styles.version}>Billing App v1.0.0</Text>
      </ScrollView>

      {isWeb ? null : (
        <DriveRestorePicker
          visible={drivePicker}
          onClose={() => setDrivePicker(false)}
          onRestored={() => void getAutoBackupConfig().then(setAuto)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * A logo or signature slot: the picture when there is one, an invitation when
 * there is not. Clearing is deliberately one tap away, not hidden in a menu —
 * a wrong logo on every bill is the kind of thing noticed in a hurry.
 */
function BrandImageField({
  label,
  uri,
  square,
  onPick,
  onClear,
}: {
  label: string;
  uri: string;
  square?: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.brandCol}>
      <Text style={styles.brandLabel}>{label}</Text>
      <Pressable
        style={[styles.brandBox, square ? styles.brandSquare : styles.brandWide]}
        onPress={onPick}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.brandImage} resizeMode="contain" />
        ) : (
          <Text style={styles.brandAdd}>+ {t('Add')}</Text>
        )}
      </Pressable>
      {uri ? (
        <Pressable hitSlop={8} onPress={onClear}>
          <Text style={styles.brandRemove}>{t('Remove')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  driveWarn: {
    fontSize: 13,
    lineHeight: 19,
    color: '#a8321e',
    backgroundColor: '#fdeeea',
    borderRadius: 10,
    padding: 10,
  },
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  brandRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  brandCol: { flex: 1, gap: 6, alignItems: 'flex-start' },
  brandLabel: { fontSize: 13, fontWeight: '600', color: '#444' },
  brandBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    width: '100%',
    overflow: 'hidden',
  },
  brandSquare: { height: 84 },
  brandWide: { height: 84 },
  brandImage: { width: '100%', height: '100%' },
  brandAdd: { color: '#208AEF', fontWeight: '600', fontSize: 14 },
  brandRemove: { color: '#c0392b', fontWeight: '600', fontSize: 12 },
  accountBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f4f8fe',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  accountWho: { flex: 1 },
  accountName: { fontSize: 15, fontWeight: '700', color: '#111' },
  accountHint: { fontSize: 12, color: '#888', marginTop: 2 },
  signOutBtn: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  signOutText: { color: '#c0392b', fontWeight: '700', fontSize: 14 },
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
