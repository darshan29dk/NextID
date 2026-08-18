import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getSettings, FILES_BASE_URL } from '../../services/dashboardService'
import './Login.css'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoPath, setLogoPath] = useState('')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'
    document.body.className = `theme-${savedTheme}`
  }, [])

  useEffect(() => {
    // Public endpoint - no auth needed, so the uploaded company logo can
    // show up beside the rAnalyzer wordmark before the user signs in.
    getSettings()
      .then((data) => setLogoPath(data?.logo_path || ''))
      .catch(() => setLogoPath(''))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setIsLoading(true)

    const success = await login(email, password)

    if (success) {
      navigate('/dashboard')
    } else {
      setError('Invalid email or password.')
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-grid-pattern" />
        <div className="login-glow" />

        <div className="login-left-content">
          <div className="login-brand">
            {logoPath && (
              <img
                className="login-brand-icon"
                src={`${FILES_BASE_URL}/${logoPath}`}
                alt="Company logo"
              />
            )}
            <div className="login-brand-text">
              <h2>NextID</h2>
              <p>ROLE INTELLIGENCE PLATFORM</p>
            </div>
          </div>

          <div className="login-heading">
            <span className="white">Discover<br /></span>
            <span className="blue">Engineer<br /></span>
            <span className="white">Govern<br /></span>
            <span className="muted">Optimize</span>
          </div>

          <blockquote className="login-quote">
            "Build an enterprise RBAC model from existing identity and access data."
          </blockquote>
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-box">
          <div className="login-form-brand">
            {logoPath && (
              <img
                className="login-form-brand-icon"
                src={`${FILES_BASE_URL}/${logoPath}`}
                alt="Company logo"
              />
            )}
            <span className="login-form-brand-name">NextID</span>
          </div>
          <h1>Welcome Back</h1>
          <p className="login-subtitle">Sign in to the Role Intelligence Platform</p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-form-group">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
                placeholder="you@ilantus.com"
              />
            </div>

            <div className="login-form-group">
              <label>Password</label>
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <div className="login-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <Link to="/forgot-password" className="login-forgot">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login