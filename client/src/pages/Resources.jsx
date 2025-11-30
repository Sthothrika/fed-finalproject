import React, { useEffect, useState } from 'react'
import api from '../utils/api'

export default function Resources() {
  const [resources, setResources] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get('/resources')
        if (res.ok) {
          const data = await res.json()
          setResources(data.resources || [])
        }
      } catch (e) {}
    }
    load()
  }, [])

  return (
    <div>
      <h2>Resources</h2>
      <ul>
        {resources.map(r => (
          <li key={r.id}>{r.title}</li>
        ))}
      </ul>
    </div>
  )
}
