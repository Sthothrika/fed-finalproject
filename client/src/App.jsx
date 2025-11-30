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
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/resources" element={<Resources />} />
        <Route path="/resources/:id" element={<ResourceDetail />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/health-tips" element={<HealthTips />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/signup" element={<StudentSignup />} />
        <Route path="/student/profile" element={<StudentProfile />} />
        <Route path="/student/profile/edit" element={<StudentProfileEdit />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/signup" element={<AdminSignup />} />
        <Route path="/admin/appointments" element={<AdminAppointments />} />
        <Route path="/admin/edit/:id" element={<AdminEdit />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/support" element={<Support />} />
      </Routes>
    </Layout>
  )
}
