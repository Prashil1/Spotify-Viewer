import useSWR from 'swr'
import {useRouter} from 'next/router'
import {useEffect, useState} from 'react'
import Head from 'next/head'

const fetcher = (url) =>
  fetch(url).then(r => {
    if (!r.ok) {
      const err = new Error(`${r.status} ${r.statusText}`)
      err.status = r.status
      throw err
    }
    return r.json()
  })

// Helper function to format time
function formatTime(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Recently Played Timeline Component
function RecentlyPlayedTimeline({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/recently-played?limit=50` : null, fetcher, {
    refreshInterval: 2 * 60 * 1000, // Refresh every 2 minutes (most frequently updated)
    dedupingInterval: 30 * 1000,
  })
  
  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load recently played: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading recently played…</div>
  
  const items = data.items || []
  
  return (
    <div style={{display:'grid', gap:12}}>
      <h3>Recently Played Tracks</h3>
      <div style={{display:'grid', gap:8}}>
        {items.map((item, idx) => {
          const track = item.track
          return (
            <div key={`${track.id}-${idx}`} style={{display:'flex', gap:12, padding:12, border:'1px solid #eee', borderRadius:8, background:'#fafafa'}}>
              <img src={(track.album?.images?.[0]?.url) || ''} alt="cover" style={{width:64, height:64, objectFit:'cover', borderRadius:6}} />
              <div style={{flex:1}}>
                <div style={{fontWeight:700}}>{track.name}</div>
                <div style={{color:'#666', fontSize:12}}>{track.artists?.map(a=>a.name).join(', ')}</div>
                <div style={{color:'#999', fontSize:11, marginTop:4}}>🕐 {formatTime(item.played_at)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Time Range Comparison Component
function TimeRangeComparison({ apiBase }) {
  const [activeRange, setActiveRange] = useState('medium_term')
  const ranges = [
    { key: 'short_term', label: 'Last 4 Weeks', emoji: '📅' },
    { key: 'medium_term', label: 'Last 6 Months', emoji: '📊' },
    { key: 'long_term', label: 'All Time', emoji: '⭐' }
  ]
  
  const { data, error } = useSWR(apiBase ? `${apiBase}/summary?time_range=${activeRange}&limit=10` : null, fetcher, {
    refreshInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    dedupingInterval: 60 * 1000,
  })
  
  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading…</div>
  
  return (
    <div>
      <h3>Time Range Comparison</h3>
      <div style={{display:'flex', gap:8, marginBottom:20, flexWrap:'wrap'}}>
        {ranges.map(r => (
          <button 
            key={r.key}
            onClick={() => setActiveRange(r.key)}
            style={{
              padding:'8px 16px',
              borderRadius:8,
              border: activeRange === r.key ? '2px solid #1DB954' : '1px solid #ddd',
              background: activeRange === r.key ? '#e8f5e9' : '#fff',
              cursor:'pointer',
              fontWeight: activeRange === r.key ? '700' : '400'
            }}
          >
            {r.emoji} {r.label}
          </button>
        ))}
      </div>
      
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24}}>
        <div>
          <h4>Top Artists</h4>
          <div style={{display:'grid', gap:8}}>
            {data.top_artists?.items?.map(a => (
              <div key={a.id} style={{display:'flex', alignItems:'center', gap:12, padding:8, border:'1px solid #eee', borderRadius:8}}>
                <img src={(a.images?.[0]?.url) || ''} alt="artist" style={{width:48, height:48, objectFit:'cover', borderRadius:6}} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{a.name}</div>
                  <div style={{color:'#666', fontSize:12}}>{a.followers?.total.toLocaleString()} followers</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h4>Top Tracks</h4>
          <div style={{display:'grid', gap:8}}>
            {data.top_tracks?.items?.map(t => (
              <div key={t.id} style={{display:'flex', gap:8, padding:8, border:'1px solid #eee', borderRadius:8}}>
                <img src={(t.album?.images?.[0]?.url) || ''} alt="cover" style={{width:48, height:48, objectFit:'cover', borderRadius:6}} />
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700, fontSize:14}}>{t.name}</div>
                  <div style={{color:'#666', fontSize:12}}>{t.artists?.map(a=>a.name).join(', ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Artist Dominance Chart Component
function ArtistDominance({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/recently-played?limit=50` : null, fetcher, {
    refreshInterval: 2 * 60 * 1000,
    dedupingInterval: 30 * 1000,
  })
  
  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading…</div>
  
  // Count artist frequencies
  const artistCounts = {}
  const artistImages = {}
  data.items?.forEach(item => {
    item.track.artists?.forEach(artist => {
      const name = artist.name
      artistCounts[name] = (artistCounts[name] || 0) + 1
      if (!artistImages[name] && item.track.album?.images?.[0]) {
        artistImages[name] = item.track.album.images[0].url
      }
    })
  })
  
  // Sort by count
  const sorted = Object.entries(artistCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
  
  const maxCount = sorted[0]?.[1] || 1
  
  return (
    <div>
      <h3>Artist Dominance (Last 50 Plays)</h3>
      <div style={{display:'grid', gap:12}}>
        {sorted.map(([artist, count]) => (
          <div key={artist}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
              <span style={{fontWeight:700}}>{artist}</span>
              <span style={{color:'#666'}}>{count} plays</span>
            </div>
            <div style={{height:24, background:'#f0f0f0', borderRadius:4, overflow:'hidden'}}>
              <div style={{
                height:'100%',
                width: `${(count / maxCount) * 100}%`,
                background:'#1DB954',
                transition:'width 0.3s'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Discovery Stats Component
function DiscoveryStats({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/recently-played?limit=50` : null, fetcher, {
    refreshInterval: 2 * 60 * 1000,
    dedupingInterval: 30 * 1000,
  })
  
  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading…</div>
  
  const items = data.items || []
  const uniqueArtists = new Set()
  const uniqueTracks = new Set()
  
  items.forEach(item => {
    uniqueTracks.add(item.track.id)
    item.track.artists?.forEach(artist => {
      uniqueArtists.add(artist.id)
    })
  })
  
  const diversity = ((uniqueArtists.size / items.length) * 100).toFixed(1)
  
  return (
    <div>
      <h3>Discovery Stats (Last 50 Plays)</h3>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16}}>
        <div style={{padding:16, background:'#f0f5ff', borderRadius:8}}>
          <div style={{fontSize:12, color:'#666', marginBottom:8}}>Total Plays</div>
          <div style={{fontSize:32, fontWeight:'700'}}>{items.length}</div>
        </div>
        
        <div style={{padding:16, background:'#f0fff4', borderRadius:8}}>
          <div style={{fontSize:12, color:'#666', marginBottom:8}}>Unique Artists</div>
          <div style={{fontSize:32, fontWeight:'700'}}>{uniqueArtists.size}</div>
        </div>
        
        <div style={{padding:16, background:'#fff9f0', borderRadius:8}}>
          <div style={{fontSize:12, color:'#666', marginBottom:8}}>Unique Tracks</div>
          <div style={{fontSize:32, fontWeight:'700'}}>{uniqueTracks.size}</div>
        </div>
        
        <div style={{padding:16, background:'#f9f0ff', borderRadius:8}}>
          <div style={{fontSize:12, color:'#666', marginBottom:8}}>Artist Diversity</div>
          <div style={{fontSize:32, fontWeight:'700'}}>{diversity}%</div>
        </div>
      </div>
      
      <div style={{marginTop:20, padding:16, background:'#e8f5e9', borderRadius:8}}>
        <div style={{fontSize:14, fontWeight:'700', marginBottom:8}}>💡 Insight</div>
        {uniqueArtists.size / items.length > 0.4 ? (
          <div>You have great artist diversity! You listen to a wide range of artists.</div>
        ) : (
          <div>You have a loyal listening pattern, focusing on favorite artists frequently.</div>
        )}
      </div>
    </div>
  )
}

// Imported All-Time Tracks Component
function ImportedAllTimeTracks({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/imported-tracks?limit=100` : null, fetcher, {
    refreshInterval: 10 * 60 * 1000, // Refresh every 10 minutes (least frequent)
    dedupingInterval: 2 * 60 * 1000,
  })
  const { data: summary } = useSWR(apiBase ? `${apiBase}/imported-summary` : null, fetcher)
  
  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load imported tracks: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading imported tracks…</div>
  
  const items = data.items || []
  
  if (items.length === 0) {
    return <div style={{padding:24, textAlign:'center', color:'#999', background:'#f9f9f9', borderRadius:8}}>
      <div style={{fontSize:16, marginBottom:12}}>📤 No imported tracks yet</div>
      <div style={{fontSize:13}}>Import your Spotify extended listening history from the <strong>Import</strong> page</div>
    </div>
  }
  
  // Helper to estimate duration based on play count (avg ~3.5 min per play)
  const estimateDuration = (playCount, totalMs) => {
    if (totalMs && totalMs > 0) {
      const totalMinutes = Math.floor(totalMs / 60000)
      if (totalMinutes < 60) {
        return `${totalMinutes} min`
      }
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      return `${hours}h ${minutes}m`
    }
    // Estimate: 3.5 minutes per play on average
    const estimatedMs = playCount * 210000 // 3.5 min = 210,000 ms
    const totalMinutes = Math.floor(estimatedMs / 60000)
    if (totalMinutes < 60) {
      return `~${totalMinutes} min`
    }
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `~${hours}h ${minutes}m`
  }
  
  return (
    <div style={{display:'grid', gap:12}}>
      <h3>All-Time Most Played (from Imported Data)</h3>
      <div style={{fontSize:12, color:'#666', marginBottom:12}}>Showing {items.length} tracks sorted by play count</div>
      <div style={{display:'grid', gap:8}}>
        {items.map((track, idx) => (
          <div key={`${track.artist}-${track.name}-${idx}`} style={{display:'flex', alignItems:'center', gap:12, padding:12, border:'1px solid #eee', borderRadius:8, background:'#fafafa'}}>
            <div style={{fontSize:14, fontWeight:'700', color:'#1DB954', minWidth:32}}>{idx + 1}.</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700}}>{track.name}</div>
              <div style={{color:'#666', fontSize:12}}>{track.artist}</div>
            </div>
            <div style={{textAlign:'right', minWidth:140}}>
              <div style={{fontSize:14, fontWeight:'700', color:'#1DB954'}}>{track.play_count}</div>
              <div style={{color:'#999', fontSize:11}}>plays</div>
              <div style={{color:'#666', fontSize:11, marginTop:4}}>{estimateDuration(track.play_count, track.total_ms)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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

// Tab styles helper
function TabButton({ label, emoji, isActive, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding:'10px 16px',
        marginRight:8,
        marginBottom:8,
        borderRadius:8,
        border: isActive ? '2px solid #1DB954' : '1px solid #ddd',
        background: disabled ? '#f4f4f4' : (isActive ? '#e8f5e9' : '#fff'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: isActive ? '700' : '500',
        fontSize:'14px',
        color: disabled ? '#999' : '#000'
      }}
    >
      {emoji} {label}
    </button>
  )
}

function ProfileHead() {
  const apiBase = useApiBase()
  const { data } = useSWR(apiBase ? `${apiBase}/auth/me` : null, fetcher)
  if (!data || data.error) return null
  return (
    <div style={{display:'flex', alignItems:'center', gap:12}}>
      <div style={{width:40, height:40, background:'#1DB954', color:'#fff', borderRadius:8, display:'grid', placeItems:'center', fontWeight:700}}>{(data.display_name||'U').slice(0,1)}</div>
      <div>
        <div style={{fontWeight:700}}>{data.display_name}</div>
        <div style={{color:'#666', fontSize:12}}>{data.spotify_id}</div>
      </div>
    </div>
  )
}

// Now Playing indicator — shows what's currently playing (if anything)
function NowPlaying({ apiBase }) {
  const { data } = useSWR(apiBase ? `${apiBase}/now-playing` : null, fetcher, {
    refreshInterval: 30 * 1000,
    dedupingInterval: 10 * 1000,
  })
  if (!data || !data.is_playing || !data.item) return null
  const track = data.item
  return (
    <div style={{display:'flex', alignItems:'center', gap:8, padding:'6px 14px', background:'#e8f5e9', borderRadius:8, fontSize:13}}>
      <span style={{animation:'pulse 1.5s ease-in-out infinite', width:8, height:8, borderRadius:'50%', background:'#1DB954', display:'inline-block', flexShrink:0}} />
      {track.album?.images?.[2]?.url && (
        <img src={track.album.images[2].url} alt="" style={{width:24, height:24, borderRadius:4}} />
      )}
      <span style={{fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:200}}>{track.name}</span>
      <span style={{color:'#666', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:160}}>— {track.artists?.map(a => a.name).join(', ')}</span>
    </div>
  )
}

// Genre Cloud — extracts genres from top artists and displays as a tag cloud
function GenreCloud({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/top-artists?limit=50&time_range=medium_term` : null, fetcher, {
    refreshInterval: 10 * 60 * 1000,
    dedupingInterval: 2 * 60 * 1000,
  })

  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load genres: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading genres…</div>

  const genreCounts = {}
  ;(data.items || []).forEach(artist => {
    ;(artist.genres || []).forEach(genre => {
      genreCounts[genre] = (genreCounts[genre] || 0) + 1
    })
  })

  const sorted = Object.entries(genreCounts).sort(([, a], [, b]) => b - a)
  if (sorted.length === 0) {
    return <div style={{padding:24, textAlign:'center', color:'#999'}}>No genre data available from your top artists.</div>
  }

  const maxCount = sorted[0][1]
  const topGenres = sorted.slice(0, 25)

  return (
    <div>
      <h3 style={{marginBottom:4}}>Your Top Genres</h3>
      <p style={{color:'#666', fontSize:13, marginBottom:16}}>Derived from your top 50 artists (last 6 months)</p>
      <div style={{display:'flex', flexWrap:'wrap', gap:8, marginBottom:24}}>
        {topGenres.map(([genre, count]) => {
          const ratio = count / maxCount
          const opacity = 0.3 + ratio * 0.7
          const fontSize = 0.75 + ratio * 0.5
          return (
            <span key={genre} style={{
              padding:'6px 14px',
              borderRadius:20,
              background:`rgba(29, 185, 84, ${opacity})`,
              color: opacity > 0.6 ? '#fff' : '#111',
              fontSize:`${fontSize}rem`,
              fontWeight: ratio > 0.7 ? 700 : 500,
              lineHeight:1.4,
            }}>
              {genre}
            </span>
          )
        })}
      </div>

      {/* Top 10 list with bar chart */}
      <h4 style={{marginBottom:12}}>Genre Breakdown</h4>
      <div style={{display:'grid', gap:10}}>
        {sorted.slice(0, 10).map(([genre, count]) => (
          <div key={genre}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:3}}>
              <span style={{fontWeight:600, fontSize:14}}>{genre}</span>
              <span style={{color:'#666', fontSize:13}}>{count} artist{count !== 1 ? 's' : ''}</span>
            </div>
            <div style={{height:20, background:'#f0f0f0', borderRadius:4, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${(count / maxCount) * 100}%`, background:'linear-gradient(90deg, #1DB954, #1ed760)', borderRadius:4, transition:'width 0.3s'}} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Listening Clock — shows hour-of-day distribution from recently played tracks
function ListeningClock({ apiBase }) {
  const { data, error } = useSWR(apiBase ? `${apiBase}/recently-played?limit=50` : null, fetcher, {
    refreshInterval: 2 * 60 * 1000,
    dedupingInterval: 30 * 1000,
  })

  if (error) return <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>Failed to load: {error.message}</div>
  if (!data) return <div style={{padding:12}}>⏳ Loading listening clock…</div>

  const items = data.items || []
  const hourCounts = new Array(24).fill(0)
  const dayOfWeekCounts = new Array(7).fill(0)
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayFullLabels = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

  items.forEach(item => {
    const d = new Date(item.played_at)
    hourCounts[d.getHours()]++
    dayOfWeekCounts[d.getDay()]++
  })

  const timeLabels = ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm']
  const maxHour = Math.max(...hourCounts, 1)
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
  const maxDay = Math.max(...dayOfWeekCounts, 1)
  const peakDay = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))

  // Determine listening period label
  let periodLabel = 'Night Owl 🦉'
  if (peakHour >= 5 && peakHour < 12) periodLabel = 'Early Bird 🐦'
  else if (peakHour >= 12 && peakHour < 17) periodLabel = 'Afternoon Listener ☀️'
  else if (peakHour >= 17 && peakHour < 21) periodLabel = 'Evening Listener 🌆'

  return (
    <div>
      <h3 style={{marginBottom:4}}>Listening Clock</h3>
      <p style={{color:'#666', fontSize:13, marginBottom:20}}>When you listen most (based on last {items.length} plays)</p>

      {/* Hour-of-day bar chart */}
      <div style={{marginBottom:32}}>
        <h4 style={{marginBottom:12}}>By Hour of Day</h4>
        <div style={{display:'grid', gridTemplateColumns:'repeat(24, 1fr)', gap:2, alignItems:'end', height:100}}>
          {hourCounts.map((count, hour) => (
            <div key={hour} title={`${timeLabels[hour]}: ${count} plays`} style={{
              width:'100%',
              height: count > 0 ? `${Math.max((count / maxHour) * 100, 4)}%` : '0%',
              background: hour === peakHour ? '#1DB954' : '#c8e6c9',
              borderRadius:'3px 3px 0 0',
              transition:'height 0.3s',
              cursor:'default',
            }} />
          ))}
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(24, 1fr)', gap:2, marginTop:4}}>
          {timeLabels.map((label, i) => (
            <div key={i} style={{textAlign:'center', fontSize:9, color:'#999'}}>
              {i % 3 === 0 ? label : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Day-of-week bar chart */}
      <div style={{marginBottom:24}}>
        <h4 style={{marginBottom:12}}>By Day of Week</h4>
        <div style={{display:'grid', gap:8}}>
          {dayLabels.map((label, i) => (
            <div key={label} style={{display:'flex', alignItems:'center', gap:12}}>
              <span style={{width:30, fontSize:13, color:'#666', fontWeight:i === peakDay ? 700 : 400}}>{label}</span>
              <div style={{flex:1, height:22, background:'#f0f0f0', borderRadius:4, overflow:'hidden'}}>
                <div style={{
                  height:'100%',
                  width:`${(dayOfWeekCounts[i] / maxDay) * 100}%`,
                  background: i === peakDay ? '#1DB954' : '#c8e6c9',
                  borderRadius:4,
                  transition:'width 0.3s',
                }} />
              </div>
              <span style={{width:30, textAlign:'right', fontSize:13, color:'#666'}}>{dayOfWeekCounts[i]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Insight */}
      <div style={{padding:14, background:'#e8f5e9', borderRadius:8}}>
        <div style={{fontWeight:700, marginBottom:6}}>💡 Your Listening Profile</div>
        <div>You're a <strong>{periodLabel}</strong> — peak listening at <strong>{timeLabels[peakHour]}</strong> ({hourCounts[peakHour]} plays), mostly on <strong>{dayFullLabels[peakDay]}</strong>.</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const { query } = router
  const [showSuccess, setShowSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const apiBase = useApiBase()
  
  useEffect(()=>{
    if (query.auth === 'success') {
      setShowSuccess(true)
      const t = setTimeout(()=>setShowSuccess(false), 3500)
      return ()=>clearTimeout(t)
    }
  }, [query])

  const { data, error } = useSWR(apiBase ? `${apiBase}/summary` : null, fetcher, { 
    refreshInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    dedupingInterval: 60 * 1000,     // Wait at least 1 minute between requests
  })
  const { data: profile } = useSWR(apiBase ? `${apiBase}/auth/me` : null, fetcher, {
    refreshInterval: 10 * 60 * 1000,
    dedupingInterval: 2 * 60 * 1000,
  })
  const { data: importedSummary } = useSWR(apiBase ? `${apiBase}/imported-summary` : null, fetcher)

  const doLogout = () => {
    // Backend logout is a GET route that clears the session and redirects to /
    window.location.href = `${apiBase}/auth/logout`
  }

  const hasImported = importedSummary && importedSummary.total_plays > 0
  const tabs = [
    { id: 'overview', label: 'Overview', emoji: '🎵' },
    { id: 'recently-played', label: 'Recently Played', emoji: '🕐' },
    { id: 'time-range', label: 'Time Range', emoji: '📊' },
    { id: 'genres', label: 'Genres', emoji: '🎸' },
    { id: 'listening-clock', label: 'Listening Clock', emoji: '⏰' },
    { id: 'artist-dominance', label: 'Artist Dominance', emoji: '🎤' },
    { id: 'discovery', label: 'Discovery Stats', emoji: '🔍' },
    { id: 'all-time', label: 'All-Time', emoji: '📈', disabled: !hasImported }
  ]

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <Head><title>Dashboard — Spotify Viewer</title></Head>
      <div style={{padding:'20px 24px', maxWidth:1080, margin:'0 auto', width:'100%', flex:1}}>
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12, marginBottom:8}}>
        <div>
          <h1 style={{margin:0, fontSize:22}}>📊 Your Dashboard</h1>
          <div style={{color:'#666', fontSize:13}}>Personal listening analytics</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
          <NowPlaying apiBase={apiBase} />
          <a href="/" style={{padding:'8px 12px', borderRadius:8, background:'#f0f0f0', border:'1px solid #ddd', textDecoration:'none', color:'#333', fontWeight:600, fontSize:13}}>🏠 Home</a>
          <ProfileHead />
          {profile && !profile.error && (
            <button onClick={doLogout} style={{padding:'8px 12px', borderRadius:8, background:'#eee', border:'1px solid #ddd', cursor:'pointer', fontSize:13}}>Logout</button>
          )}
        </div>
      </header>

      {showSuccess && <div style={{marginTop:12, padding:12, background:'#e6ffed', border:'1px solid #b7f3c8', borderRadius:8}}>Successfully connected to Spotify 🎉</div>}

      <main style={{marginTop:24}}>
        {/* Tab Navigation */}
        <div style={{marginBottom:24, padding:16, background:'#f9f9f9', borderRadius:8, borderBottom:'1px solid #eee'}}>
          <div style={{display:'flex', flexWrap:'wrap', gap:0}}>
            {tabs.map(tab => (
              <TabButton
                key={tab.id}
                label={tab.label}
                emoji={tab.emoji}
                isActive={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                disabled={tab.disabled}
              />
            ))}
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && (
          <>
            {error && <div style={{color:'red', padding:12, background:'#ffe6e6', borderRadius:8}}>❌ Failed to load: {error.message}</div>}
            {!data && !error && <div style={{padding:12}}>⏳ Loading your listening data…</div>}
            {data && typeof data === 'object' && Object.keys(data).length > 0 && (
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginTop:20}}>
                <div>
                  <h3>Top Artists</h3>
                  <div style={{display:'grid', gap:8}}>
                    {data.top_artists && data.top_artists.items && data.top_artists.items.map(a => (
                      <div key={a.id} style={{display:'flex', alignItems:'center', gap:12, padding:8, border:'1px solid #eee', borderRadius:8}}>
                        <img src={(a.images && a.images[0] && a.images[0].url) || ''} alt="artist" style={{width:48, height:48, objectFit:'cover', borderRadius:6}} />
                        <div>
                          <div style={{fontWeight:700}}>{a.name}</div>
                          <div style={{color:'#666', fontSize:12}}>{a.type}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3>Top Tracks</h3>
                  <div style={{display:'grid', gap:8}}>
                    {data.top_tracks && data.top_tracks.items && data.top_tracks.items.map(t => (
                      <div key={t.id} style={{display:'flex', gap:12, padding:8, border:'1px solid #eee', borderRadius:8}}>
                        <img src={(t.album && t.album.images && t.album.images[0] && t.album.images[0].url) || ''} alt="cover" style={{width:48, height:48, objectFit:'cover', borderRadius:6}} />
                        <div>
                          <div style={{fontWeight:700}}>{t.name}</div>
                          <div style={{color:'#666', fontSize:12}}>{t.artists && t.artists.map(a=>a.name).join(', ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'recently-played' && <RecentlyPlayedTimeline apiBase={apiBase} />}
        {activeTab === 'time-range' && <TimeRangeComparison apiBase={apiBase} />}
        {activeTab === 'genres' && <GenreCloud apiBase={apiBase} />}
        {activeTab === 'listening-clock' && <ListeningClock apiBase={apiBase} />}
        {activeTab === 'artist-dominance' && <ArtistDominance apiBase={apiBase} />}
        {activeTab === 'discovery' && <DiscoveryStats apiBase={apiBase} />}
        {activeTab === 'all-time' && <ImportedAllTimeTracks apiBase={apiBase} />}
      </main>

      <footer style={{padding:'16px 24px', textAlign:'center', color:'#999', fontSize:12, borderTop:'1px solid #eee', marginTop:40}}>
        spotify-viewer &middot; Personal use only &middot; Data stays on your machine
      </footer>
      </div>
    </div>
  )
}
