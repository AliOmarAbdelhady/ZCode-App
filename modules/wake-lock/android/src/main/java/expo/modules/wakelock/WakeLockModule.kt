package expo.modules.wakelock

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Holds a partial wake lock so the CPU never suspends while the app's
// background chat sync is running. The user explicitly accepts the battery
// cost in exchange for the session staying permanently live.
class WakeLockModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("WakeLock")

    Function("acquire") {
      val context = appContext.reactContext
      if (context != null) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (wakeLock == null) {
          wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ZCode:BackgroundSync").apply {
            setReferenceCounted(false)
          }
        }
        // Re-acquired on every app start; capped at 24h per hold.
        wakeLock?.acquire(24 * 60 * 60 * 1000L)
      }
      null
    }

    Function("release") {
      try {
        wakeLock?.release()
        wakeLock = null
      } catch (_: Exception) {}
      null
    }
  }
}
