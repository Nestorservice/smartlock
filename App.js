/**
 * @file App.js
 * @description AegisLock — Root Application Component
 *
 * Configures the React Navigation stack with two screens:
 *   - ConfigScreen: Terminal control panel for security configuration
 *   - LockScreen: Full-screen security lock overlay
 *
 * The app launches into ConfigScreen by default. Users activate the
 * lock by navigating to LockScreen from the configuration panel.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConfigScreen from './src/screens/ConfigScreen';
import LockScreen from './src/screens/LockScreen';
import { COLORS } from './src/theme';

// ─── NAVIGATION ──────────────────────────────────────────────────────────────

/** Create the native stack navigator for screen management */
const Stack = createNativeStackNavigator();

/**
 * App — Root application component.
 *
 * Sets up the navigation container with a two-screen stack:
 *   1. ConfigScreen (initial) — Security parameter configuration
 *   2. LockScreen — Activated lock overlay
 *
 * Navigation headers are hidden to maintain the full-bleed
 * terminal aesthetic across both screens.
 *
 * @returns {React.ReactElement} The root application tree.
 */
const App = () => {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: COLORS.cyan,
          background: COLORS.background,
          card: COLORS.surface,
          text: COLORS.textPrimary,
          border: COLORS.steel,
          notification: COLORS.crimson,
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="ConfigScreen"
        screenOptions={{
          // Hide navigation headers — both screens manage their own headers
          headerShown: false,
          // Use opaque black background during transitions
          contentStyle: { backgroundColor: COLORS.background },
          // Fade transition for military terminal feel
          animation: 'fade',
        }}
      >
        {/* Configuration terminal — security parameter management */}
        <Stack.Screen
          name="ConfigScreen"
          component={ConfigScreen}
          options={{
            // Prevent returning to config from lock screen via gestures
            gestureEnabled: false,
          }}
        />

        {/* Lock screen — full-screen security barrier */}
        <Stack.Screen
          name="LockScreen"
          component={LockScreen}
          options={{
            // Block all gestures on the lock screen — no swipe to dismiss
            gestureEnabled: false,
            // Prevent the user from navigating back via the header
            headerBackVisible: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
