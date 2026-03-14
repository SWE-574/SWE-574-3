import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { useAuth } from "../../context/AuthContext";
import type { LoginRequest } from "../../api/auth";
import { colors } from "../../constants/colors";

export default function LoginScreen() {
  const { login } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<ProfileStackParamList, "Login">>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const body: LoginRequest = { email: email.trim(), password };
      await login(body);
      navigation.navigate("ProfileHome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Welcome back to The Hive</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.GRAY400}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.GRAY400}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError("");
            }}
            secureTextEntry
            editable={!loading}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.WHITE} />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate("Register")}
            disabled={loading}
          >
            <Text style={styles.linkText}>
              Don&apos;t have an account? Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.WHITE,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.GRAY800,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.GRAY600,
    marginBottom: 32,
  },
  input: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.GRAY100,
    fontSize: 16,
    color: colors.GRAY800,
    borderWidth: 1,
    borderColor: colors.GRAY200,
    marginBottom: 16,
  },
  error: {
    color: colors.RED,
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.GRAY800,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    marginTop: 24,
    alignItems: "center",
  },
  linkText: {
    color: colors.GRAY800,
    fontSize: 15,
  },
});
