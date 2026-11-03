import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { HEALTH_URL } from "./api";

// "Online" means the WMS backend answers, not just that the phone has Wi-Fi:
// a warehouse Wi-Fi without route to the server must count as offline so
// movements get queued instead of failing.
NetInfo.configure({
  reachabilityUrl: HEALTH_URL,
  reachabilityTest: async response => response.status === 200,
  reachabilityLongTimeout: 30_000, // re-check every 30 s while reachable
  reachabilityShortTimeout: 5_000, // and every 5 s while not
  reachabilityRequestTimeout: 8_000,
  useNativeReachability: false,
});

/** `null` while the first check is still running — callers treat that as online. */
export function useServerReachable(): boolean | null {
  const { isConnected, isInternetReachable } = useNetInfo();
  if (isConnected === false) return false;
  return isInternetReachable;
}

/** Forces an immediate reachability check (e.g. after a request failed with a network error). */
export function refreshConnectivity(): void {
  NetInfo.refresh().catch(() => {});
}
