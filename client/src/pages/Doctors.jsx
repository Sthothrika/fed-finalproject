import React, { useEffect, useState } from 'react'
import api from '../utils/api'

export default function Doctors() {
  const [doctors, setDoctors] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/doctors')
        if (res.ok) {
          const data = await res.json()
          setDoctors(data.doctors || [])
        }
      } catch (e) {}
    }
    load()
  }, [])

  return (
    <div>
      <h2>Doctors</h2>
      <ul>
        {doctors.map(d => (
          <li key={d.id}>{d.name} — {d.title}</li>
        ))}
      </ul>
    </div>
  )
}
