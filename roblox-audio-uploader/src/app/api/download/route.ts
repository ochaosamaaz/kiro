import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
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
    if (url.match(/(?:youtube\.com|youtu\.be)/)) {
      return await downloadWithYtDlp(url)
    }

    // For direct audio URLs
    if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
      return await downloadDirectAudio(url)
    }

    // Try yt-dlp for other supported sites (SoundCloud, etc.)
    return await downloadWithYtDlp(url)
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: error.message || 'Gagal mengunduh audio' },
      { status: 500 }
    )
  }
}

async function downloadWithYtDlp(url: string) {
  await ensureTempDir()

  const fileId = uuidv4()
  const outputPath = path.join(TEMP_DIR, `${fileId}.mp3`)

  try {
    // First, get video info
    const { stdout: infoJson } = await execAsync(
      `yt-dlp --dump-json --no-download "${url}"`,
      { timeout: 30000 }
    )

    const info = JSON.parse(infoJson)

    // Download audio only, convert to mp3
    await execAsync(
      `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${outputPath}" "${url}"`,
      { timeout: 120000 }
    )

    // Check if file exists (yt-dlp might add extension)
    let finalPath = outputPath
    if (!existsSync(finalPath)) {
      // yt-dlp sometimes outputs with different extension
      const possiblePaths = [
        outputPath,
        outputPath.replace('.mp3', '.mp3.mp3'),
        path.join(TEMP_DIR, `${fileId}.mp3`)
      ]
      for (const p of possiblePaths) {
        if (existsSync(p)) {
          finalPath = p
          break
        }
      }
    }

    const { size } = await import('fs').then(fs => fs.statSync(finalPath))

    // Check Roblox audio limits (max 7 minutes for free)
    const duration = info.duration || 0
    if (duration > 420) {
      console.warn('Warning: Audio longer than 7 minutes may require Roblox Premium')
    }

    return NextResponse.json({
      title: info.title || 'Unknown',
      duration: duration,
      thumbnail: info.thumbnail || '',
      author: info.uploader || info.channel || 'Unknown',
      fileSize: size,
      filePath: finalPath,
      fileId: fileId
    })
  } catch (error: any) {
    // If yt-dlp is not installed, provide helpful error
    if (error.message?.includes('not found') || error.message?.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'yt-dlp belum terinstall. Jalankan: pip install yt-dlp atau download dari https://github.com/yt-dlp/yt-dlp' },
        { status: 500 }
      )
    }
    throw error
  }
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
