import { useState, useEffect } from 'react'
import useSWR from 'swr'
import Head from 'next/head'

const fetcher = (url) => fetch(url).then(r => r.json())

function useApiBase() {
  const [apiBase, setApiBase] = useState('http://127.0.0.1:8020')
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDev = window.location.origin === 'http://localhost:3000'
      const base = isDev ? (process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8020') : window.location.origin
      setApiBase(base)
    }
  }, [])
  return apiBase
}

function ProfileBox() {
  const apiBase = useApiBase()
  const { data } = useSWR(apiBase ? `${apiBase}/auth/me` : null, fetcher)
  if (!data || data.error) return null
  return (
    <div style={{display:'flex', alignItems:'center', gap:12}}>
      <div style={{width:40, height:40, background:'#1DB954', color:'#fff', borderRadius:8, display:'grid', placeItems:'center', fontWeight:700}}>
        {(data.display_name || 'U').slice(0, 1)}
      </div>
      <div>
        <div style={{fontWeight:700}}>{data.display_name}</div>
        <div style={{color:'#666', fontSize:12}}>{data.spotify_id}</div>
      </div>
    </div>
  )
}

function AuthButton() {
  const apiBase = useApiBase()
  const { data } = useSWR(apiBase ? `${apiBase}/auth/me` : null, fetcher)

  const doLogout = () => {
    window.location.href = `${apiBase}/auth/logout`
  }

  if (!data || data.error) {
    return (
      <a
        href={`${apiBase}/auth/login`}
        target="_self"
        rel="noopener"
        style={{background:'#1DB954', color:'#000', padding:'10px 20px', borderRadius:8, fontWeight:700, textDecoration:'none', fontSize:15}}
      >
        Login with Spotify
      </a>
    )
  }
  return (
    <button onClick={doLogout} style={{background:'#fff', color:'#000', padding:'8px 16px', borderRadius:8, border:'1px solid #ddd', cursor:'pointer', fontWeight:600}}>
      Logout
    </button>
  )
}

export default function Home() {
  const apiBase = useApiBase()
  const { data: profileData } = useSWR(apiBase ? `${apiBase}/auth/me` : null, fetcher)
  const isLoggedIn = profileData && !profileData.error

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <Head><title>Spotify Viewer</title></Head>

      <div style={{padding:'20px 24px', maxWidth:960, margin:'0 auto', width:'100%', flex:1}}>
        <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32}}>
          <div>
            <h1 style={{margin:0, fontSize:24}}>🎵 spotify-viewer</h1>
            <div style={{color:'#666', fontSize:13}}>Personal Spotify analytics</div>
          </div>
          <ProfileBox />
        </header>

        <main>
          {/* Hero */}
          <section style={{display:'flex', gap:24, alignItems:'center', padding:28, background:'linear-gradient(135deg, #0f4c81 0%, #1DB954 100%)', color:'#fff', borderRadius:12}}>
            <div style={{flex:1}}>
              <h2 style={{margin:'0 0 8px 0', fontSize:22}}>See your listening trends</h2>
              <p style={{margin:0, opacity:0.85, lineHeight:1.5}}>
                Connect with Spotify to view top tracks, artists, genres, and listening patterns — all in one place.
              </p>
            </div>
            <div>
              <AuthButton />
            </div>
          </section>

          {/* Navigation cards */}
          {isLoggedIn && (
            <div style={{marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
              <a href="/dashboard" style={{display:'block', padding:20, background:'#fff', border:'1px solid #e0e0e0', borderRadius:12, textDecoration:'none', color:'inherit', transition:'box-shadow 0.2s'}}>
                <div style={{fontSize:28, marginBottom:8}}>📊</div>
                <div style={{fontWeight:700, fontSize:16, marginBottom:4}}>Dashboard</div>
                <div style={{color:'#666', fontSize:13}}>View your top artists, tracks, genres, and listening clock.</div>
              </a>
              <a href="/import" style={{display:'block', padding:20, background:'#fff', border:'1px solid #e0e0e0', borderRadius:12, textDecoration:'none', color:'inherit', transition:'box-shadow 0.2s'}}>
                <div style={{fontSize:28, marginBottom:8}}>📥</div>
                <div style={{fontWeight:700, fontSize:16, marginBottom:4}}>Import Data</div>
                <div style={{color:'#666', fontSize:13}}>Upload your Spotify data export for all-time listening history.</div>
              </a>
            </div>
          )}

          {!isLoggedIn && (
            <div style={{marginTop:24, padding:20, background:'#fff', border:'1px solid #e0e0e0', borderRadius:12, textAlign:'center', color:'#666'}}>
              <div style={{fontSize:32, marginBottom:8}}>👆</div>
              <p style={{margin:0}}>Sign in with Spotify above to get started</p>
            </div>
          )}
        </main>
      </div>

      <footer style={{padding:'16px 24px', textAlign:'center', color:'#999', fontSize:12, borderTop:'1px solid #eee'}}>
        spotify-viewer &middot; Personal use only &middot; Data stays on your machine
      </footer>
    </div>
  )
}

