'use client'

import { useState, useRef } from 'react'
import axios from 'axios'

interface AudioInfo {
  title: string
  duration: number
  thumbnail: string
  author: string
  fileSize?: number
  filePath?: string
}

interface UploadResult {
  assetId: string
  assetUrl: string
}

type Step = 'input' | 'preview' | 'uploading' | 'success'

export default function Home() {
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.ogg')) {
        setError('File harus berformat audio (MP3 atau OGG)')
        return
      }
      
      setUploadFile(file)
      setAudioInfo({
        title: file.name.replace(/\.(mp3|ogg|wav)$/i, ''),
        duration: 0,
        thumbnail: '/audio-icon.png',
        author: 'Local File',
        fileSize: file.size
      })
      setStep('preview')
      setError('')
    }
  }

  const handleUrlSubmit = async () => {
    if (!url.trim()) {
      setError('Masukkan URL terlebih dahulu')
      return
    }

    setLoading(true)
    setError('')
    setProgress(10)

    try {
      const response = await axios.post('/api/download', { url })
      setProgress(50)
      
      setAudioInfo(response.data)
      setStep('preview')
      setProgress(100)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal mengambil informasi audio')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async () => {
    if (!apiKey.trim()) {
      setError('Masukkan Roblox API Key terlebih dahulu')
      return
    }

    if (!userId.trim()) {
      setError('Masukkan User ID Roblox terlebih dahulu')
      return
    }

    setStep('uploading')
    setLoading(true)
    setError('')
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('apiKey', apiKey)
      formData.append('userId', userId)
      formData.append('title', audioInfo?.title || 'Untitled Audio')
      
      if (uploadFile) {
        formData.append('file', uploadFile)
      } else if (audioInfo?.filePath) {
        formData.append('filePath', audioInfo.filePath)
      }

      setProgress(30)

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 100)
          )
          setProgress(30 + percentCompleted * 0.7)
        }
      })

      setUploadResult(response.data)
      setStep('success')
      setProgress(100)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Gagal upload ke Roblox')
      setStep('preview')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep('input')
    setUrl('')
    setAudioInfo(null)
    setUploadResult(null)
    setError('')
    setProgress(0)
    setUploadFile(null)
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

  return (
    <main className="min-h-screen gradient-bg py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent float">
            Roblox Audio Uploader
          </h1>
          <p className="text-gray-300 text-lg">
            Download lagu dan upload langsung ke Roblox
          </p>
        </div>

        {/* Progress Bar */}
        {loading && (
          <div className="mb-6">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full progress-bar rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-400 mt-2">
              {progress < 50 ? 'Mengambil audio...' : 'Memproses...'}
            </p>
          </div>
        )}

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
              Pilih Sumber Audio
            </h2>
            
            {/* URL Input */}
            <div className="mb-6">
              <label className="block text-sm text-gray-300 mb-2">
                URL YouTube / Audio
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="input-field mb-4"
                disabled={loading}
              />
              <button
                onClick={handleUrlSubmit}
                disabled={loading || !url.trim()}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Memproses...' : 'Download dari URL'}
              </button>
            </div>

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

        {/* Step: Preview */}
        {step === 'preview' && audioInfo && (
          <div className="card">
            <h2 className="text-xl font-semibold mb-4 text-center">
              Preview Audio
            </h2>

            <div className="flex items-center gap-4 mb-6 p-4 bg-white/5 rounded-lg">
              {audioInfo.thumbnail && audioInfo.thumbnail !== '/audio-icon.png' ? (
                <img
                  src={audioInfo.thumbnail}
                  alt="Thumbnail"
                  className="w-20 h-20 rounded-lg object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                  </svg>
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-lg line-clamp-2">{audioInfo.title}</h3>
                <p className="text-gray-400 text-sm">{audioInfo.author}</p>
                <div className="flex gap-4 mt-1 text-sm text-gray-500">
                  {audioInfo.duration > 0 && (
                    <span>Durasi: {formatDuration(audioInfo.duration)}</span>
                  )}
                  {audioInfo.fileSize && (
                    <span>Size: {formatFileSize(audioInfo.fileSize)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Roblox Credentials */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Roblox Open Cloud API Key *
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
                <label className="block text-sm text-gray-300 mb-2">
                  Roblox User ID *
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Contoh: 123456789"
                  className="input-field"
                />
                <p className="text-xs text-gray-500 mt-1">
                  User ID bisa dilihat di URL profil Roblox Anda
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex-1 py-3 px-6 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleUpload}
                disabled={!apiKey.trim() || !userId.trim()}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload ke Roblox
              </button>
            </div>
          </div>
        )}

        {/* Step: Uploading */}
        {step === 'uploading' && (
          <div className="card text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center pulse-glow">
              <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">Mengupload ke Roblox...</h2>
            <p className="text-gray-400">Mohon tunggu, proses ini mungkin memakan waktu beberapa saat</p>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && uploadResult && (
          <div className="card text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-2 text-green-400">Upload Berhasil!</h2>
            <p className="text-gray-300 mb-6">Audio berhasil diupload ke Roblox</p>
            
            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <div className="mb-3">
                <span className="text-gray-400 text-sm">Asset ID:</span>
                <p className="font-mono text-lg text-white">{uploadResult.assetId}</p>
              </div>
              <a
                href={uploadResult.assetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline text-sm"
              >
                Lihat di Roblox →
              </a>
            </div>

            <div className="bg-white/5 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-400 mb-2">Gunakan di Roblox Studio:</p>
              <code className="block bg-black/30 rounded p-3 text-green-400 text-sm overflow-x-auto">
                rbxassetid://{uploadResult.assetId}
              </code>
            </div>

            <button onClick={resetForm} className="btn-primary">
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
