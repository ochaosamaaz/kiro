'use client'

import { useState, useRef } from 'react'
import axios from 'axios'

interface AudioItem {
  id: string
  url: string
  title: string
  duration: number
  thumbnail: string
  author: string
  fileSize: number
  filePath: string
  fileId: string
  selected: boolean
  status: 'pending' | 'downloading' | 'downloaded' | 'error' | 'uploading' | 'uploaded' | 'upload-error'
  error?: string
  assetId?: string
  assetUrl?: string
}

type AppStep = 'landing' | 'input' | 'downloading' | 'preview' | 'credentials' | 'uploading' | 'success'

export default function Home() {
  const [step, setStep] = useState<AppStep>('landing')
  const [urlsText, setUrlsText] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [items, setItems] = useState<AudioItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 })
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)


  const parseUrls = (text: string): string[] => {
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0 && (line.startsWith('http') || line.startsWith('www')))
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrlsText(prev => prev ? prev + '\n' + text : text)
    } catch { setError('Tidak bisa mengakses clipboard') }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.ogg')) {
        setError('File harus berformat audio (MP3 atau OGG)')
        return
      }
      setUploadFile(file)
      const newItem: AudioItem = { id: crypto.randomUUID(), url: 'local-file', title: file.name.replace(/\.(mp3|ogg|wav)$/i, ''), duration: 0, thumbnail: '', author: 'Local File', fileSize: file.size, filePath: '', fileId: '', selected: true, status: 'downloaded' }
      setItems([newItem])
      setStep('preview')
      setError('')
    }
  }


  const handleBulkDownload = async () => {
    const urls = parseUrls(urlsText)
    if (urls.length === 0) { setError('Masukkan minimal 1 URL'); return }
    if (urls.length > 20) { setError('Maksimal 20 URL per batch'); return }
    const uniqueUrls = Array.from(new Set(urls))
    setError('')
    setLoading(true)
    setStep('downloading')
    setDownloadProgress({ current: 0, total: uniqueUrls.length })
    const initialItems: AudioItem[] = uniqueUrls.map(url => ({ id: crypto.randomUUID(), url, title: '', duration: 0, thumbnail: '', author: '', fileSize: 0, filePath: '', fileId: '', selected: true, status: 'pending' as const }))
    setItems(initialItems)
    try {
      const response = await axios.post('/api/download', { urls: uniqueUrls }, { timeout: 600000 })
      const results = response.data.results
      const updatedItems: AudioItem[] = initialItems.map((item, index) => {
        const result = results[index]
        if (result && result.success) {
          return { ...item, title: result.title || 'Untitled', duration: result.duration || 0, thumbnail: result.thumbnail || '', author: result.author || 'Unknown', fileSize: result.fileSize || 0, filePath: result.filePath || '', fileId: result.fileId || '', status: 'downloaded' as const }
        } else {
          return { ...item, status: 'error' as const, error: result?.error || 'Gagal download', selected: false }
        }
      })
      setItems(updatedItems)
      setDownloadProgress({ current: uniqueUrls.length, total: uniqueUrls.length })
      setStep('preview')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal mengunduh audio')
      setStep('input')
    } finally { setLoading(false) }
  }


  const handleBulkUpload = async () => {
    if (!apiKey.trim()) { setError('Masukkan API Key'); return }
    if (!userId.trim()) { setError('Masukkan User ID'); return }
    const selectedItems = items.filter(item => item.selected && item.status === 'downloaded')
    if (selectedItems.length === 0) { setError('Pilih minimal 1 audio'); return }
    setError('')
    setLoading(true)
    setStep('uploading')
    setUploadProgress({ current: 0, total: selectedItems.length })
    setItems(prev => prev.map(item => item.selected && item.status === 'downloaded' ? { ...item, status: 'uploading' as const } : item))
    try {
      if (uploadFile && selectedItems.length === 1 && selectedItems[0].url === 'local-file') {
        const formData = new FormData()
        formData.append('apiKey', apiKey); formData.append('userId', userId); formData.append('title', selectedItems[0].title); formData.append('file', uploadFile)
        const response = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
        setItems(prev => prev.map(item => item.id === selectedItems[0].id ? { ...item, status: 'uploaded' as const, assetId: response.data.assetId, assetUrl: response.data.assetUrl } : item))
        setUploadProgress({ current: 1, total: 1 }); setStep('success'); setLoading(false); return
      }
      const bulkData = selectedItems.map(item => ({ title: item.title, filePath: item.filePath, fileId: item.fileId }))
      const formData = new FormData()
      formData.append('apiKey', apiKey); formData.append('userId', userId); formData.append('bulkData', JSON.stringify(bulkData))
      const response = await axios.post('/api/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 })
      const results = response.data.results
      setItems(prev => { const selectedIds = selectedItems.map(s => s.id); let ri = 0; return prev.map(item => { if (selectedIds.includes(item.id)) { const r = results[ri]; ri++; if (r && r.success) return { ...item, status: 'uploaded' as const, assetId: r.assetId, assetUrl: r.assetUrl }; else return { ...item, status: 'upload-error' as const, error: r?.error || 'Gagal upload' } } return item }) })
      setUploadProgress({ current: selectedItems.length, total: selectedItems.length }); setStep('success')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal upload ke Roblox')
      setItems(prev => prev.map(item => item.status === 'uploading' ? { ...item, status: 'upload-error' as const, error: 'Gagal upload' } : item))
      setStep('preview')
    } finally { setLoading(false) }
  }


  const toggleItemSelection = (id: string) => { setItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item)) }
  const toggleSelectAll = () => { const dl = items.filter(i => i.status === 'downloaded'); const all = dl.every(i => i.selected); setItems(prev => prev.map(item => item.status === 'downloaded' ? { ...item, selected: !all } : item)) }
  const resetForm = () => { setStep('input'); setUrlsText(''); setItems([]); setError(''); setDownloadProgress({ current: 0, total: 0 }); setUploadProgress({ current: 0, total: 0 }); setUploadFile(null) }
  const copyAllAssetIds = () => { const ids = items.filter(i => i.status === 'uploaded' && i.assetId).map(i => `rbxassetid://${i.assetId}`).join('\n'); navigator.clipboard.writeText(ids) }
  const formatDuration = (s: number) => { const m = Math.floor(s / 60); const sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, '0')}` }
  const formatFileSize = (bytes: number) => { if (bytes === 0) return '0 B'; const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i] }
  const selectedCount = items.filter(i => i.selected && i.status === 'downloaded').length
  const downloadedCount = items.filter(i => i.status === 'downloaded').length
  const uploadedCount = items.filter(i => i.status === 'uploaded').length
  const failedCount = items.filter(i => i.status === 'error' || i.status === 'upload-error').length


  // ==================== LANDING PAGE ====================
  if (step === 'landing') {
    return (
      <main className="min-h-screen bg-[#09090b] text-zinc-100">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="badge badge-accent mb-4">Roblox Audio Tool</span>
              <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
                Audio Roblox<br /><span className="gradient-text">Profesional.</span>
              </h1>
              <p className="text-zinc-400 text-lg mb-8 leading-relaxed">
                Download YouTube & SoundCloud, konversi ke MP3 320kbps, dan upload langsung ke Roblox via Open Cloud API.
              </p>
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="stat-card"><div className="stat-value">320k</div><div className="stat-label">Kualitas MP3</div></div>
                <div className="stat-card"><div className="stat-value">MP3</div><div className="stat-label">Format Output</div></div>
                <div className="stat-card"><div className="stat-value">Bulk</div><div className="stat-label">Multi Upload</div></div>
              </div>
              <button onClick={() => setStep('input')} className="btn-primary text-lg px-8 py-4">
                Mulai Sekarang
              </button>
            </div>
            {/* Terminal */}
            <div className="terminal hidden md:block">
              <div className="terminal-header">
                <div className="terminal-dot bg-red-500"></div>
                <div className="terminal-dot bg-yellow-500"></div>
                <div className="terminal-dot bg-green-500"></div>
                <span className="text-xs text-zinc-500 ml-2">soundciel</span>
              </div>
              <div className="terminal-body">
                <p><span className="cmd">$</span> convert --url youtube.com/watch?v=...</p>
                <p className="output">Downloading audio...</p>
                <p className="output">Format: MP3 320kbps</p>
                <p className="output">Processing segment 1/1...</p>
                <p className="highlight">Done. Output: track.mp3</p>
                <p><span className="cmd">$</span> upload --roblox</p>
                <p className="warn">Asset ID: 18273640192</p>
                <p><span className="cmd cursor-blink">$</span></p>
              </div>
            </div>
          </div>
        </section>


        {/* Features */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="feature-grid">
            {[
              { num: '01', title: 'Bulk Download', desc: 'Paste hingga 20 URL YouTube sekaligus, download semua audio dalam satu klik.' },
              { num: '02', title: 'Auto Upload Roblox', desc: 'Upload otomatis ke akun Roblox via Open Cloud API. Dapat Asset ID langsung.' },
              { num: '03', title: 'Upload File', desc: 'Upload MP3, OGG langsung dari komputer. Support file hingga 19.5 MB.' },
              { num: '04', title: 'Preview & Select', desc: 'Preview semua audio sebelum upload. Pilih mana yang mau di-upload ke Roblox.' },
            ].map(f => (
              <div key={f.num} className="card card-hover">
                <span className="text-indigo-500 font-mono text-sm">{f.num}</span>
                <h3 className="text-white font-semibold mt-2 mb-1">{f.title}</h3>
                <p className="text-zinc-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-center mb-12">Cara Kerja</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { num: '01', title: 'Paste URL', desc: 'Masukkan link YouTube atau upload file audio dari komputer.' },
              { num: '02', title: 'Download & Preview', desc: 'Sistem download audio dan tampilkan preview. Pilih mana yang mau diupload.' },
              { num: '03', title: 'Upload ke Roblox', desc: 'Masukkan API Key, klik upload. Dapat Asset ID langsung!' },
            ].map((s, i) => (
              <div key={s.num} className="text-center">
                <div className="step-number mx-auto mb-3">{s.num}</div>
                <h3 className="text-white font-semibold mb-1">{s.title}</h3>
                <p className="text-zinc-500 text-sm">{s.desc}</p>
                {i < 2 && <div className="hidden md:block text-zinc-600 text-2xl mt-4">→</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-800 py-8 text-center text-zinc-600 text-sm">
          <p>SoundCiel &mdash; Roblox Audio Tool</p>
        </footer>
      </main>
    )
  }


  // ==================== APP UI ====================
  return (
    <main className="min-h-screen bg-[#09090b] py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">SoundCiel</h1>
          <p className="text-zinc-500 text-sm">Roblox Audio Tool</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">{error}</div>
        )}

        {/* Step: Input */}
        {step === 'input' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-1">Masukkan Link</h2>
            <p className="text-zinc-500 text-sm mb-4">Paste URL YouTube (1 per baris, max 20)</p>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-zinc-400">URL YouTube / Audio</label>
                <button onClick={handlePasteFromClipboard} className="text-xs text-indigo-400 hover:text-indigo-300">Paste Clipboard</button>
              </div>
              <textarea value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder={"https://youtube.com/watch?v=xxx\nhttps://youtube.com/watch?v=yyy"} className="input-field min-h-[140px] resize-y font-mono text-sm" disabled={loading} />
              <div className="flex justify-between mt-2 text-xs text-zinc-600">
                <span>{parseUrls(urlsText).length} URL detected</span>
                <span>Max 20</span>
              </div>
            </div>
            <button onClick={handleBulkDownload} disabled={loading || parseUrls(urlsText).length === 0} className="btn-primary w-full">
              {loading ? 'Processing...' : `Download ${parseUrls(urlsText).length} Audio`}
            </button>
            <div className="relative my-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800"></div></div><div className="relative flex justify-center text-xs"><span className="px-3 bg-[#18181b] text-zinc-500">atau</span></div></div>
            <input ref={fileInputRef} type="file" accept="audio/*,.mp3,.ogg" onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full">Upload File Audio</button>
          </div>
        )}


        {/* Step: Downloading */}
        {step === 'downloading' && (
          <div className="card text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center pulse-glow">
              <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <h2 className="text-lg font-semibold mb-1">Downloading...</h2>
            <p className="text-zinc-500 text-sm">{downloadProgress.total} URL sedang diproses</p>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-4 mb-4">
              <div className="h-full progress-bar rounded-full" style={{ width: `${downloadProgress.total > 0 ? (downloadProgress.current / downloadProgress.total) * 100 : 10}%` }} />
            </div>
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto text-left">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 p-2 bg-zinc-900 rounded text-xs">
                  {item.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin"></div>}
                  {item.status === 'downloaded' && <div className="w-3 h-3 rounded-full bg-green-500"></div>}
                  {item.status === 'error' && <div className="w-3 h-3 rounded-full bg-red-500"></div>}
                  <span className="text-zinc-400 truncate flex-1">{item.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Hasil Download</h2>
              <div className="flex gap-2 text-xs">
                <span className="text-green-400">{downloadedCount} ok</span>
                {failedCount > 0 && <span className="text-red-400">{failedCount} gagal</span>}
              </div>
            </div>
            {downloadedCount > 1 && (
              <div className="flex items-center justify-between mb-3 p-2 bg-zinc-900 rounded-lg">
                <button onClick={toggleSelectAll} className="text-xs text-indigo-400 hover:text-indigo-300">{items.filter(i => i.status === 'downloaded').every(i => i.selected) ? 'Unselect All' : 'Select All'}</button>
                <span className="text-xs text-zinc-500">{selectedCount} selected</span>
              </div>
            )}
            <div className="space-y-2 max-h-[350px] overflow-y-auto mb-6">
              {items.map(item => (
                <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${item.status === 'error' ? 'bg-red-500/5 border-red-500/20' : item.selected ? 'bg-zinc-900 border-zinc-700' : 'bg-zinc-900/50 border-zinc-800 opacity-50'}`}>
                  {item.status === 'downloaded' && (
                    <button onClick={() => toggleItemSelection(item.id)} className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${item.selected ? 'bg-indigo-600 border-indigo-600' : 'border-zinc-600'}`}>
                      {item.selected && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                    </button>
                  )}
                  {item.status === 'error' && <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0"><span className="text-red-400 text-xs">!</span></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.title || item.url}</p>
                    <div className="flex gap-3 text-xs text-zinc-500">
                      {item.author && <span>{item.author}</span>}
                      {item.duration > 0 && <span>{formatDuration(item.duration)}</span>}
                      {item.fileSize > 0 && <span>{formatFileSize(item.fileSize)}</span>}
                      {item.error && <span className="text-red-400">{item.error}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>


            {/* Credentials */}
            <div className="space-y-3 mb-6 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300">Roblox Credentials</h3>
              <div>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Open Cloud API Key" className="input-field text-sm" />
                <p className="text-xs text-zinc-600 mt-1"><a href="https://create.roblox.com/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">create.roblox.com/credentials</a></p>
              </div>
              <input type="text" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID (contoh: 123456789)" className="input-field text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={resetForm} className="flex-1 btn-secondary">Kembali</button>
              <button onClick={handleBulkUpload} disabled={!apiKey.trim() || !userId.trim() || selectedCount === 0} className="flex-1 btn-primary">Upload {selectedCount} Audio</button>
            </div>
          </div>
        )}


        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="card text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center pulse-glow">
              <svg className="w-5 h-5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
            <h2 className="text-lg font-semibold mb-1">Uploading to Roblox...</h2>
            <p className="text-zinc-500 text-sm">{uploadProgress.total} audio (delay 2s per item)</p>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-4">
              <div className="h-full progress-bar rounded-full" style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 10}%` }} />
            </div>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <div className="card">
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-xl font-semibold text-green-400">Upload Selesai!</h2>
              <p className="text-zinc-500 text-sm">{uploadedCount} berhasil{failedCount > 0 ? `, ${failedCount} gagal` : ''}</p>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto mb-6">
              {items.filter(i => i.status === 'uploaded' || i.status === 'upload-error').map(item => (
                <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${item.status === 'uploaded' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className={`w-3 h-3 rounded-full ${item.status === 'uploaded' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{item.title}</p>
                    {item.assetId && <p className="text-xs text-zinc-500 font-mono">rbxassetid://{item.assetId}</p>}
                    {item.status === 'upload-error' && <p className="text-xs text-red-400">{item.error}</p>}
                  </div>
                </div>
              ))}
            </div>
            {uploadedCount > 0 && <button onClick={copyAllAssetIds} className="btn-secondary w-full mb-3">Copy All Asset IDs ({uploadedCount})</button>}
            <button onClick={resetForm} className="btn-primary w-full">Upload Lagi</button>
          </div>
        )}
      </div>
    </main>
  )
}
