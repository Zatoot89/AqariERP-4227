const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default {
  expo: {
    name: "Aqari ERP",
    slug: "aqari-erp",
    version: "1.0.0",
    scheme: "aqari",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: "com.aiarabia.aqari",
      supportsTablet: true,
    },
    android: {
      package: "com.aiarabia.aqari",
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro",
    },
    plugins: ["expo-router"],
    extra: {
      apiUrl,
    },
  },
};
