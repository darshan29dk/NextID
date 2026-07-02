import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

// Two users — mocked until real backend is ready
const USERS = [
  { email: 'sania.gupta@ilantus.com', password: 'saniagupta', name: 'Sania Gupta', avatar: 'SG', role: 'Platform Administrator' },
  { email: 'darshankumar.kg@ilantus.com', password: 'darshankumar', name: 'Darshan Kumar', avatar: 'DK', role: 'Platform Administrator' },
]

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

  const login = (email, password) => {
    const user = USERS.find(u => u.email === email && u.password === password)
    if (user) {
      localStorage.setItem('ranalyzer_auth', 'true')
      localStorage.setItem('ranalyzer_user', JSON.stringify(user))
      setIsAuthenticated(true)
      setCurrentUser(user)
      return true
    }
    return false
  }

  const logout = () => {
    localStorage.removeItem('ranalyzer_auth')
    localStorage.removeItem('ranalyzer_user')
    setIsAuthenticated(false)
    setCurrentUser(null)
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