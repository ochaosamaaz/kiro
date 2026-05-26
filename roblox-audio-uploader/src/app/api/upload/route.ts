import { NextRequest, NextResponse } from 'next/server'
import { readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'

const ROBLOX_OPEN_CLOUD_URL = 'https://apis.roblox.com/assets/v1/assets'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const apiKey = formData.get('apiKey') as string
    const userId = formData.get('userId') as string
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

    // Get audio buffer
    let audioBuffer: Buffer
    let fileName: string
    let contentType: string

    if (file) {
      // From uploaded file
      const arrayBuffer = await file.arrayBuffer()
      audioBuffer = Buffer.from(arrayBuffer)
      fileName = file.name
      contentType = file.type || 'audio/mpeg'
    } else if (filePath && existsSync(filePath)) {
      // From downloaded file
      audioBuffer = await readFile(filePath)
      fileName = filePath.split('/').pop() || 'audio.mp3'
      contentType = fileName.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg'
      
      // Clean up temp file after reading
      try {
        await unlink(filePath)
      } catch (e) {
        console.warn('Could not delete temp file:', e)
      }
    } else {
      return NextResponse.json(
        { error: 'File audio tidak ditemukan' },
        { status: 400 }
      )
    }

    // Validate file size (Roblox limit: ~19.5 MB for audio)
    const MAX_SIZE = 19.5 * 1024 * 1024
    if (audioBuffer.length > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File terlalu besar. Maksimal 19.5 MB' },
        { status: 400 }
      )
    }

    // Create the request to Roblox Open Cloud API
    const assetName = sanitizeAssetName(title || 'Audio Upload')
    
    // Prepare multipart form data for Roblox API
    const boundary = '----RobloxAudioUploader' + Date.now()
    
    const requestBody = createMultipartBody(boundary, {
      assetType: 'Audio',
      displayName: assetName,
      description: `Uploaded via Roblox Audio Uploader`,
      creationContext: {
        creator: {
          userId: userId
        }
      }
    }, audioBuffer, fileName, contentType)

    // Upload to Roblox
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
        errorMessage = 'API Key tidak memiliki permission untuk upload audio. Pastikan sudah mengaktifkan Assets API dengan permission Write'
      } else if (response.status === 400) {
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorMessage
        } catch {
          errorMessage = 'Request tidak valid. Periksa format file audio'
        }
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Tunggu beberapa saat sebelum upload lagi'
      }

      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const result = await response.json()
    
    // The response contains operation info - we need to poll for the result
    const operationPath = result.path || result.operationId
    
    if (operationPath) {
      // Poll for operation completion
      const asset = await pollOperationResult(apiKey, operationPath)
      
      if (asset) {
        const assetId = asset.assetId || extractAssetId(asset.path)
        return NextResponse.json({
          assetId: assetId,
          assetUrl: `https://www.roblox.com/library/${assetId}`,
          ...asset
        })
      }
    }

    // If direct response with asset info
    const assetId = result.assetId || extractAssetId(result.path)
    
    return NextResponse.json({
      assetId: assetId,
      assetUrl: `https://www.roblox.com/library/${assetId}`,
      ...result
    })

  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Terjadi kesalahan saat upload' },
      { status: 500 }
    )
  }
}

function sanitizeAssetName(name: string): string {
  // Remove special characters and limit length
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
  
  // Build the multipart body
  let body = ''
  
  // Add request metadata part
  body += `--${boundary}${CRLF}`
  body += `Content-Disposition: form-data; name="request"${CRLF}`
  body += `Content-Type: application/json${CRLF}${CRLF}`
  body += JSON.stringify(metadata)
  body += CRLF
  
  // Add file part header
  body += `--${boundary}${CRLF}`
  body += `Content-Disposition: form-data; name="fileContent"; filename="${fileName}"${CRLF}`
  body += `Content-Type: ${contentType}${CRLF}${CRLF}`
  
  // Combine text parts with file buffer
  const bodyStart = Buffer.from(body, 'utf8')
  const bodyEnd = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
  
  return Buffer.concat([bodyStart, fileBuffer, bodyEnd])
}

async function pollOperationResult(apiKey: string, operationPath: string, maxAttempts = 30): Promise<any> {
  const operationUrl = operationPath.startsWith('http') 
    ? operationPath 
    : `https://apis.roblox.com/${operationPath}`

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds

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
  // Extract asset ID from path like "assets/123456789"
  const match = path?.match(/assets\/(\d+)/)
  return match ? match[1] : path
}
