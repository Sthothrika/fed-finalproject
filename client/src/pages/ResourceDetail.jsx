import React from 'react'
import { useParams } from 'react-router-dom'

export default function ResourceDetail(){
  const { id } = useParams()
  return (
    <div>
      <h2>Resource Detail</h2>
      <p>Resource id: {id}</p>
      <p>This page is a static conversion — data will be wired to API later.</p>
    </div>
  )
}
