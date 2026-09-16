import { Alert, type AlertButton } from 'react-native';

// react-native-web ships Alert.alert as an empty function, so on web every
// error message and every "Delete this bill?" in the app would silently do
// nothing. The browser's own dialogs stand in: a message is window.alert, one
// real choice is window.confirm, several are a numbered window.prompt.

function run(button?: AlertButton) {
  button?.onPress?.();
}

Alert.alert = (title, message, buttons) => {
  const text = message ? `${title}\n\n${message}` : title;
  const list = buttons ?? [];
  const cancel = list.find((b) => b.style === 'cancel');
  const choices = list.filter((b) => b !== cancel);

  if (choices.length <= 1 && !cancel) {
    window.alert(text);
    run(choices[0]);
    return;
  }
  if (choices.length <= 1) {
    run(window.confirm(text) ? choices[0] : cancel);
    return;
  }
  const menu = choices.map((b, i) => `${i + 1}. ${b.text ?? 'OK'}`).join('\n');
  const answer = window.prompt(`${text}\n\n${menu}\n\nType a number:`);
  const picked = answer ? choices[Number(answer.trim()) - 1] : undefined;
  run(picked ?? cancel);
};
