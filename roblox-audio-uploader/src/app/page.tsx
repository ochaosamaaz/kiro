'use client'

import { useState, useRef } from 'react'

export default function Home() {
  const [step, setStep] = useState<'input' | 'preview' | 'uploading' | 'success'>('input')
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [userId, setUserId] = useState('')
  const [audioInfo, setAudioInfo] = useState<any>(null)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

      if (uploadFile) {
        formData.append('file', uploadFile)
      } else if (audioInfo?.filePath) {
        formData.append('filePath', audioInfo.filePath)
      }

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

  const reset = () => {
    setStep('input')
    setUrl('')
    setAudioInfo(null)
    setUploadResult(null)
    setError('')
    setUploadFile(null)
  }

  return (
    <main className="min-h-screen py-10 px-4">
      <div className="max-w-xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent">
          Roblox Audio Uploader
        </h1>
        <p className="text-center text-gray-400 mb-8">Download lagu & upload langsung ke Roblox</p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: INPUT */}
        {step === 'input' && (
          <div className="glass rounded-xl p-6 space-y-6">
            <div>
              <label className="block text-sm text-gray-300 mb-2">URL YouTube</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={handleDownload}
                disabled={loading}
                className="mt-3 w-full py-3 bg-gradient-to-r from-red-600 to-red-500 rounded-lg font-semibold hover:from-red-700 hover:to-red-600 disabled:opacity-50"
              >
                {loading ? 'Downloading...' : 'Download dari URL'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/20"></div>
              <span className="text-gray-500 text-sm">atau</span>
              <div className="flex-1 h-px bg-white/20"></div>
            </div>

            <div>
              <input ref={fileRef} type="file" accept=".mp3,.ogg" onChange={handleFile} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-3 border border-white/20 rounded-lg font-semibold hover:bg-white/10"
              >
                Pilih File Audio (MP3/OGG)
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & CREDENTIALS */}
        {step === 'preview' && audioInfo && (
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="p-4 bg-white/5 rounded-lg">
              <h3 className="font-semibold text-lg">{audioInfo.title}</h3>
              <p className="text-gray-400 text-sm">{audioInfo.author}</p>
              {audioInfo.duration > 0 && (
                <p className="text-gray-500 text-xs mt-1">
                  Durasi: {Math.floor(audioInfo.duration / 60)}:{String(audioInfo.duration % 60).padStart(2, '0')}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Roblox Open Cloud API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key dari create.roblox.com/credentials"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Roblox User ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Contoh: 123456789"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-3 border border-white/20 rounded-lg hover:bg-white/10">
                Kembali
              </button>
              <button
                onClick={handleUpload}
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-lg font-semibold hover:from-green-700 hover:to-green-600"
              >
                Upload ke Roblox
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: UPLOADING */}
        {step === 'uploading' && (
          <div className="glass rounded-xl p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg">Mengupload ke Roblox...</p>
            <p className="text-gray-400 text-sm mt-1">Mohon tunggu</p>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && uploadResult && (
          <div className="glass rounded-xl p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-green-400">Upload Berhasil!</h2>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-gray-400 text-sm">Asset ID:</p>
              <p className="font-mono text-xl">{uploadResult.assetId}</p>
            </div>
            <div className="bg-black/30 rounded-lg p-3">
              <code className="text-green-400 text-sm">rbxassetid://{uploadResult.assetId}</code>
            </div>
            <button onClick={reset} className="w-full py-3 bg-gradient-to-r from-red-600 to-red-500 rounded-lg font-semibold">
              Upload Lagi
            </button>
          </div>
        )}

        {/* INFO */}
        <div className="mt-8 text-xs text-gray-500 space-y-1">
          <p>Cara dapat API Key: <a href="https://create.roblox.com/credentials" target="_blank" className="text-blue-400 underline">create.roblox.com/credentials</a></p>
          <p>Permission: Assets API → Read & Write</p>
        </div>
      </div>
    </main>
  )
}
