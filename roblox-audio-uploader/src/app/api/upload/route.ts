import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

const ROBLOX_OPEN_CLOUD_URL = 'https://apis.roblox.com/assets/v1/assets'

export interface BulkUploadItem {
  title: string
  filePath?: string
  fileId?: string
}

export interface BulkUploadResult {
  title: string
  success: boolean
  assetId?: string
  assetUrl?: string
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const apiKey = formData.get('apiKey') as string
    const userId = formData.get('userId') as string
    const bulkData = formData.get('bulkData') as string | null
    const title = formData.get('title') as string
    const file = formData.get('file') as File | null
    const filePath = formData.get('filePath') as string | null

    // Validate required fields
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key diperlukan' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID diperlukan' },
        { status: 400 }
      )
    }

    // Handle bulk upload
    if (bulkData) {
      const items: BulkUploadItem[] = JSON.parse(bulkData)
      return await handleBulkUpload(apiKey, userId, items)
    }

    // Single file upload (backward compatible)
    return await handleSingleUpload(apiKey, userId, title, file, filePath)

  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan saat upload' },
      { status: 500 }
    )
  }
}

async function handleBulkUpload(
  apiKey: string,
  userId: string,
  items: BulkUploadItem[]
): Promise<NextResponse> {
  const results: BulkUploadResult[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    try {
      // Check if file exists
      if (!item.filePath || !existsSync(item.filePath)) {
        results.push({
          title: item.title,
          success: false,
          error: 'File audio tidak ditemukan'
        })
        continue
      }

      const audioBuffer = await readFile(item.filePath)
      const fileName = item.filePath.split('/').pop() || 'audio.mp3'
      const contentType = fileName.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg'

      // Validate file size
      const MAX_SIZE = 19.5 * 1024 * 1024
      if (audioBuffer.length > MAX_SIZE) {
        results.push({
          title: item.title,
          success: false,
          error: 'File terlalu besar (max 19.5 MB)'
        })
        // Clean up
        try { await unlink(item.filePath) } catch {}
        continue
      }

      // Upload to Roblox
      const result = await uploadToRoblox(apiKey, userId, item.title, audioBuffer, fileName, contentType)
      results.push({
        title: item.title,
        success: true,
        assetId: result.assetId,
        assetUrl: result.assetUrl
      })

      // Clean up temp file
      try { await unlink(item.filePath) } catch {}

      // Delay between uploads to avoid rate limiting (2 seconds)
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

    } catch (error: any) {
      results.push({
        title: item.title,
        success: false,
        error: error.message || 'Gagal upload'
      })
      // Clean up on error
      if (item.filePath) {
        try { await unlink(item.filePath) } catch {}
      }
    }
  }

  return NextResponse.json({ results })
}

async function handleSingleUpload(
  apiKey: string,
  userId: string,
  title: string,
  file: File | null,
  filePath: string | null
): Promise<NextResponse> {
  let audioBuffer: Buffer
  let fileName: string
  let contentType: string

  if (file) {
    const arrayBuffer = await file.arrayBuffer()
    audioBuffer = Buffer.from(arrayBuffer)
    fileName = file.name
    contentType = file.type || 'audio/mpeg'
  } else if (filePath && existsSync(filePath)) {
    audioBuffer = await readFile(filePath)
    fileName = filePath.split('/').pop() || 'audio.mp3'
    contentType = fileName.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg'

    try { await unlink(filePath) } catch (e) {
      console.warn('Could not delete temp file:', e)
    }
  } else {
    return NextResponse.json(
      { error: 'File audio tidak ditemukan' },
      { status: 400 }
    )
  }

  // Validate file size
  const MAX_SIZE = 19.5 * 1024 * 1024
  if (audioBuffer.length > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File terlalu besar. Maksimal 19.5 MB' },
      { status: 400 }
    )
  }

  const result = await uploadToRoblox(apiKey, userId, title || 'Untitled Audio', audioBuffer, fileName, contentType)

  return NextResponse.json(result)
}

async function uploadToRoblox(
  apiKey: string,
  userId: string,
  title: string,
  audioBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<{ assetId: string; assetUrl: string }> {
  const assetName = sanitizeAssetName(title)
  const boundary = '----RobloxAudioUploader' + Date.now() + Math.random().toString(36).slice(2)

  const requestBody = createMultipartBody(boundary, {
    assetType: 'Audio',
    displayName: assetName,
    description: 'Uploaded via Roblox Audio Uploader',
    creationContext: {
      creator: {
        userId: userId
      }
    }
  }, audioBuffer, fileName, contentType)

  const response = await fetch(ROBLOX_OPEN_CLOUD_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: new Uint8Array(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Roblox API Error:', response.status, errorText)

    let errorMessage = 'Gagal upload ke Roblox'

    if (response.status === 401) {
      errorMessage = 'API Key tidak valid atau expired'
    } else if (response.status === 403) {
      errorMessage = 'API Key tidak memiliki permission untuk upload audio'
    } else if (response.status === 400) {
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorMessage
      } catch {
        errorMessage = 'Request tidak valid. Periksa format file audio'
      }
    } else if (response.status === 429) {
      errorMessage = 'Rate limit exceeded. Tunggu beberapa saat'
    }

    throw new Error(errorMessage)
  }

  const result = await response.json()
  const operationPath = result.path || result.operationId

  if (operationPath) {
    const asset = await pollOperationResult(apiKey, operationPath)
    if (asset) {
      const assetId = asset.assetId || extractAssetId(asset.path)
      return {
        assetId,
        assetUrl: `https://www.roblox.com/library/${assetId}`
      }
    }
  }

  const assetId = result.assetId || extractAssetId(result.path)
  return {
    assetId,
    assetUrl: `https://www.roblox.com/library/${assetId}`
  }
}

function sanitizeAssetName(name: string): string {
  return name
    .replace(/[^\w\s-]/g, '')
    .trim()
    .substring(0, 50) || 'Audio'
}

function createMultipartBody(
  boundary: string,
  metadata: object,
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Buffer {
  const CRLF = '\r\n'

  let body = ''

  body += `--${boundary}${CRLF}`
  body += `Content-Disposition: form-data; name="request"${CRLF}`
  body += `Content-Type: application/json${CRLF}${CRLF}`
  body += JSON.stringify(metadata)
  body += CRLF

  body += `--${boundary}${CRLF}`
  body += `Content-Disposition: form-data; name="fileContent"; filename="${fileName}"${CRLF}`
  body += `Content-Type: ${contentType}${CRLF}${CRLF}`

  const bodyStart = Buffer.from(body, 'utf8')
  const bodyEnd = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')

  return Buffer.concat([bodyStart, fileBuffer, bodyEnd])
}

async function pollOperationResult(apiKey: string, operationPath: string, maxAttempts = 30): Promise<any> {
  const operationUrl = operationPath.startsWith('http')
    ? operationPath
    : `https://apis.roblox.com/${operationPath}`

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000))

    try {
      const response = await fetch(operationUrl, {
        headers: {
          'x-api-key': apiKey
        }
      })

      if (response.ok) {
        const result = await response.json()

        if (result.done) {
          if (result.response) {
            return result.response
          }
          if (result.error) {
            throw new Error(result.error.message || 'Upload gagal')
          }
        }
      }
    } catch (e) {
      console.warn('Poll attempt failed:', e)
    }
  }

  throw new Error('Timeout menunggu hasil upload. Cek di Roblox Creator Dashboard')
}

function extractAssetId(path: string): string {
  const match = path?.match(/assets\/(\d+)/)
  return match ? match[1] : path
}
