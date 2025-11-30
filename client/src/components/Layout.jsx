import React from 'react'
import { Link } from 'react-router-dom'

export default function Layout({ children }) {
  return (
    <div>
      <header style={{background:'#f8f9fa', padding:12}}>
        <div style={{maxWidth:960, margin:'0 auto', display:'flex', justifyContent:'space-between'}}>
          <div><Link to="/">StuHealth</Link></div>
          <nav>
            <Link to="/resources">Resources</Link> |{' '}
            <Link to="/doctors">Doctors</Link> |{' '}
            <Link to="/feedback">Feedback</Link>
          </nav>
        </div>
      </header>
      <main style={{maxWidth:960, margin:'20px auto'}}>{children}</main>
      <footer style={{background:'#f1f1f1', padding:12, marginTop:40}}>
        <div style={{maxWidth:960, margin:'0 auto'}}>© StuHealth</div>
      </footer>
    </div>
  )
}
