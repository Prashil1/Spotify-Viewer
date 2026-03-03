import { useState } from 'react'
import Head from 'next/head'

export default function ImportPage() {
  const apiBase = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8020'
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  const handleUpload = async (file) => {
    if (!file) return

    // Accept ZIP files or JSON files
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.json')) {
      setError('❌ Please upload a ZIP file from Spotify or a JSON file')
      return
    }

    setUploading(true)
    setError(null)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch(`${apiBase}/import/upload`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        setError(`❌ Import failed: ${data.error}${data.detail ? ' - ' + data.detail : ''}`)
        return
      }

      setMessage(`✅ Successfully imported! Processed ${data.tracks_imported || 0} tracks`)
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 2000)
    } catch (err) {
      setError(`❌ Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleUpload(files[0])
    }
  }

  const handleFileInput = (e) => {
    const files = e.target.files
    if (files && files[0]) {
      handleUpload(files[0])
    }
  }

  return (
    <div style={{minHeight:'100vh', display:'flex', flexDirection:'column'}}>
      <Head><title>Import Data &mdash; Spotify Viewer</title></Head>
      <div style={{padding:'20px 24px', maxWidth:960, margin:'0 auto', width:'100%', flex:1}}>
      <header style={{marginBottom:32, display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
        <div>
          <h1 style={{margin:'0 0 8px 0'}}>Import Extended Data</h1>
          <p style={{color:'#666', margin:0}}>Upload your Spotify data export to enhance your analytics</p>
        </div>
        <div style={{display:'flex', gap:12}}>
          <a href="/" style={{padding:'8px 12px', borderRadius:8, background:'#f0f0f0', border:'1px solid #ddd', textDecoration:'none', color:'#333', fontWeight:600}}>🏠 Home</a>
          <a href="/dashboard" style={{padding:'8px 12px', borderRadius:8, background:'#1DB954', border:'none', textDecoration:'none', color:'#000', fontWeight:600}}>📊 Dashboard</a>
        </div>
      </header>

      <main style={{maxWidth:600}}>
        {/* Instructions */}
        <div style={{padding:16, background:'#f0f5ff', borderRadius:8, marginBottom:24}}>
          <h3 style={{margin:'0 0 12px 0'}}>📋 How to get your Spotify data:</h3>
          <ol style={{margin:0, paddingLeft:20, color:'#333'}}>
            <li>Go to <strong>spotify.com/account/privacy</strong></li>
            <li>Scroll to "Download your personal data"</li>
            <li>Request your data (it may take a few days)</li>
            <li>Download the ZIP file when ready</li>
            <li>Upload it here</li>
          </ol>
        </div>

        {/* Upload Area */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            border: dragActive ? '2px solid #1DB954' : '2px dashed #ccc',
            borderRadius: 8,
            padding: 40,
            textAlign: 'center',
            background: dragActive ? '#e8f5e9' : '#fafafa',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: 24
          }}
        >
          <input
            type="file"
            id="file-input"
            onChange={handleFileInput}
            accept=".zip,.json"
            style={{display:'none'}}
            disabled={uploading}
          />
          <label htmlFor="file-input" style={{cursor: uploading ? 'not-allowed' : 'pointer'}}>
            <div style={{fontSize:48, marginBottom:12}}>📁</div>
            <div style={{fontSize:18, fontWeight:700, marginBottom:8}}>
              {uploading ? 'Uploading...' : 'Drop your file here'}
            </div>
            <div style={{color:'#666', marginBottom:16}}>
              or click to select
            </div>
            <div style={{fontSize:12, color:'#999'}}>
              Supports ZIP files from Spotify or JSON files
            </div>
          </label>
        </div>

        {/* Status Messages */}
        {error && (
          <div style={{padding:12, background:'#ffe6e6', border:'1px solid #ffcccc', borderRadius:8, marginBottom:16, color:'#c33'}}>
            {error}
          </div>
        )}

        {message && (
          <div style={{padding:12, background:'#e6ffed', border:'1px solid #b7f3c8', borderRadius:8, marginBottom:16, color:'#0d6b2f'}}>
            {message}
          </div>
        )}

        {/* Info Box */}
        <div style={{padding:16, background:'#fff9f0', borderRadius:8, marginTop:24}}>
          <h4 style={{margin:'0 0 8px 0'}}>ℹ️ What happens after import?</h4>
          <ul style={{margin:0, paddingLeft:20, fontSize:14, color:'#666'}}>
            <li>Your listening history will be parsed and added to the database</li>
            <li>You'll see extended analytics on your dashboard</li>
            <li>Historical data will enrich your listening trends</li>
          </ul>
        </div>
      </main>

      <footer style={{padding:'16px 24px', textAlign:'center', color:'#999', fontSize:12, borderTop:'1px solid #eee', marginTop:40}}>
        spotify-viewer &middot; Personal use only &middot; Data stays on your machine
      </footer>
      </div>
    </div>
  )
}
