import { useEffect, useRef, useState } from 'react'

const WARNING_AFTER = 15000  // 15 seconds for testing
const LOGOUT_AFTER = 25000   // 25 seconds for testing

export function useInactivityTimer(onLogout) {
  const [showWarning, setShowWarning] = useState(false)
  const warningTimerRef = useRef(null)
  const logoutTimerRef = useRef(null)

  const resetTimers = () => {
    setShowWarning(false)
    clearTimeout(warningTimerRef.current)
    clearTimeout(logoutTimerRef.current)

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
    }, WARNING_AFTER)

    logoutTimerRef.current = setTimeout(() => {
      onLogout()
    }, LOGOUT_AFTER)
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
  }, [])

  const stayActive = () => resetTimers()

  return { showWarning, stayActive }
}