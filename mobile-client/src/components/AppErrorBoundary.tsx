import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/colors";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render errors so a failed screen does not leave a blank white view
 * (especially in release builds where the redbox is hidden).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary]", error.message, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View style={styles.wrap} accessibilityRole="alert">
          <Text style={styles.title}>Couldn't load the app</Text>
          <Text style={styles.body} selectable>
            {this.state.error.message}
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: colors.GRAY50,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.GRAY800,
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: colors.GRAY600,
    textAlign: "center",
    marginBottom: 20,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.GREEN,
  },
  btnText: {
    color: colors.WHITE,
    fontSize: 16,
    fontWeight: "700",
  },
});
