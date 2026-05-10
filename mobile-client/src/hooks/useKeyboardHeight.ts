import { useEffect, useState } from "react";
import { Keyboard, KeyboardEvent, Platform } from "react-native";

/**
 * Live keyboard overlap height (px). Works with Android edge-to-edge where
 * windowSoftInputMode resize is unreliable; iOS uses willShow/willHide for
 * tighter sync with the keyboard animation.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => {
      setHeight(e.endCoordinates.height);
    };
    const onHide = () => setHeight(0);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return height;
}
