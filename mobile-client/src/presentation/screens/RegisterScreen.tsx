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
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ProfileStackParamList } from "../../navigation/ProfileStack";
import { useAuth } from "../../context/AuthContext";
import type { RegisterRequest } from "../../api/auth";
import { colors } from "../../constants/colors";

export default function RegisterScreen() {
  const { register } = useAuth();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<ProfileStackParamList, "Register">
    >();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const body: RegisterRequest = {
        email: email.trim(),
        password,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
      };
      await register(body);
      navigation.navigate("ProfileHome");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed.");
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join The Hive community</Text>

            <TextInput
              style={styles.input}
              placeholder="Email *"
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
              placeholder="First name"
              placeholderTextColor={colors.GRAY400}
              value={firstName}
              onChangeText={setFirstName}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Last name"
              placeholderTextColor={colors.GRAY400}
              value={lastName}
              onChangeText={setLastName}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Password * (min 8 characters)"
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
                <Text style={styles.buttonText}>Sign up</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.link}
              onPress={() => navigation.navigate("Login")}
              disabled={loading}
            >
              <Text style={styles.linkText}>
                Already have an account? Sign in
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  content: {
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
