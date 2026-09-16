// Online mode's Settings → People. The owner adds the counter staff, gives or
// takes owner access, switches a person who has left off, and resets a
// forgotten password. Staff never see this section; the server refuses them too.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import TextField from '@/components/TextField';
import { validatePassword, validateUsername } from '@/modules/auth/service.web';
import {
  allowedScreens,
  SCREEN_HINT,
  SCREEN_LABEL,
  SCREENS,
  type Screen,
} from '@/modules/auth/screens';
import {
  addStaff,
  isOwner,
  listStaff,
  signedInUserId,
  updateStaff,
  type ShopUser,
} from '@/web/staff';

const message = (e: unknown) => (e as Error)?.message ?? String(e);

/** "all screens" reads better than "5 of 5" on the row everyone glances at. */
function screenCount(person: ShopUser): string {
  const n = allowedScreens(person).length;
  if (n === SCREENS.length) return 'all screens';
  if (n === 0) return 'no screens';
  return `${n} of ${SCREENS.length} screens`;
}

export default function StaffSection() {
  const owner = isOwner();
  const me = signedInUserId();
  const [people, setPeople] = useState<ShopUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople(await listStaff());
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  // One person changed: swap that row rather than re-reading the whole list.
  const replace = (u: ShopUser) =>
    setPeople((list) => (list ?? []).map((p) => (p.id === u.id ? u : p)));

  if (!owner) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>People — who can sign in</Text>
      <Text style={styles.sectionHint}>
        Everyone here bills into the same books. Staff do the billing; owners can also manage this
        list. Switching someone off, or giving them a new password, signs them out everywhere.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {people === null && !error ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        (people ?? []).map((p) => (
          <PersonRow
            key={p.id}
            person={p}
            isSelf={p.id === me}
            open={openId === p.id}
            onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            onChanged={replace}
            onError={setError}
          />
        ))
      )}

      {adding ? (
        <AddPerson
          onCancel={() => setAdding(false)}
          onAdded={(u) => {
            setPeople((list) => [...(list ?? []), u]);
            setAdding(false);
          }}
        />
      ) : (
        <Button label="Add a person" tone="ghost" onPress={() => setAdding(true)} style={styles.save} />
      )}
    </>
  );
}

// ── Which screens ────────────────────────────────────────────────────────────

