/**
 * Live keyboard height in pixels (0 while the keyboard is closed).
 *
 * On Android, softwareKeyboardLayoutMode: "resize" in app.json already
 * handles window resizing automatically at the OS level. Adding keyboard
 * height on Android causes double-padding (pushing footers and sheets into
 * the center of the screen, hiding content) and triggers mid-keystroke
 * re-renders that drop characters. Therefore, on Android this returns 0.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

export default useKeyboardHeight;
