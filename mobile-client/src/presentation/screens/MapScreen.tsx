import React, { useEffect, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { colors } from "../../constants/colors";
import { ActivityIndicator, Alert } from "react-native";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { LatLng, LeafletView } from "react-native-leaflet-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import { HomeStackParamList } from "../../navigation/HomeStack";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

const DEFAULT_LOCATION = {
  latitude: -23.5489,
  longitude: -46.6388,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList, "HomeFeed">>();
  const [webViewContent, setWebViewContent] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;
    const loadHtml = async () => {
      try {
        const path = require("../../../assets/leaflet.html");
        const asset = Asset.fromModule(path);
        await asset.downloadAsync();
        const htmlContent = await new File(asset.localUri!).text();

        if (isMounted) {
          setWebViewContent(htmlContent);
        }
      } catch (error) {
        Alert.alert("Error loading HTML", JSON.stringify(error));
        console.error("Error loading HTML:", error);
      }
    };

    loadHtml();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!webViewContent) {
    return <ActivityIndicator size="large" />;
  }
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LeafletView
        source={{ html: webViewContent }}
        mapCenterPosition={{
          lat: DEFAULT_LOCATION.latitude,
          lng: DEFAULT_LOCATION.longitude,
        }}
      />
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color={colors.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  button: {
    position: "absolute",
    top: 100,
    left: 20,
    backgroundColor: colors.GREEN,
    padding: 10,
    borderRadius: 10,
  },
  map: {
    flex: 1,
  },
});
