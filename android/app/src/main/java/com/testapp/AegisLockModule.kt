package com.testapp

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AegisLockModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AegisLock"

    @ReactMethod
    fun startService(formula: String, requiredShakes: Int, promise: Promise) {
        try {
            val intent = Intent(reactContext, AegisLockService::class.java).apply {
                putExtra(AegisLockService.EXTRA_FORMULA, formula)
                putExtra(AegisLockService.EXTRA_REQUIRED_SHAKES, requiredShakes)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e.message)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, AegisLockService::class.java))
            // Ne pas toucher PREF_IS_ACTIVE ici : stopService est appelé après un déverrouillage
            // temporaire (biométrie / secousses). Le verrou doit redémarrer au prochain reboot.
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message)
        }
    }

    // Désactivation explicite — à appeler depuis le bouton "Désactiver" dans ConfigScreen
    @ReactMethod
    fun deactivateLock(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, AegisLockService::class.java))
            reactContext.getSharedPreferences(AegisLockService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(AegisLockService.PREF_IS_ACTIVE, false)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DEACTIVATE_FAILED", e.message)
        }
    }

    // Demande l'exemption d'optimisation batterie — indispensable pour que le service
    // de détection continue de tourner quand l'écran est éteint.
    @ReactMethod
    fun requestBatteryExemption(promise: Promise) {
        try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(reactContext.packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_EXEMPTION_FAILED", e.message)
        }
    }

    // Indique si le verrou est actif (pour que ConfigScreen puisse naviguer vers LockScreen au démarrage)
    @ReactMethod
    fun isLockActive(promise: Promise) {
        val prefs = reactContext.getSharedPreferences(AegisLockService.PREFS_NAME, Context.MODE_PRIVATE)
        promise.resolve(prefs.getBoolean(AegisLockService.PREF_IS_ACTIVE, false))
    }

    // Appelé par LockScreen pour savoir si le service a détecté le bon nombre de secousses
    @ReactMethod
    fun checkAndConsumeUnlock(promise: Promise) {
        val prefs = reactContext.getSharedPreferences(AegisLockService.PREFS_NAME, Context.MODE_PRIVATE)
        val requested = prefs.getBoolean(AegisLockService.PREF_UNLOCK_REQUESTED, false)
        if (requested) {
            prefs.edit().putBoolean(AegisLockService.PREF_UNLOCK_REQUESTED, false).apply()
        }
        promise.resolve(requested)
    }
}
