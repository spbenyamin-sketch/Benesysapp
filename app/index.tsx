import { Redirect } from 'expo-router';

// Entry point: send the user straight to the Dashboard tab.
export default function Index() {
  return <Redirect href="/(tabs)/dashboard" />;
}
