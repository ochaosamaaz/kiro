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

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

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

async function downloadFromYouTube(url: string) {
  await ensureTempDir()
  
  const info = await ytdl.getInfo(url)
  const videoDetails = info.videoDetails

  // Get audio-only format
  const audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
  
  if (audioFormats.length === 0) {
    throw new Error('Tidak ada format audio yang tersedia')
  }

  // Prefer mp3/m4a format with reasonable quality
  const audioFormat = audioFormats.find(f => 
    f.audioQuality === 'AUDIO_QUALITY_MEDIUM' || 
    f.audioQuality === 'AUDIO_QUALITY_LOW'
  ) || audioFormats[0]

  // Download the audio
  const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = ytdl(url, { format: audioFormat })
    
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })

  // Save to temp file
  const fileId = uuidv4()
  const fileName = `${fileId}.mp3`
  const filePath = path.join(TEMP_DIR, fileName)
  
  await writeFile(filePath, audioBuffer)

  // Check Roblox audio limits (max 7 minutes / 420 seconds for free users)
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

  // Save to temp file
  const fileId = uuidv4()
  const extension = url.match(/\.(mp3|ogg|wav|m4a)/i)?.[1] || 'mp3'
  const fileName = `${fileId}.${extension}`
  const filePath = path.join(TEMP_DIR, fileName)
  
  await writeFile(filePath, buffer)

  // Extract filename from URL
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
