import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { createScanLock } from '@/modules/items/barcode';

// Full-screen scanner. The shop points the phone at a packet instead of hunting
// the item list, so everything here is aimed at one job: read one code, hand it
// over, get out of the way.
//
// The camera is only mounted while `visible` is true — a Modal keeps its
// children alive underneath, and a camera left running behind a closed sheet
// eats battery and keeps the torch-green light on for no reason.

// The formats a counter actually meets: EAN/UPC printed on retail packets, and
// Code 128/39 on the labels a distributor sticks on. QR is deliberately left
// out — a UPI poster or a delivery boy's phone in front of the lens is not an
// item, and reading one would only produce a wrong "no match".
const FORMATS = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] as const;

export default function BarcodeScanner({
  visible,
  onScan,
  onClose,
  rearmKey,
}: {
  visible: boolean;
  /** Fires once per opening, and once more each time `rearmKey` changes. */
  onScan: (code: string) => void;
  onClose: () => void;
  /**
   * Change this to make the scanner listen again without closing it — what a
   * caller wants after a code that matched nothing. Remounting the whole
   * component would work too, but it tears the camera down and builds it back
   * up in the shopkeeper's hand for what is really just "try again".
   */
  rearmKey?: number | string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(createScanLock());
  const opened = useRef(false);

  // Asked when the scanner opens, never when the app starts: a shop with no
  // scanner is never shown a camera prompt at all. Guarded by `opened` so a
  // re-render cannot re-prompt — or, worse, re-arm the lock mid-scan.
  useEffect(() => {
    if (!visible) {
      opened.current = false;
      return;
    }
    if (opened.current) return;
    opened.current = true;
    lock.current.reset();
    void requestPermission();
  }, [visible, requestPermission]);

  // A deliberate re-arm from the caller. Separate from the effect above so that
  // opening the scanner and asking it to listen again stay two different
  // events — one prompts for the camera, the other must never re-prompt.
  useEffect(() => {
    if (visible) lock.current.reset();
  }, [visible, rearmKey]);

  const handleScan = ({ data }: { data: string }) => {
    const code = lock.current.accept(data);
    if (code) onScan(code);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        {!visible ? null : permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...FORMATS] }}
            onBarcodeScanned={handleScan}
          />
        ) : null}

        {permission?.granted ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <Text style={styles.hint}>Hold the barcode inside the box</Text>
            <View style={styles.frame} />
          </View>
        ) : (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>
              {permission ? 'The camera is switched off' : 'Opening the camera…'}
            </Text>
            {permission ? (
              <Text style={styles.messageBody}>
                Scanning needs the camera. Turn it on for Billing App in your phone's Settings, or
                just type the item name instead.
              </Text>
            ) : null}
          </View>
        )}

        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600' },
  frame: {
    width: '78%',
    aspectRatio: 1.6,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  messageTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  messageBody: { color: '#ccc', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  close: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: '#fff',
  },
  closeText: { color: '#111', fontSize: 16, fontWeight: '600' },
});
