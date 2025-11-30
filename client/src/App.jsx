import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Auth from './pages/Auth'
import Resources from './pages/Resources'
import Doctors from './pages/Doctors'

export default function App() {
  return (
    <div>
      <nav className="navbar">
        <Link to="/">Home</Link> | <Link to="/resources">Resources</Link> | <Link to="/doctors">Doctors</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/doctors" element={<Doctors />} />
        </Routes>
      </main>
    </div>
  )
}
