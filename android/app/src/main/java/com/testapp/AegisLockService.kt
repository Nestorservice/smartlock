package com.testapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.util.Calendar
import kotlin.math.pow
import kotlin.math.sqrt

class AegisLockService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private lateinit var sensorThread: HandlerThread
    private lateinit var sensorHandler: Handler
    private var wakeLock: PowerManager.WakeLock? = null

    private var requiredShakes = 5
    private var shakeCount = 0
    private var lastShakeTime = 0L
    private var inactivityRunnable: Runnable? = null

    companion object {
        const val CHANNEL_ID            = "aegislock_service_channel"
        const val NOTIFICATION_ID       = 2001
        const val EXTRA_REQUIRED_SHAKES = "required_shakes"
        const val EXTRA_FORMULA         = "formula"
        const val PREFS_NAME            = "aegislock_prefs"
        const val PREF_REQUIRED_SHAKES  = "required_shakes"
        const val PREF_FORMULA          = "formula"
        const val PREF_IS_ACTIVE        = "is_active"
        const val PREF_UNLOCK_REQUESTED = "unlock_requested"

        const val MAGNITUDE_THRESHOLD   = 22.0f
        const val MIN_CADENCE_MS        = 400L
        const val MAX_CADENCE_MS        = 1500L
        const val INACTIVITY_TIMEOUT_MS = 3000L

        // j = 1 (lundi) … 7 (dimanche), conforme au JS MathService
        fun currentDayJ(): Int = when (Calendar.getInstance().get(Calendar.DAY_OF_WEEK)) {
            Calendar.MONDAY    -> 1
            Calendar.TUESDAY   -> 2
            Calendar.WEDNESDAY -> 3
            Calendar.THURSDAY  -> 4
            Calendar.FRIDAY    -> 5
            Calendar.SATURDAY  -> 6
            else               -> 7  // SUNDAY
        }

        // ── Évaluateur d'expression mathématique minimal ──────────────────────
        // Supporte : entiers, j, + - * / ^ ( )   précédence standard
        fun evaluateFormula(formula: String): Int {
            val j = currentDayJ()
            val expr = formula.trim().replace("j", j.toString()).replace(" ", "")
            return try {
                maxOf(1, Parser(expr).parseExpr().toInt())
            } catch (_: Exception) {
                j  // fallback au jour actuel si la formule est invalide
            }
        }

        private class Parser(private val s: String) {
            private var i = 0

            fun parseExpr(): Double = parseAddSub()

            private fun parseAddSub(): Double {
                var v = parseMulDiv()
                while (i < s.length && (s[i] == '+' || s[i] == '-')) {
                    val op = s[i++]; val r = parseMulDiv()
                    v = if (op == '+') v + r else v - r
                }
                return v
            }

            private fun parseMulDiv(): Double {
                var v = parsePow()
                while (i < s.length && (s[i] == '*' || s[i] == '/' || s[i] == '%')) {
                    val op = s[i++]; val r = parsePow()
                    v = when (op) { '*' -> v * r; '/' -> v / r; else -> v % r }
                }
                return v
            }

            private fun parsePow(): Double {
                val base = parseUnary()
                if (i < s.length && s[i] == '^') { i++; return base.pow(parseUnary()) }
                return base
            }

            private fun parseUnary(): Double {
                if (i < s.length && s[i] == '-') { i++; return -parsePrimary() }
                if (i < s.length && s[i] == '+') { i++; return parsePrimary() }
                return parsePrimary()
            }

            private fun parsePrimary(): Double {
                if (i < s.length && s[i] == '(') {
                    i++
                    val v = parseExpr()
                    if (i < s.length && s[i] == ')') i++
                    return v
                }
                val start = i
                while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
                return s.substring(start, i).toDoubleOrNull() ?: 0.0
            }
        }
    }

    // ── LIFECYCLE ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        sensorThread = HandlerThread("AegisLockSensor")
        sensorThread.start()
        sensorHandler = Handler(sensorThread.looper)

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AegisLock:ShakeWakeLock")
        wakeLock?.acquire(10 * 60 * 60 * 1000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Formule : depuis l'intent (appel JS) ou depuis les prefs (reboot / restart système)
        val formula = intent?.getStringExtra(EXTRA_FORMULA)?.takeIf { it.isNotEmpty() }
            ?: prefs.getString(PREF_FORMULA, "j") ?: "j"

        // Réévaluation avec le jour actuel — se recalcule automatiquement après reboot
        requiredShakes = evaluateFormula(formula)
        shakeCount     = 0
        lastShakeTime  = 0L

        prefs.edit()
            .putString(PREF_FORMULA, formula)
            .putInt(PREF_REQUIRED_SHAKES, requiredShakes)
            .putBoolean(PREF_IS_ACTIVE, true)
            .putBoolean(PREF_UNLOCK_REQUESTED, false)
            .apply()

        startForeground(NOTIFICATION_ID, buildNotification(requiredShakes, 0))

        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME, sensorHandler)
        }

        return START_STICKY
    }

    // ── CAPTEUR ───────────────────────────────────────────────────────────────

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]; val y = event.values[1]; val z = event.values[2]
        val magnitude = sqrt((x * x + y * y + z * z).toDouble()).toFloat()
        if (magnitude < MAGNITUDE_THRESHOLD) return

        val now = System.currentTimeMillis()
        val timeSince = now - lastShakeTime

        if (lastShakeTime > 0 && timeSince < MIN_CADENCE_MS) return
        if (lastShakeTime > 0 && timeSince > MAX_CADENCE_MS) shakeCount = 0

        inactivityRunnable?.let { sensorHandler.removeCallbacks(it) }
        inactivityRunnable = Runnable {
            shakeCount = 0
            postNotification(requiredShakes, 0)
        }
        sensorHandler.postDelayed(inactivityRunnable!!, INACTIVITY_TIMEOUT_MS)

        lastShakeTime = now
        shakeCount++
        postNotification(requiredShakes, shakeCount)

        if (shakeCount >= requiredShakes) triggerUnlock()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ── DÉVERROUILLAGE ────────────────────────────────────────────────────────

    private fun triggerUnlock() {
        shakeCount = 0

        // PREF_IS_ACTIVE reste true : c'est un déverrouillage temporaire, pas une désactivation.
        // Le service redémarrera au prochain reboot.
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(PREF_UNLOCK_REQUESTED, true)
            .apply()

        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
        }
        startActivity(intent)
        stopSelf()
    }

    // ── NOTIFICATION ──────────────────────────────────────────────────────────

    private fun buildNotification(required: Int, current: Int): Notification {
        val pi = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        val remaining = (required - current).coerceAtLeast(0)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AegisLock — Verrou actif")
            .setContentText("$current/$required secousses — encore $remaining")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
    }

    private fun postNotification(required: Int, current: Int) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(required, current))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AegisLock Sécurité",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Détection de secousses en arrière-plan"
                setShowBadge(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    // ── DESTRUCTION ───────────────────────────────────────────────────────────

    override fun onDestroy() {
        super.onDestroy()
        sensorManager.unregisterListener(this)
        inactivityRunnable?.let { sensorHandler.removeCallbacks(it) }
        sensorThread.quitSafely()
        wakeLock?.release()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
