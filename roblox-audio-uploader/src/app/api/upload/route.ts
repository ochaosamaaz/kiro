import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

const ROBLOX_API_URL = 'https://apis.roblox.com/assets/v1/assets'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const apiKey = formData.get('apiKey') as string
    const userId = formData.get('userId') as string
    const title = formData.get('title') as string
    const file = formData.get('file') as File | null
    const filePath = formData.get('filePath') as string | null

    if (!apiKey) return NextResponse.json({ error: 'API Key wajib diisi' }, { status: 400 })
    if (!userId) return NextResponse.json({ error: 'User ID wajib diisi' }, { status: 400 })

    // Get audio buffer
    let audioBuffer: Buffer
    let fileName: string
    let contentType: string

    if (file) {
      audioBuffer = Buffer.from(await file.arrayBuffer())
      fileName = file.name
      contentType = file.type || 'audio/mpeg'
    } else if (filePath && existsSync(filePath)) {
      audioBuffer = await readFile(filePath)
      fileName = filePath.split(/[/\\]/).pop() || 'audio.mp3'
      contentType = fileName.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg'
      // Cleanup temp file
      try { await unlink(filePath) } catch {}
    } else {
      return NextResponse.json({ error: 'File audio tidak ditemukan' }, { status: 400 })
    }

    // Max 19.5 MB
    if (audioBuffer.length > 19.5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File terlalu besar (max 19.5 MB)' }, { status: 400 })
    }

    // Build multipart request for Roblox API
    const assetName = title.replace(/[^\w\s-]/g, '').trim().substring(0, 50) || 'Audio'
    const boundary = '----RobloxUpload' + Date.now()

    const metadata = JSON.stringify({
      assetType: 'Audio',
      displayName: assetName,
      description: 'Uploaded via Roblox Audio Uploader',
      creationContext: { creator: { userId } },
    })

    // Create multipart body
    const parts: Buffer[] = []
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`))
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fileContent"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`))
    parts.push(audioBuffer)
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

    const body = Buffer.concat(parts)

    // Upload to Roblox
    const response = await fetch(ROBLOX_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Roblox error:', response.status, errText)

      if (response.status === 401) return NextResponse.json({ error: 'API Key tidak valid' }, { status: 401 })
      if (response.status === 403) return NextResponse.json({ error: 'Permission denied. Pastikan API Key punya akses Assets Write' }, { status: 403 })
      if (response.status === 429) return NextResponse.json({ error: 'Rate limit. Tunggu sebentar' }, { status: 429 })

      return NextResponse.json({ error: `Upload gagal: ${errText.slice(0, 200)}` }, { status: response.status })
    }

    const result = await response.json()

    // Poll for operation result if needed
    if (result.path || result.operationId) {
      const asset = await pollOperation(apiKey, result.path || result.operationId)
      if (asset) {
        const assetId = asset.assetId || extractId(asset.path)
        return NextResponse.json({ assetId, assetUrl: `https://www.roblox.com/library/${assetId}` })
      }
    }

    const assetId = result.assetId || extractId(result.path)
    return NextResponse.json({ assetId, assetUrl: `https://www.roblox.com/library/${assetId}` })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: error.message || 'Upload gagal' }, { status: 500 })
  }
}

async function pollOperation(apiKey: string, opPath: string) {
  const url = opPath.startsWith('http') ? opPath : `https://apis.roblox.com/${opPath}`

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 2000))
    try {
      const res = await fetch(url, { headers: { 'x-api-key': apiKey } })
      if (res.ok) {
        const data = await res.json()
        if (data.done) return data.response || data
      }
    } catch {}
  }
  return null
}

function extractId(path: string): string {
  return path?.match(/assets\/(\d+)/)?.[1] || path || 'unknown'
}
