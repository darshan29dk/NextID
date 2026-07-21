import { useEffect, useRef, useState } from 'react'

const DEFAULT_WARNING_AFTER = 14 * 60 * 1000  // 14 minutes
const DEFAULT_LOGOUT_AFTER = 15 * 60 * 1000   // 15 minutes

export function useInactivityTimer(onLogout, warningAfterMs = DEFAULT_WARNING_AFTER, logoutAfterMs = DEFAULT_LOGOUT_AFTER) {
  const [showWarning, setShowWarning] = useState(false)
  const warningTimerRef = useRef(null)
  const logoutTimerRef = useRef(null)

  const resetTimers = () => {
    setShowWarning(false)
    clearTimeout(warningTimerRef.current)
    clearTimeout(logoutTimerRef.current)

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
    }, warningAfterMs)

    logoutTimerRef.current = setTimeout(() => {
      onLogout()
    }, logoutAfterMs)
  }

  useEffect(() => {
    resetTimers()

    const events = ['mousemove', 'keydown', 'click', 'scroll']
    const handleActivity = () => resetTimers()

    events.forEach((event) => window.addEventListener(event, handleActivity))

    return () => {
      events.forEach((event) => window.removeEventListener(event, handleActivity))
      clearTimeout(warningTimerRef.current)
      clearTimeout(logoutTimerRef.current)
    }
    // Re-initialize timers whenever the configured durations change
    // (e.g. once real settings load from the backend)
  }, [warningAfterMs, logoutAfterMs])

  const stayActive = () => resetTimers()

  return { showWarning, stayActive }
}