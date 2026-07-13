import { hc } from "hono/client";
import Constants from "expo-constants";
import type { AppType } from "@aqari/web";

const baseUrl =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL;

if (!baseUrl) {
  throw new Error("EXPO_PUBLIC_API_URL is required for the Aqari mobile client");
}

const client = hc<AppType>(baseUrl);

export const api = client.api;
