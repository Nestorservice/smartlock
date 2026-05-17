/**
 * AegisLock — MainActivity
 *
 * Overrides the default React Native activity to add lock screen capability.
 * WindowManager flags ensure the activity displays above the device lock screen,
 * dismisses the keyguard, keeps the screen on, and turns the screen on when launched.
 *
 * These flags are critical for AegisLock to function as a true security lock screen
 * that cannot be bypassed by the device's native lock mechanisms.
 */

package com.testapp

import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript.
   * This must match the name used in AppRegistry.registerComponent() in index.js.
   */
  override fun getMainComponentName(): String = "TestApp"

  /**
   * Override onCreate to apply WindowManager flags that allow AegisLock
   * to operate as a lock screen overlay.
   *
   * Flags applied:
   *   - FLAG_SHOW_WHEN_LOCKED: Display the activity over the device lock screen
   *   - FLAG_DISMISS_KEYGUARD: Dismiss the system keyguard when this activity is shown
   *   - FLAG_KEEP_SCREEN_ON: Prevent the screen from turning off while active
   *   - FLAG_TURN_SCREEN_ON: Wake the screen when this activity is launched
   */
  @Suppress("DEPRECATION")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Apply window flags for lock screen override behavior
    // These flags are set at the window level to ensure they take effect
    // before the React Native surface is mounted
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
      WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
      WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
    )
  }

  /**
   * Returns the instance of the [ReactActivityDelegate].
   * Uses [DefaultReactActivityDelegate] which supports the New Architecture
   * via the [fabricEnabled] flag.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
