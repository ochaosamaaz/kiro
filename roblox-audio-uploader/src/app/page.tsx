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

type AppStep = 'input' | 'downloading' | 'preview' | 'credentials' | 'uploading' | 'success'

export default function Home() {
  const [step, setStep] = useState<AppStep>('input')
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
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && (line.startsWith('http') || line.startsWith('www')))
  }

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrlsText(prev => prev ? prev + '\n' + text : text)
    } catch {
      setError('Tidak bisa mengakses clipboard. Paste manual ya!')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.ogg')) {
        setError('File harus berformat audio (MP3 atau OGG)')
        return
      }
      setUploadFile(file)
      const newItem: AudioItem = {
        id: crypto.randomUUID(),
        url: 'local-file',
        title: file.name.replace(/\.(mp3|ogg|wav)$/i, ''),
        duration: 0,
        thumbnail: '',
        author: 'Local File',
        fileSize: file.size,
        filePath: '',
        fileId: '',
        selected: true,
        status: 'downloaded'
      }
      setItems([newItem])
      setStep('credentials')
      setError('')
    }
  }


  const handleBulkDownload = async () => {
    const urls = parseUrls(urlsText)

    if (urls.length === 0) {
      setError('Masukkan minimal 1 URL yang valid')
      return
    }

    if (urls.length > 20) {
      setError('Maksimal 20 URL per batch')
      return
    }

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(urls))

    setError('')
    setLoading(true)
    setStep('downloading')
    setDownloadProgress({ current: 0, total: uniqueUrls.length })

    // Initialize items
    const initialItems: AudioItem[] = uniqueUrls.map(url => ({
      id: crypto.randomUUID(),
      url,
      title: '',
      duration: 0,
      thumbnail: '',
      author: '',
      fileSize: 0,
      filePath: '',
      fileId: '',
      selected: true,
      status: 'pending' as const
    }))
    setItems(initialItems)

    try {
      const response = await axios.post('/api/download', { urls: uniqueUrls })
      const results = response.data.results

      const updatedItems: AudioItem[] = initialItems.map((item, index) => {
        const result = results[index]
        if (result && result.success) {
          return {
            ...item,
            title: result.title || 'Untitled',
            duration: result.duration || 0,
            thumbnail: result.thumbnail || '',
            author: result.author || 'Unknown',
            fileSize: result.fileSize || 0,
            filePath: result.filePath || '',
            fileId: result.fileId || '',
            status: 'downloaded' as const
          }
        } else {
          return {
            ...item,
            status: 'error' as const,
            error: result?.error || 'Gagal download',
            selected: false
          }
        }
      })

      setItems(updatedItems)
      setDownloadProgress({ current: uniqueUrls.length, total: uniqueUrls.length })
      setStep('preview')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal mengunduh audio')
      setStep('input')
    } finally {
      setLoading(false)
    }
  }


  const handleBulkUpload = async () => {
    if (!apiKey.trim()) {
      setError('Masukkan Roblox API Key terlebih dahulu')
      return
    }
    if (!userId.trim()) {
      setError('Masukkan User ID Roblox terlebih dahulu')
      return
    }

    const selectedItems = items.filter(item => item.selected && item.status === 'downloaded')
    if (selectedItems.length === 0) {
      setError('Pilih minimal 1 audio untuk diupload')
      return
    }

    setError('')
    setLoading(true)
    setStep('uploading')
    setUploadProgress({ current: 0, total: selectedItems.length })

    // Mark selected items as uploading
    setItems(prev => prev.map(item =>
      item.selected && item.status === 'downloaded'
        ? { ...item, status: 'uploading' as const }
        : item
    ))

    try {
      // Handle local file upload (single file)
      if (uploadFile && selectedItems.length === 1 && selectedItems[0].url === 'local-file') {
        const formData = new FormData()
        formData.append('apiKey', apiKey)
        formData.append('userId', userId)
        formData.append('title', selectedItems[0].title)
        formData.append('file', uploadFile)

        const response = await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        setItems(prev => prev.map(item =>
          item.id === selectedItems[0].id
            ? { ...item, status: 'uploaded' as const, assetId: response.data.assetId, assetUrl: response.data.assetUrl }
            : item
        ))
        setUploadProgress({ current: 1, total: 1 })
        setStep('success')
        setLoading(false)
        return
      }

      // Bulk upload via API
      const bulkData = selectedItems.map(item => ({
        title: item.title,
        filePath: item.filePath,
        fileId: item.fileId
      }))

      const formData = new FormData()
      formData.append('apiKey', apiKey)
      formData.append('userId', userId)
      formData.append('bulkData', JSON.stringify(bulkData))

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const results = response.data.results

      setItems(prev => {
        const selectedIds = selectedItems.map(s => s.id)
        let resultIndex = 0
        return prev.map(item => {
          if (selectedIds.includes(item.id)) {
            const result = results[resultIndex]
            resultIndex++
            if (result && result.success) {
              return { ...item, status: 'uploaded' as const, assetId: result.assetId, assetUrl: result.assetUrl }
            } else {
              return { ...item, status: 'upload-error' as const, error: result?.error || 'Gagal upload' }
            }
          }
          return item
        })
      })

      setUploadProgress({ current: selectedItems.length, total: selectedItems.length })
      setStep('success')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal upload ke Roblox')
      setItems(prev => prev.map(item =>
        item.status === 'uploading'
          ? { ...item, status: 'upload-error' as const, error: 'Gagal upload' }
          : item
      ))
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }


  const toggleItemSelection = (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, selected: !item.selected } : item
    ))
  }

  const toggleSelectAll = () => {
    const downloadedItems = items.filter(i => i.status === 'downloaded')
    const allSelected = downloadedItems.every(i => i.selected)
    setItems(prev => prev.map(item =>
      item.status === 'downloaded' ? { ...item, selected: !allSelected } : item
    ))
  }

  const resetForm = () => {
    setStep('input')
    setUrlsText('')
    setItems([])
    setError('')
    setDownloadProgress({ current: 0, total: 0 })
    setUploadProgress({ current: 0, total: 0 })
    setUploadFile(null)
  }

  const copyAllAssetIds = () => {
    const ids = items
      .filter(i => i.status === 'uploaded' && i.assetId)
      .map(i => `rbxassetid://${i.assetId}`)
      .join('\n')
    navigator.clipboard.writeText(ids)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const selectedCount = items.filter(i => i.selected && i.status === 'downloaded').length
  const downloadedCount = items.filter(i => i.status === 'downloaded').length
  const uploadedCount = items.filter(i => i.status === 'uploaded').length
  const failedCount = items.filter(i => i.status === 'error' || i.status === 'upload-error').length


  return (
    <main className="min-h-screen gradient-bg py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent float">
            Roblox Audio Uploader
          </h1>
          <p className="text-gray-300 text-lg">
            Bulk download lagu dan upload langsung ke Roblox
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-center">
            {error}
          </div>
        )}

        {/* Step: Input */}
        {step === 'input' && (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-center">
              Masukkan Link YouTube
            </h2>
            <p className="text-gray-400 text-sm text-center mb-4">
              Paste beberapa URL (1 per baris) — maksimal 20 link
            </p>

            {/* Bulk URL Input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-300">
                  URL YouTube / Audio
                </label>
                <button
                  onClick={handlePasteFromClipboard}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  Paste dari Clipboard
                </button>
              </div>
              <textarea
                value={urlsText}
                onChange={(e) => setUrlsText(e.target.value)}
                placeholder={"https://youtube.com/watch?v=xxx\nhttps://youtube.com/watch?v=yyy\nhttps://youtube.com/watch?v=zzz"}
                className="input-field min-h-[160px] resize-y font-mono text-sm"
                disabled={loading}
              />
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{parseUrls(urlsText).length} URL terdeteksi</span>
                <span>Max 20 URL</span>
              </div>
            </div>

            <button
              onClick={handleBulkDownload}
              disabled={loading || parseUrls(urlsText).length === 0}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Memproses...' : `Download ${parseUrls(urlsText).length} Audio`}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-transparent text-gray-400">atau</span>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Upload File Audio (MP3/OGG)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.ogg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary w-full"
              >
                Pilih File Audio
              </button>
            </div>
          </div>
        )}


        {/* Step: Downloading */}
        {step === 'downloading' && (
          <div className="card">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center pulse-glow">
                <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Mengunduh Audio...</h2>
              <p className="text-gray-400 text-sm mt-1">
                Memproses {downloadProgress.total} URL
              </p>
            </div>

            <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className="h-full progress-bar rounded-full transition-all duration-500"
                style={{ width: `${downloadProgress.total > 0 ? (downloadProgress.current / downloadProgress.total) * 100 : 0}%` }}
              />
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg">
                  <div className="w-6 h-6 flex-shrink-0">
                    {item.status === 'pending' && (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin"></div>
                    )}
                    {item.status === 'downloaded' && (
                      <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {item.status === 'error' && (
                      <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-300 truncate flex-1">{item.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Step: Preview */}
        {(step === 'preview' || step === 'credentials') && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Hasil Download
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-green-400">{downloadedCount} berhasil</span>
                {failedCount > 0 && <span className="text-red-400">{failedCount} gagal</span>}
              </div>
            </div>

            {/* Select All */}
            {downloadedCount > 1 && (
              <div className="flex items-center justify-between mb-3 p-2 bg-white/5 rounded-lg">
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {items.filter(i => i.status === 'downloaded').every(i => i.selected)
                    ? 'Unselect Semua'
                    : 'Select Semua'}
                </button>
                <span className="text-sm text-gray-400">
                  {selectedCount} dipilih
                </span>
              </div>
            )}

            {/* Audio List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto mb-6">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    item.status === 'error'
                      ? 'bg-red-500/10 border-red-500/30'
                      : item.selected
                        ? 'bg-white/10 border-white/20'
                        : 'bg-white/5 border-white/10 opacity-60'
                  }`}
                >
                  {/* Checkbox */}
                  {item.status === 'downloaded' && (
                    <button
                      onClick={() => toggleItemSelection(item.id)}
                      className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                        item.selected
                          ? 'bg-red-500 border-red-500'
                          : 'border-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {item.selected && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* Error icon */}
                  {item.status === 'error' && (
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}

                  {/* Thumbnail */}
                  {item.status === 'downloaded' && (
                    item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                        </svg>
                      </div>
                    )
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {item.title || item.url}
                    </p>
                    <div className="flex gap-3 text-xs text-gray-400">
                      {item.author && <span>{item.author}</span>}
                      {item.duration > 0 && <span>{formatDuration(item.duration)}</span>}
                      {item.fileSize > 0 && <span>{formatFileSize(item.fileSize)}</span>}
                      {item.error && <span className="text-red-400">{item.error}</span>}
                    </div>
                  </div>

                  {/* Duration warning */}
                  {item.duration > 420 && (
                    <span className="text-xs text-yellow-400 flex-shrink-0" title="Lebih dari 7 menit">
                      ⚠️
                    </span>
                  )}
                </div>
              ))}
            </div>


            {/* Credentials */}
            <div className="space-y-4 mb-6 p-4 bg-white/5 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-300">Roblox Credentials</h3>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Open Cloud API Key *
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Masukkan API Key dari Roblox Creator Hub"
                  className="input-field"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Dapatkan di:{' '}
                  <a
                    href="https://create.roblox.com/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    create.roblox.com/credentials
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Roblox User ID *
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Contoh: 123456789"
                  className="input-field"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex-1 py-3 px-6 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleBulkUpload}
                disabled={!apiKey.trim() || !userId.trim() || selectedCount === 0}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload {selectedCount} Audio ke Roblox
              </button>
            </div>
          </div>
        )}


        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="card text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center pulse-glow">
              <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Mengupload ke Roblox...</h2>
            <p className="text-gray-400 text-sm">
              Mengupload {uploadProgress.total} audio (dengan delay 2 detik per item untuk menghindari rate limit)
            </p>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden mt-4">
              <div
                className="h-full progress-bar rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 10}%` }}
              />
            </div>
          </div>
        )}


        {/* Step: Success */}
        {step === 'success' && (
          <div className="card">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-green-400">Upload Selesai!</h2>
              <p className="text-gray-400 text-sm mt-1">
                {uploadedCount} berhasil{failedCount > 0 ? `, ${failedCount} gagal` : ''}
              </p>
            </div>

            {/* Results List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto mb-6">
              {items.filter(i => i.status === 'uploaded' || i.status === 'upload-error').map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    item.status === 'uploaded' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
                  }`}
                >
                  {item.status === 'uploaded' ? (
                    <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.title}</p>
                    {item.status === 'uploaded' && item.assetId && (
                      <p className="text-xs text-gray-400 font-mono">rbxassetid://{item.assetId}</p>
                    )}
                    {item.status === 'upload-error' && (
                      <p className="text-xs text-red-400">{item.error}</p>
                    )}
                  </div>
                  {item.status === 'uploaded' && item.assetUrl && (
                    <a
                      href={item.assetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline flex-shrink-0"
                    >
                      Lihat →
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Copy All Button */}
            {uploadedCount > 0 && (
              <button
                onClick={copyAllAssetIds}
                className="w-full mb-4 py-3 px-6 bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                </svg>
                Copy Semua Asset ID ({uploadedCount})
              </button>
            )}

            <button onClick={resetForm} className="btn-primary w-full">
              Upload Audio Lain
            </button>
          </div>
        )}


        {/* Info Section */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="mb-2">Cara mendapatkan API Key:</p>
          <ol className="list-decimal list-inside text-left max-w-md mx-auto space-y-1">
            <li>Buka <a href="https://create.roblox.com/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Roblox Creator Hub</a></li>
            <li>Buat API Key baru</li>
            <li>Pilih permission: <strong>Assets API</strong> → <strong>Read & Write</strong></li>
            <li>Tambahkan User ID Anda di access permissions</li>
            <li>Copy API Key dan paste di form di atas</li>
          </ol>
        </div>
      </div>
    </main>
  )
}
