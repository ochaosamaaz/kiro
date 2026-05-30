'use client'

import { useState, useRef } from 'react'

interface AudioItem {
  title: string
  author: string
  duration: number
  thumbnail?: string
  fileSize?: number
  filePath?: string
  fileId?: string
  url?: string
  id?: string
  file?: File
  status?: 'pending' | 'downloading' | 'uploading' | 'done' | 'error'
  assetId?: string
  error?: string
}

export default function Home() {
  const [tab, setTab] = useState<'single' | 'bulk' | 'search'>('single')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Single upload
  const [audioInfo, setAudioInfo] = useState<AudioItem | null>(null)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [step, setStep] = useState<'input' | 'preview' | 'uploading' | 'success'>('input')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Bulk upload
  const [bulkFiles, setBulkFiles] = useState<AudioItem[]>([])
  const [bulkRunning, setBulkRunning] = useState(false)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AudioItem[]>([])
  const [searching, setSearching] = useState(false)

  // ===== SINGLE UPLOAD =====
  const handleDownload = async () => {
    if (!url.trim()) return setError('Masukkan URL dulu')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAudioInfo(data)
      setStep('preview')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setAudioInfo({
      title: file.name.replace(/\.(mp3|ogg|wav)$/i, ''),
      author: 'Local File',
      duration: 0,
      fileSize: file.size,
    })
    setStep('preview')
    setError('')
  }

  const handleUpload = async () => {
    if (!apiKey.trim()) return setError('API Key wajib diisi')
    if (!userId.trim()) return setError('User ID wajib diisi')
    setStep('uploading')
    setError('')
    try {
      const formData = new FormData()
      formData.append('apiKey', apiKey)
      formData.append('userId', userId)
      formData.append('title', audioInfo?.title || 'Audio')
      if (uploadFile) formData.append('file', uploadFile)
      else if (audioInfo?.filePath) formData.append('filePath', audioInfo.filePath)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUploadResult(data)
      setStep('success')
    } catch (e: any) {
      setError(e.message)
      setStep('preview')
    }
  }

  const resetSingle = () => {
    setStep('input')
    setUrl('')
    setAudioInfo(null)
    setUploadResult(null)
    setError('')
    setUploadFile(null)
  }

  // ===== BULK UPLOAD =====
  const handleBulkFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const items: AudioItem[] = files.map(f => ({
      title: f.name.replace(/\.(mp3|ogg|wav)$/i, ''),
      author: 'Local File',
      duration: 0,
      fileSize: f.size,
      file: f,
      status: 'pending',
    }))
    setBulkFiles(prev => [...prev, ...items])
  }

  const removeBulkItem = (index: number) => {
    setBulkFiles(prev => prev.filter((_, i) => i !== index))
  }

  const startBulkUpload = async () => {
    if (!apiKey.trim()) return setError('API Key wajib diisi')
    if (!userId.trim()) return setError('User ID wajib diisi')
    if (bulkFiles.length === 0) return setError('Tambahkan file dulu')

    setError('')
    setBulkRunning(true)

    for (let i = 0; i < bulkFiles.length; i++) {
      const item = bulkFiles[i]
      if (item.status === 'done') continue

      // Update status
      setBulkFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))

      try {
        const formData = new FormData()
        formData.append('apiKey', apiKey)
        formData.append('userId', userId)
        formData.append('title', item.title)

        if (item.file) {
          formData.append('file', item.file)
        } else if (item.filePath) {
          formData.append('filePath', item.filePath)
        }

        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        setBulkFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'done', assetId: data.assetId } : f
        ))
      } catch (e: any) {
        setBulkFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: e.message } : f
        ))
      }

      // Delay to avoid rate limit
      if (i < bulkFiles.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    setBulkRunning(false)
  }

  // ===== SEARCH =====
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setError('')
    setSearchResults([])
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSearchResults(data.results || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const downloadAndUploadFromSearch = async (item: AudioItem) => {
    if (!apiKey.trim()) return setError('Isi API Key dulu di tab Single/Bulk')
    if (!userId.trim()) return setError('Isi User ID dulu di tab Single/Bulk')

    // Update status in search results
    setSearchResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'downloading' } : r))

    try {
      // Download
      const dlRes = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      })
      const dlData = await dlRes.json()
      if (!dlRes.ok) throw new Error(dlData.error)

      // Upload
      setSearchResults(prev => prev.map(r => r.id === item.id ? { ...r, status: 'uploading' } : r))

      const formData = new FormData()
      formData.append('apiKey', apiKey)
      formData.append('userId', userId)
      formData.append('title', dlData.title || item.title)
      formData.append('filePath', dlData.filePath)

      const upRes = await fetch('/api/upload', { method: 'POST', body: formData })
      const upData = await upRes.json()
      if (!upRes.ok) throw new Error(upData.error)

      setSearchResults(prev => prev.map(r =>
        r.id === item.id ? { ...r, status: 'done', assetId: upData.assetId } : r
      ))
    } catch (e: any) {
      setSearchResults(prev => prev.map(r =>
        r.id === item.id ? { ...r, status: 'error', error: e.message } : r
      ))
    }
  }

  const formatDuration = (s: number) => {
    if (!s) return '--:--'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <main className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
          Roblox Audio Uploader
        </h1>
        <p className="text-center text-gray-400 mb-6">Download, Search & Bulk Upload ke Roblox</p>

        {/* TABS */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          {(['single', 'bulk', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                tab === t ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'single' ? 'Single Upload' : t === 'bulk' ? 'Bulk Upload' : 'Search Lagu'}
            </button>
          ))}
        </div>

        {/* CREDENTIALS (shared) */}
        <div className="glass rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Roblox API Key"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">User ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="123456789"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ===== TAB: SINGLE ===== */}
        {tab === 'single' && (
          <>
            {step === 'input' && (
              <div className="glass rounded-xl p-6 space-y-4">
                <div>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Paste URL YouTube..."
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    onKeyDown={e => e.key === 'Enter' && handleDownload()}
                  />
                  <button
                    onClick={handleDownload}
                    disabled={loading}
                    className="mt-3 w-full py-3 bg-gradient-to-r from-red-600 to-red-500 rounded-lg font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Downloading...' : 'Download & Preview'}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/20"></div>
                  <span className="text-gray-500 text-xs">atau</span>
                  <div className="flex-1 h-px bg-white/20"></div>
                </div>
                <div>
                  <input ref={fileRef} type="file" accept=".mp3,.ogg" onChange={handleFile} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} className="w-full py-3 border border-white/20 rounded-lg hover:bg-white/10">
                    Pilih File (MP3/OGG)
                  </button>
                </div>
              </div>
            )}

            {step === 'preview' && audioInfo && (
              <div className="glass rounded-xl p-6 space-y-4">
                <div className="p-4 bg-white/5 rounded-lg">
                  <h3 className="font-semibold">{audioInfo.title}</h3>
                  <p className="text-gray-400 text-sm">{audioInfo.author} {audioInfo.duration > 0 && `• ${formatDuration(audioInfo.duration)}`}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={resetSingle} className="flex-1 py-3 border border-white/20 rounded-lg hover:bg-white/10">Batal</button>
                  <button onClick={handleUpload} className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-lg font-semibold">Upload ke Roblox</button>
                </div>
              </div>
            )}

            {step === 'uploading' && (
              <div className="glass rounded-xl p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <p>Mengupload...</p>
              </div>
            )}

            {step === 'success' && uploadResult && (
              <div className="glass rounded-xl p-6 text-center space-y-3">
                <div className="w-12 h-12 mx-auto bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <p className="text-green-400 font-semibold">Berhasil!</p>
                <code className="block bg-black/30 rounded p-2 text-green-400 text-sm">rbxassetid://{uploadResult.assetId}</code>
                <button onClick={resetSingle} className="w-full py-2 bg-red-600 rounded-lg text-sm">Upload Lagi</button>
              </div>
            )}
          </>
        )}

        {/* ===== TAB: BULK ===== */}
        {tab === 'bulk' && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex gap-3">
              <input ref={bulkFileRef} type="file" accept=".mp3,.ogg" multiple onChange={handleBulkFiles} className="hidden" />
              <button
                onClick={() => bulkFileRef.current?.click()}
                className="flex-1 py-3 border border-white/20 rounded-lg hover:bg-white/10 text-sm"
              >
                + Tambah File (bisa pilih banyak)
              </button>
              <button
                onClick={startBulkUpload}
                disabled={bulkRunning || bulkFiles.length === 0}
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-lg font-semibold text-sm disabled:opacity-50"
              >
                {bulkRunning ? 'Uploading...' : `Upload Semua (${bulkFiles.length})`}
              </button>
            </div>

            {bulkFiles.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-8">Belum ada file. Klik tombol di atas untuk menambah.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {bulkFiles.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.title}</p>
                      <p className="text-xs text-gray-500">
                        {item.fileSize ? `${(item.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === 'pending' && <span className="text-xs text-gray-400">Menunggu</span>}
                      {item.status === 'uploading' && <span className="text-xs text-yellow-400">Uploading...</span>}
                      {item.status === 'done' && (
                        <span className="text-xs text-green-400" title={item.assetId}>Done ✓</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-xs text-red-400" title={item.error}>Gagal ✗</span>
                      )}
                      {item.status === 'pending' && (
                        <button onClick={() => removeBulkItem(i)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bulkFiles.some(f => f.status === 'done') && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-xs text-green-400 font-semibold mb-1">Asset IDs:</p>
                <div className="space-y-1">
                  {bulkFiles.filter(f => f.status === 'done').map((f, i) => (
                    <code key={i} className="block text-xs text-green-300">rbxassetid://{f.assetId} — {f.title}</code>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: SEARCH ===== */}
        {tab === 'search' && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lagu di YouTube..."
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 rounded-lg font-semibold disabled:opacity-50"
              >
                {searching ? '...' : 'Cari'}
              </button>
            </div>

            {searchResults.length === 0 && !searching && (
              <p className="text-center text-gray-500 text-sm py-8">Ketik nama lagu lalu klik Cari</p>
            )}

            {searching && (
              <div className="text-center py-8">
                <div className="w-8 h-8 mx-auto border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-gray-400 text-sm mt-2">Mencari...</p>
              </div>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.title}</p>
                    <p className="text-xs text-gray-500">{item.author} • {formatDuration(item.duration)}</p>
                  </div>
                  <div>
                    {!item.status && (
                      <button
                        onClick={() => downloadAndUploadFromSearch(item)}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold"
                      >
                        Upload
                      </button>
                    )}
                    {item.status === 'downloading' && <span className="text-xs text-yellow-400">Downloading...</span>}
                    {item.status === 'uploading' && <span className="text-xs text-blue-400">Uploading...</span>}
                    {item.status === 'done' && (
                      <div className="text-right">
                        <span className="text-xs text-green-400">Done ✓</span>
                        <code className="block text-[10px] text-green-300">{item.assetId}</code>
                      </div>
                    )}
                    {item.status === 'error' && <span className="text-xs text-red-400" title={item.error}>Gagal ✗</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div className="mt-6 text-center text-xs text-gray-600">
          <a href="https://create.roblox.com/credentials" target="_blank" className="text-blue-400 underline">Dapatkan API Key</a>
          {' • '}Pastikan permission: Assets API → Write
        </div>
      </div>
    </main>
  )
}
