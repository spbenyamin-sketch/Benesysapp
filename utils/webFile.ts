// Printing and saving files in a browser — the web build's stand-in for the
// share sheet and expo-file-system, neither of which exists there.
//
// Only ever called behind an `isWeb` check: none of this touches the phone.

/** True in the web bundle. babel-preset-expo inlines EXPO_OS per platform. */
export const isWeb = process.env.EXPO_OS === 'web';

/**
 * Print a self-contained HTML document from a hidden frame. expo-print's web
 * build ignores the html it is given and prints the app screen itself, so a bill
 * would come out as a picture of the form. The browser's dialog also offers
 * "Save as PDF", which is what Share means on a desktop.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
    });
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        reject(new Error('The browser would not open the print view.'));
        return;
      }
      win.focus();
      win.print();
      // print() blocks until the dialog closes in most browsers; the delay covers
      // the ones where it doesn't, so the page isn't pulled out from under it.
      setTimeout(() => frame.remove(), 1000);
      resolve();
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** Hand the browser a file to save, as a download. */
export function downloadFile(filename: string, data: Uint8Array | string, mimeType: string): void {
  const blob = new Blob([data as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later, not now: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
