import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem('ranalyzer_auth') === 'true'
  )
  const [currentUser, setCurrentUser] = useState(
    () => {
      const saved = localStorage.getItem('ranalyzer_user')
      return saved ? JSON.parse(saved) : null
    }
  )

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      const backendUser = data.user

      const user = {
        id: backendUser.id,
        email: backendUser.email,
        name: backendUser.name,
        role: backendUser.role,
        avatar: backendUser.profile_image
          ? backendUser.profile_image
          : backendUser.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .toUpperCase(),
        theme: backendUser.theme,
        allowed_menus: backendUser.allowed_menus || []
      }

      localStorage.setItem('ranalyzer_auth', 'true')
      localStorage.setItem('ranalyzer_user', JSON.stringify(user))
      setIsAuthenticated(true)
      setCurrentUser(user)
      return true
    } catch (err) {
      console.error('Login request failed:', err)
      return false
    }
  }

  const logout = async () => {
    try {
      if (currentUser?.email) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentUser.email }),
        })
      }
    } catch (err) {
      console.error('Logout logging failed:', err)
    } finally {
      localStorage.removeItem('ranalyzer_auth')
      localStorage.removeItem('ranalyzer_user')
      setIsAuthenticated(false)
      setCurrentUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}