/** The owner's tick list. Everything not ticked is off the tab bar for them. */
function ScreenPicker({
  value,
  onChange,
}: {
  value: Screen[];
  onChange: (next: Screen[]) => void;
}) {
  return (
    <>
      <Text style={styles.pickTitle}>Screens they can open</Text>
      {SCREENS.map((screen) => {
        const on = value.includes(screen);
        return (
          <Pressable
            key={screen}
            style={[styles.option, on && styles.optionOn]}
            onPress={() => onChange(on ? value.filter((s) => s !== screen) : [...value, screen])}
          >
            <Text style={[styles.optionText, on && styles.optionTextOn]}>
              {on ? '✓  ' : '○  '}
              {SCREEN_LABEL[screen]}
            </Text>
            <Text style={styles.optionHint}>{SCREEN_HINT[screen]}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.meta}>
        Settings stays open to everyone — it is where they sign out and change their own password.
      </Text>
    </>
  );
}

// ── One person ───────────────────────────────────────────────────────────────

function PersonRow({
  person,
  isSelf,
  open,
  onToggle,
  onChanged,
  onError,
}: {
  person: ShopUser;
  isSelf: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged: (u: ShopUser) => void;
  onError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(person.displayName ?? '');
  const [password, setPassword] = useState('');
  const [screens, setScreens] = useState<Screen[]>(() => allowedScreens(person));
  const [busy, setBusy] = useState(false);

  const save = async (
    change: Parameters<typeof updateStaff>[1],
    after?: () => void,
  ) => {
    setBusy(true);
    onError(null);
    try {
      onChanged(await updateStaff(person.id, change));
      after?.();
    } catch (e) {
      onError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const setNewPassword = () => {
    const problem = validatePassword(password);
    if (problem) {
      onError(problem);
      return;
    }
    void save({ password }, () => setPassword(''));
  };

  return (
    <View style={[styles.card, !person.active && styles.cardOff]}>
      <Pressable onPress={onToggle} style={styles.cardHead}>
        <View style={styles.cardText}>
          <Text style={styles.name}>
            {person.displayName || person.username}
            {isSelf ? '  (you)' : ''}
          </Text>
          <Text style={styles.meta}>
            {person.username}
            {person.email ? ` · ${person.email}` : ''} · {person.role === 'owner' ? 'Owner' : 'Staff'}
            {person.role === 'owner' ? '' : ` · ${screenCount(person)}`}
            {person.active ? '' : ' · switched off'}
          </Text>
        </View>
        <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.cardBody}>
          <TextField
            label="Display name"
            value={name}
            onChangeText={setName}
            placeholder="Name on the bill"
          />
          <Button
            label="Save name"
            tone="ghost"
            loading={busy}
            onPress={() => void save({ displayName: name.trim() || null })}
          />

          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
          />
          <Button label="Set password" tone="ghost" loading={busy} onPress={setNewPassword} />

          {person.role === 'owner' ? (
            <Text style={styles.selfHint}>An owner opens every screen — that is what owner means.</Text>
          ) : (
            <>
              <ScreenPicker value={screens} onChange={setScreens} />
              <Button
                label="Save screens"
                tone="ghost"
                loading={busy}
                onPress={() => void save({ screens })}
              />
            </>
          )}

          {isSelf ? (
            <Text style={styles.selfHint}>
              You cannot take away your own owner access or switch yourself off — ask another owner.
            </Text>
          ) : (
            <>
              <Button
                label={person.role === 'owner' ? 'Make staff' : 'Make owner'}
                tone="ghost"
                loading={busy}
                onPress={() => void save({ role: person.role === 'owner' ? 'staff' : 'owner' })}
              />
              <Button
                label={person.active ? 'Switch off' : 'Switch back on'}
                tone={person.active ? 'danger' : 'ghost'}
                loading={busy}
                onPress={() => void save({ active: !person.active })}
              />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ── Adding one ───────────────────────────────────────────────────────────────

function AddPerson({
  onAdded,
  onCancel,
}: {
  onAdded: (u: ShopUser) => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [owner, setOwner] = useState(false);
  const [screens, setScreens] = useState<Screen[]>(() => [...SCREENS]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const problem = validateUsername(username) ?? validatePassword(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onAdded(
        await addStaff({
          username: username.trim().toLowerCase(),
          displayName: name.trim() || null,
          password,
          role: owner ? 'owner' : 'staff',
          screens: owner ? null : screens,
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardIntro}>
        <Text style={styles.name}>Add a person</Text>
        <Text style={styles.meta}>
          They sign in with this username and password. Tell it to them — nobody can read it back
          later, it can only be set again.
        </Text>
      </View>
      <View style={styles.cardBody}>
        <TextField
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="kavitha"
          autoCapitalize="none"
          required
        />
        <TextField label="Display name" value={name} onChangeText={setName} placeholder="Kavitha" />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="at least 8 characters"
          secureTextEntry
          autoCapitalize="none"
          required
        />
        <Pressable style={[styles.option, owner && styles.optionOn]} onPress={() => setOwner(!owner)}>
          <Text style={[styles.optionText, owner && styles.optionTextOn]}>
            {owner ? '✓  Owner — can also manage people' : 'Staff — billing only'}
          </Text>
        </Pressable>

        {owner ? null : <ScreenPicker value={screens} onChange={setScreens} />}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Add" loading={busy} onPress={() => void submit()} />
        <Button label="Cancel" tone="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The Settings screen's own heading styles; its container supplies the gaps.
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  sectionHint: { fontSize: 12, color: '#888', marginTop: -8 },
  error: { color: '#c0392b', fontSize: 13 },
  loading: { alignSelf: 'flex-start' },
  save: { marginTop: 4, alignSelf: 'flex-start', minWidth: 200 },
  card: {
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardOff: { opacity: 0.6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  cardIntro: { padding: 12, paddingBottom: 0, gap: 2 },
  cardText: { flex: 1, gap: 2 },
  cardBody: { padding: 12, paddingTop: 0, gap: 10 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#888' },
  selfHint: { fontSize: 12, color: '#888', lineHeight: 18 },
  chevron: { fontSize: 16, color: '#888' },
  option: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionOn: { borderColor: '#208AEF', backgroundColor: '#eaf4fe' },
  optionText: { fontSize: 14, color: '#444' },
  optionTextOn: { color: '#208AEF', fontWeight: '600' },
  optionHint: { fontSize: 12, color: '#999', marginTop: 2, marginLeft: 22 },
  pickTitle: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 2 },
});
