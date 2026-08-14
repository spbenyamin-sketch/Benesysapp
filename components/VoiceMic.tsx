// The floating microphone, rendered once at the root so it is available on
// EVERY screen. Tap to start/stop, tap the language chip to switch Tamil ⇄
// English, tap "?" for the command cheatsheet.

import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoice } from '@/modules/voice/VoiceProvider';
import { HELP } from '@/modules/voice/help';
import { VOICE_LANG_LABEL, type VoiceLang } from '@/modules/voice/types';

export default function VoiceMic() {
  const { status, lang, helpOpen, setHelpOpen, changeLang, toggleListening } = useVoice();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(0)).current;

  // Breathing ring while the mic is open, so it's obvious the app is listening.
  useEffect(() => {
    if (!status.listening) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status.listening, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  // Sit clear of everything else that floats at the bottom: the tab bar (~56 +
  // inset), Quick Bill's total bar (bottom 16, ~64 tall) and the "+" FAB on
  // Items/Parties (bottom 24, 56 tall). Both of those top out ~80 above the tab
  // bar, so 148 leaves the mic a comfortable gap above them instead of covering
  // the "Bill" and "+" buttons.
  const bottom = 148 + insets.bottom;
  const nextLang: VoiceLang = lang === 'ta-IN' ? 'en-IN' : 'ta-IN';
  const bubble = status.transcript || status.message;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.layer, { bottom }]}>
        {bubble ? (
          <View style={[styles.bubble, status.error ? styles.bubbleError : null]}>
            <Text style={styles.bubbleText} numberOfLines={3}>
              {bubble}
            </Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Pressable
            style={styles.chip}
            onPress={() => changeLang(nextLang)}
            hitSlop={6}
            accessibilityLabel="Switch voice language"
          >
            <Text style={styles.chipText}>{VOICE_LANG_LABEL[lang]}</Text>
          </Pressable>
          <Pressable style={styles.chip} onPress={() => setHelpOpen(true)} hitSlop={6} accessibilityLabel="Voice help">
            <Text style={styles.chipText}>?</Text>
          </Pressable>

          <View>
            {status.listening ? (
              <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />
            ) : null}
            <Pressable
              onPress={toggleListening}
              style={[styles.mic, status.listening && styles.micOn, !status.available && styles.micOff]}
              accessibilityRole="button"
              accessibilityLabel={status.listening ? 'Stop listening' : 'Start voice command'}
            >
              <Text style={styles.micIcon}>{status.listening ? '⏹' : '🎙'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={helpOpen} animationType="slide" transparent onRequestClose={() => setHelpOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setHelpOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>
                {lang === 'ta-IN' ? 'என்ன சொல்லலாம்?' : 'What can I say?'}
              </Text>
              <Pressable hitSlop={8} onPress={() => setHelpOpen(false)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            {!status.available ? (
              <Text style={styles.warn}>
                {lang === 'ta-IN'
                  ? 'Expo Go-ல மைக் வேலை செய்யாது. Dev build போட்டா voice ஆன் ஆகும் (VOICE-SETUP.md).'
                  : 'Voice needs the development build — Expo Go has no speech engine. See VOICE-SETUP.md.'}
              </Text>
            ) : null}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
              {HELP.map((group) => (
                <View key={group.title} style={styles.group}>
                  <Text style={styles.groupTitle}>{lang === 'ta-IN' ? group.titleTa : group.title}</Text>
                  {group.examples.map((ex) => (
                    <View key={ex.ta + ex.en} style={styles.exRow}>
                      <Text style={styles.exSay}>“{lang === 'ta-IN' ? ex.ta : ex.en}”</Text>
                      <Text style={styles.exDoes}>{lang === 'ta-IN' ? ex.doesTa : ex.does}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={styles.footNote}>
                {lang === 'ta-IN'
                  ? 'குறிப்பு: பொருள்/வாடிக்கையாளர் பெயரை தமிழ்ல சொல்ல, அந்த பொருளோட “Voice name (தமிழ்)” fieldல தமிழ் பெயரை சேர்த்து வையுங்க.'
                  : 'Tip: to say an item or party name in Tamil, fill its “Voice name (Tamil)” field.'}
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const SIZE = 56;

const styles = StyleSheet.create({
  layer: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: {
    maxWidth: 300,
    backgroundColor: 'rgba(17,17,17,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleError: { backgroundColor: 'rgba(192,57,43,0.95)' },
  bubbleText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  chip: {
    height: 32,
    minWidth: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(17,17,17,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  mic: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  micOn: { backgroundColor: '#c0392b' },
  micOff: { backgroundColor: '#9aa0a6' },
  micIcon: { fontSize: 24, color: '#fff' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#c0392b',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '85%',
    gap: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  close: { fontSize: 18, color: '#888', paddingHorizontal: 4 },
  warn: {
    backgroundColor: '#fff4e5',
    borderRadius: 10,
    padding: 10,
    color: '#8a5a00',
    fontSize: 13,
    lineHeight: 19,
  },
  scroll: { flexGrow: 0 },
  scrollBody: { gap: 16, paddingBottom: 8 },
  group: { gap: 6 },
  groupTitle: { fontSize: 14, fontWeight: '700', color: '#208AEF' },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  exSay: { fontSize: 14, color: '#111', flex: 1, fontWeight: '500' },
  exDoes: { fontSize: 12, color: '#888', flex: 1, textAlign: 'right', maxWidth: '45%' },
  footNote: { fontSize: 12, color: '#888', lineHeight: 18, marginTop: 4 },
});
