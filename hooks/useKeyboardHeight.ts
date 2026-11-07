/**
 * Live keyboard height in pixels (0 while the keyboard is closed).
 *
 * Android edge-to-edge no longer resizes the window for us, so scrollable
 * screens add this to their bottom padding to keep the last rows reachable
 * above the keyboard instead of hidden behind it.
 */

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event) =>
      setHeight(event.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

export default useKeyboardHeight;
