import { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { authAPI } from '../services/api'

const LoginOriginal = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      if (isRegisterMode) {
        // 验证密码确认
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          setIsLoading(false)
          return
        }
        
        // 注册新用户
        await authAPI.register({ email, password })
        setError('')
        // 注册成功后显示成功消息，需要重新登录
        setError('Registration successful! Please sign in with your new account.')
        // 切换到登录模式，但保留邮箱地址
        setIsRegisterMode(false)
        setPassword('')
        setConfirmPassword('')
        // 保留邮箱地址，不清空
      } else {
        // 登录现有用户
        const response = await authAPI.login({ email, password })
        login(response.access_token, response.user)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || (isRegisterMode ? 'Registration failed' : 'Login failed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
  }

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value)
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword)
  }

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode)
    setError('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      margin: 0,
      padding: 0,
      color: '#1f2937',
      lineHeight: 1.6
    }}>
      <div style={{
        width: '400px',
        background: '#ffffff',
        borderRadius: '0.5rem',
        padding: '32px',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
        border: '1px solid #e5e7eb',
        margin: '40px auto',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#1f2937',
            marginBottom: '8px'
          }}>
            {isRegisterMode ? 'RAK Register' : 'RAK Login'}
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {isRegisterMode ? 'Create a new account' : 'Sign in to your account'}
          </p>
        </div>
        
        <form 
          onSubmit={(e) => {
            console.log('=== FORM onSubmit EVENT TRIGGERED ===')
            handleSubmit(e)
          }}
          onReset={() => console.log('Form reset triggered')}
          onChange={() => console.log('Form change triggered')}
        >
          
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="email" style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                boxSizing: 'border-box'
              }}
              placeholder="Enter your email"
              autoComplete="email"
              onFocus={(e) => {
                e.target.style.borderColor = '#4c1d95'
                e.target.style.boxShadow = '0 0 0 3px rgba(76, 29, 149, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label htmlFor="password" style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={handlePasswordChange}
                style={{
                  width: '100%',
                  padding: '12px 48px 12px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                onFocus={(e) => {
                  e.target.style.borderColor = '#4c1d95'
                  e.target.style.boxShadow = '0 0 0 3px rgba(76, 29, 149, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db'
                  e.target.style.boxShadow = 'none'
                }}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#6b7280',
                  fontSize: '14px',
                  padding: '4px'
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          
          {isRegisterMode && (
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="confirmPassword" style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={handleConfirmPasswordChange}
                  style={{
                    width: '100%',
                    padding: '12px 48px 12px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    outline: 'none',
                    transition: 'border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#4c1d95'
                    e.target.style.boxShadow = '0 0 0 3px rgba(76, 29, 149, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={toggleConfirmPasswordVisibility}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    fontSize: '14px',
                    padding: '4px'
                  }}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}
          
          {error && (
            <div style={{
              color: error.includes('successful') ? '#059669' : '#ef4444',
              fontSize: '0.875rem',
              marginBottom: '16px',
              padding: '8px 12px',
              background: error.includes('successful') ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${error.includes('successful') ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '0.375rem'
            }}>
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: isLoading ? '#9ca3af' : '#4c1d95',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease-in-out',
              marginBottom: '16px'
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = '#3730a3'
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.background = '#4c1d95'
              }
            }}
          >
            {isLoading 
              ? (isRegisterMode ? 'Creating Account...' : 'Logging in...') 
              : (isRegisterMode ? 'Create Account' : 'Sign In')
            }
          </button>
        </form>
        
        <div style={{
          textAlign: 'center',
          marginTop: '24px'
        }}>
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#6b7280',
            marginBottom: '8px'
          }}>
            {isRegisterMode ? 'Already have an account?' : "Don't have an account?"}
          </p>
          <button
            type="button"
            onClick={toggleMode}
            style={{
              background: 'none',
              border: 'none',
              color: '#4c1d95',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px 8px',
              borderRadius: '0.25rem',
              transition: 'background-color 0.15s ease-in-out'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {isRegisterMode ? 'Sign in instead' : 'Create an account'}
          </button>
        </div>
        
      </div>
    </div>
  )
}

export default LoginOriginal
