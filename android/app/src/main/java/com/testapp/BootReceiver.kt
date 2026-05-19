package com.testapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON") return

        val prefs = context.getSharedPreferences(AegisLockService.PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(AegisLockService.PREF_IS_ACTIVE, false)) return

        val serviceIntent = Intent(context, AegisLockService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
