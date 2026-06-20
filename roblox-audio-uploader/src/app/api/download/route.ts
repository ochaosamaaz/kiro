import { NextRequest, NextResponse } from 'next/server'
import ytdl from '@distube/ytdl-core'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

const TEMP_DIR = '/tmp/roblox-audio'

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true })
  }
}

export interface DownloadResult {
  url: string
  success: boolean
  title?: string
  duration?: number
  thumbnail?: string
  author?: string
  fileSize?: number
  filePath?: string
  fileId?: string
  error?: string
}

// Single URL download (backward compatible)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Support bulk download
    if (body.urls && Array.isArray(body.urls)) {
      return await handleBulkDownload(body.urls)
    }

    // Single URL download (backward compatible)
    const { url } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL tidak boleh kosong' },
        { status: 400 }
      )
    }

    // Check if it's a YouTube URL
    if (ytdl.validateURL(url)) {
      return await downloadFromYouTube(url)
    }

    // For direct audio URLs
    if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
      return await downloadDirectAudio(url)
    }

    return NextResponse.json(
      { error: 'URL tidak valid. Gunakan YouTube URL atau direct audio URL' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: error.message || 'Gagal mengunduh audio' },
      { status: 500 }
    )
  }
}

async function handleBulkDownload(urls: string[]): Promise<NextResponse> {
  // Max 20 URLs per batch
  const MAX_URLS = 20
  const uniqueUrls = Array.from(new Set(urls.filter(u => u.trim()))).slice(0, MAX_URLS)

  if (uniqueUrls.length === 0) {
    return NextResponse.json(
      { error: 'Tidak ada URL valid yang ditemukan' },
      { status: 400 }
    )
  }

  const results: DownloadResult[] = []

  for (const url of uniqueUrls) {
    try {
      if (ytdl.validateURL(url)) {
        const result = await downloadFromYouTubeBulk(url)
        results.push(result)
      } else if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
        const result = await downloadDirectAudioBulk(url)
        results.push(result)
      } else {
        results.push({
          url,
          success: false,
          error: 'URL tidak valid'
        })
      }
    } catch (error: any) {
      results.push({
        url,
        success: false,
        error: error.message || 'Gagal mengunduh'
      })
    }
  }

  return NextResponse.json({ results })
}

async function downloadFromYouTubeBulk(url: string): Promise<DownloadResult> {
  await ensureTempDir()

  try {
    const info = await ytdl.getInfo(url)
    const videoDetails = info.videoDetails

    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')

    if (audioFormats.length === 0) {
      return { url, success: false, error: 'Tidak ada format audio yang tersedia' }
    }

    const audioFormat = audioFormats.find(f =>
      f.audioQuality === 'AUDIO_QUALITY_MEDIUM' ||
      f.audioQuality === 'AUDIO_QUALITY_LOW'
    ) || audioFormats[0]

    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = ytdl(url, { format: audioFormat })

      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })

    const fileId = uuidv4()
    const fileName = `${fileId}.mp3`
    const filePath = path.join(TEMP_DIR, fileName)

    await writeFile(filePath, audioBuffer)

    const duration = parseInt(videoDetails.lengthSeconds)

    return {
      url,
      success: true,
      title: videoDetails.title,
      duration,
      thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || '',
      author: videoDetails.author.name,
      fileSize: audioBuffer.length,
      filePath,
      fileId
    }
  } catch (error: any) {
    return { url, success: false, error: error.message || 'Gagal download dari YouTube' }
  }
}

async function downloadDirectAudioBulk(url: string): Promise<DownloadResult> {
  await ensureTempDir()

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return { url, success: false, error: 'Gagal mengunduh file audio' }
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const fileId = uuidv4()
    const extension = url.match(/\.(mp3|ogg|wav|m4a)/i)?.[1] || 'mp3'
    const fileName = `${fileId}.${extension}`
    const filePath = path.join(TEMP_DIR, fileName)

    await writeFile(filePath, buffer)

    const urlParts = url.split('/')
    const originalName = urlParts[urlParts.length - 1].split('?')[0]

    return {
      url,
      success: true,
      title: decodeURIComponent(originalName.replace(/\.(mp3|ogg|wav|m4a)$/i, '')),
      duration: 0,
      thumbnail: '',
      author: 'Direct Download',
      fileSize: buffer.length,
      filePath,
      fileId
    }
  } catch (error: any) {
    return { url, success: false, error: error.message || 'Gagal download' }
  }
}

// Original single-download functions (kept for backward compatibility)
async function downloadFromYouTube(url: string) {
  await ensureTempDir()

  const info = await ytdl.getInfo(url)
  const videoDetails = info.videoDetails

  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')

  if (audioFormats.length === 0) {
    throw new Error('Tidak ada format audio yang tersedia')
  }

  const audioFormat = audioFormats.find(f =>
    f.audioQuality === 'AUDIO_QUALITY_MEDIUM' ||
    f.audioQuality === 'AUDIO_QUALITY_LOW'
  ) || audioFormats[0]

  const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = ytdl(url, { format: audioFormat })

    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })

  const fileId = uuidv4()
  const fileName = `${fileId}.mp3`
  const filePath = path.join(TEMP_DIR, fileName)

  await writeFile(filePath, audioBuffer)

  const duration = parseInt(videoDetails.lengthSeconds)
  if (duration > 420) {
    console.warn('Warning: Audio longer than 7 minutes may require Roblox Premium')
  }

  return NextResponse.json({
    title: videoDetails.title,
    duration: duration,
    thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1]?.url || '',
    author: videoDetails.author.name,
    fileSize: audioBuffer.length,
    filePath: filePath,
    fileId: fileId
  })
}

async function downloadDirectAudio(url: string) {
  await ensureTempDir()

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Gagal mengunduh file audio')
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const fileId = uuidv4()
  const extension = url.match(/\.(mp3|ogg|wav|m4a)/i)?.[1] || 'mp3'
  const fileName = `${fileId}.${extension}`
  const filePath = path.join(TEMP_DIR, fileName)

  await writeFile(filePath, buffer)

  const urlParts = url.split('/')
  const originalName = urlParts[urlParts.length - 1].split('?')[0]

  return NextResponse.json({
    title: decodeURIComponent(originalName.replace(/\.(mp3|ogg|wav|m4a)$/i, '')),
    duration: 0,
    thumbnail: '',
    author: 'Direct Download',
    fileSize: buffer.length,
    filePath: filePath,
    fileId: fileId
  })
}
