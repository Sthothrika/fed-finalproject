import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

export default function Auth() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('student')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    try {
      const res = await api.post('/auth/login', { username, password, role })
      if (res.ok) {
        navigate('/resources')
      } else {
        const body = await res.json()
        setError(body.error || 'Login failed')
      }
    } catch (err) {
      setError('Network error')
    }
  }

  return (
    <div className="auth-container">
      <h2>Login</h2>
      {error && <div className="alert">{error}</div>}
      <form onSubmit={handleLogin}>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" required />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="password" type="password" required />
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="student">Student</option>
          <option value="admin">Admin</option>
        </select>
        <button>Login</button>
      </form>
    </div>
  )
}
