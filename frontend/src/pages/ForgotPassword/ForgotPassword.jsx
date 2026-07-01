import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Network, CheckCircle2 } from 'lucide-react'
import './ForgotPassword.css'

function ForgotPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState('EMAIL') // EMAIL -> OTP -> RESET -> SUCCESS

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [timer, setTimer] = useState(0)

  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null), useRef(null), useRef(null)]

  // Apply saved theme on forgot password page
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'
    document.body.className = `theme-${savedTheme}`
  }, [])

  useEffect(() => {
    if (step === 'OTP' && otpRefs[0].current) {
      otpRefs[0].current.focus()
    }
  }, [step])

  useEffect(() => {
    if (step === 'OTP' && timer > 0) {
      const interval = setInterval(() => {
        setTimer((prev) => prev - 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [step, timer])

  const validateEmail = (val) =>
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(val)

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required.'); return }
    if (!validateEmail(email.trim())) { setError('Please enter a valid email address.'); return }
    setError('')
    setIsLoading(true)
    // Mocked — replace with real FastAPI call later
    setTimeout(() => {
      setIsLoading(false)
      setStep('OTP')
      setTimer(60)
    }, 700)
  }

  const handleOtpChange = (value, index) => {
    if (value && isNaN(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (error) setError('')
    if (value && index < 5) otpRefs[index + 1].current.focus()
  }

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp]
      newOtp[index - 1] = ''
      setOtp(newOtp)
      otpRefs[index - 1].current.focus()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').trim()
    if (pasted.length === 6 && /^\d+$/.test(pasted)) {
      setOtp(pasted.split(''))
      otpRefs[5].current.focus()
    }
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    const otpValue = otp.join('')
    if (otpValue.length < 6) { setError('Please enter the full 6-digit code.'); return }
    // Mocked — replace with real backend OTP verification later
    if (otpValue !== '123456') { setError('Invalid OTP. Use 123456 for testing.'); return }
    setError('')
    setStep('RESET')
  }

  const handleResetSubmit = (e) => {
    e.preventDefault()
    if (!password) { setError('Password is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setError('')
    setStep('SUCCESS')
  }

  return (
    <div className="forgot-container">
      {/* Left Branding Panel */}
      <div className="forgot-left">
        <div className="forgot-grid-pattern" />
        <div className="forgot-glow" />

        <div className="forgot-left-content">
          <div className="forgot-brand">
            <div className="forgot-brand-icon">
              <Network size={26} color="#ffffff" />
            </div>
            <div className="forgot-brand-text">
              <h2>rAnalyzer</h2>
              <p>ROLE INTELLIGENCE PLATFORM</p>
            </div>
          </div>

          <div className="forgot-heading">
            <span className="white">Discover.<br /></span>
            <span className="blue">Engineer.<br /></span>
            <span className="white">Govern.<br /></span>
            <span className="muted">Optimize.</span>
          </div>

          <blockquote className="forgot-quote">
            "Build an enterprise RBAC model from existing identity and access data."
          </blockquote>
        </div>
      </div>

      {/* Right Panel */}
      <div className="forgot-right">
        <div className="forgot-form-box">

          {/* STEP 1: Email */}
          {step === 'EMAIL' && (
            <>
              <h1>Forgot Password</h1>
              <p className="forgot-subtitle">
                Enter your registered email address to receive a verification code.
              </p>

              {error && <div className="forgot-error">{error}</div>}

              <form onSubmit={handleEmailSubmit} className="forgot-form">
                <div className="forgot-form-group">
                  <label>Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (error) setError('') }}
                    placeholder="you@company.com"
                  />
                </div>

                <button type="submit" className="forgot-btn" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>

              <div className="forgot-footer">
                <Link to="/login">← Back to Login</Link>
              </div>
            </>
          )}

          {/* STEP 2: OTP */}
          {step === 'OTP' && (
            <>
              <button
                className="forgot-back-btn"
                onClick={() => { setStep('EMAIL'); setError(''); setOtp(['', '', '', '', '', '']) }}
              >
                ← Back
              </button>

              <h1>Enter OTP</h1>
              <p className="forgot-subtitle">
                We've sent a 6-digit code to <strong className="forgot-highlight">{email}</strong>.
                <br />Use <strong className="forgot-highlight">123456</strong> for testing.
              </p>

              {error && <div className="forgot-error">{error}</div>}

              <form onSubmit={handleOtpSubmit} className="forgot-form">
                <div className="otp-wrapper">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={otpRefs[idx]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(e.target.value, idx)}
                      onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                      onPaste={handleOtpPaste}
                      className="otp-input"
                    />
                  ))}
                </div>

                <button type="submit" className="forgot-btn">
                  Verify OTP
                </button>
              </form>

              <div className="otp-resend">
                {timer > 0 ? (
                  <span>Resend code in <strong className="forgot-highlight">{timer}s</strong></span>
                ) : (
                  <button onClick={() => { setOtp(['', '', '', '', '', '']); setError(''); setTimer(60) }}>
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          )}

          {/* STEP 3: Reset Password */}
          {step === 'RESET' && (
            <>
              <button
                className="forgot-back-btn"
                onClick={() => { setStep('OTP'); setError('') }}
              >
                ← Back
              </button>

              <h1>Reset Password</h1>
              <p className="forgot-subtitle">Create a strong new password for your account.</p>

              {error && <div className="forgot-error">{error}</div>}

              <form onSubmit={handleResetSubmit} className="forgot-form">
                <div className="forgot-form-group">
                  <label>New Password</label>
                  <div className="forgot-password-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (error) setError('') }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="forgot-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="forgot-form-group">
                  <label>Confirm Password</label>
                  <div className="forgot-password-wrapper">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); if (error) setError('') }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="forgot-password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="forgot-btn">
                  Reset Password
                </button>
              </form>
            </>
          )}

          {/* STEP 4: Success */}
          {step === 'SUCCESS' && (
            <div className="forgot-success">
              <div className="forgot-success-icon">
                <CheckCircle2 size={32} color="#10b981" />
              </div>
              <h1>Password Reset Successfully</h1>
              <p>Your password has been reset. You can now log in with your new password.</p>
              <Link to="/login" className="forgot-success-btn">
                Back to Login
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default ForgotPassword