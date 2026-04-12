import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../../../constants/colors";

type StepStatus = "done" | "active" | "upcoming";

const STEPS = [
  "Interest\nSent",
  "Session\nProposed",
  "Session\nConfirmed",
  "Completed",
];

function StepDot({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <View style={[styles.dot, styles.dotDone]}>
        <Ionicons name="checkmark" size={10} color={colors.WHITE} />
      </View>
    );
  }
  if (status === "active") {
    return (
      <View style={[styles.dot, styles.dotActive]}>
        <View style={styles.dotActiveInner} />
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotUpcoming]} />;
}

export type ChatStepBarProps = {
  isPending: boolean;
  isAccepted: boolean;
  isCompleted: boolean;
  isClosed: boolean;
  providerInitiated: boolean;
};

export function ChatStepBar({
  isPending,
  isAccepted,
  isCompleted,
  isClosed,
  providerInitiated,
}: ChatStepBarProps) {
  if (isClosed) return null;

  let currentStep = 0;
  if (isCompleted) currentStep = 3;
  else if (isAccepted) currentStep = 2;
  else if (isPending && providerInitiated) currentStep = 1;
  else currentStep = 0;

  const stepStatus = (i: number): StepStatus =>
    i < currentStep ? "done" : i === currentStep ? "active" : "upcoming";

  return (
    <View style={styles.container}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.step}>
            <StepDot status={stepStatus(i)} />
            <Text
              style={[
                styles.label,
                stepStatus(i) === "upcoming" && styles.labelUpcoming,
                stepStatus(i) === "done" && styles.labelDone,
                stepStatus(i) === "active" && styles.labelActive,
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
          </View>
          {i < STEPS.length - 1 && (
            <View
              style={[
                styles.line,
                i < currentStep ? styles.lineDone : styles.lineUpcoming,
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.GRAY50,
    borderBottomWidth: 1,
    borderBottomColor: colors.GRAY200,
  },
  step: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    width: 56,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dotDone: {
    backgroundColor: colors.GREEN,
  },
  dotActive: {
    backgroundColor: colors.WHITE,
    borderWidth: 2.5,
    borderColor: colors.GREEN,
  },
  dotActiveInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.GREEN,
  },
  dotUpcoming: {
    backgroundColor: colors.WHITE,
    borderWidth: 2,
    borderColor: colors.GRAY300,
  },
  line: {
    flex: 1,
    height: 2,
    marginTop: 9,
    marginHorizontal: 2,
    borderRadius: 1,
  },
  lineDone: {
    backgroundColor: colors.GREEN,
  },
  lineUpcoming: {
    backgroundColor: colors.GRAY200,
  },
  label: {
    fontSize: 8,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  labelDone: {
    color: colors.GREEN,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.GRAY700,
    fontWeight: "700",
  },
  labelUpcoming: {
    color: colors.GRAY300,
    fontWeight: "500",
  },
});
