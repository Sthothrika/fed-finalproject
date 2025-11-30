import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Auth from './pages/Auth'
import Resources from './pages/Resources'
import Doctors from './pages/Doctors'
import Layout from './components/Layout'
import ResourceDetail from './pages/ResourceDetail'
import FeedbackPage from './pages/Feedback'
import HealthTips from './pages/HealthTips'
import StudentDashboard from './pages/StudentDashboard'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/resources/:id" element={<ResourceDetail />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/health-tips" element={<HealthTips />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
      </Routes>
    </Layout>
  )
}
