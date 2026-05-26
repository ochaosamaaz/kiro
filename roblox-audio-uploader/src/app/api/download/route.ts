import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync, statSync, readdirSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const TEMP_DIR = path.join(process.cwd(), 'tmp')

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL tidak boleh kosong' }, { status: 400 })
    }

    // Direct audio file URL
    if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
      return await downloadDirectAudio(url)
    }

    // YouTube or other supported sites → use yt-dlp
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
  const outputTemplate = path.join(TEMP_DIR, fileId)

  // Clean URL - remove playlist params to avoid issues
  let cleanUrl = url.split('&list=')[0]

  // Step 1: Get info
  let info: any = {}
  try {
    const { stdout } = await execAsync(
      `yt-dlp --no-playlist --dump-json --no-download "${cleanUrl}"`,
      { timeout: 30000 }
    )
    info = JSON.parse(stdout)
  } catch (e: any) {
    // If info fails, still try to download
    console.warn('Info fetch failed, trying download anyway:', e.message)
  }

  // Step 2: Download audio
  try {
    await execAsync(
      `yt-dlp --no-playlist -x --audio-format mp3 --audio-quality 5 -o "${outputTemplate}.%(ext)s" "${cleanUrl}"`,
      { timeout: 120000 }
    )
  } catch (e: any) {
    const msg = e.stderr || e.message || ''

    if (msg.includes('is not recognized') || msg.includes('not found')) {
      return NextResponse.json({
        error: 'yt-dlp belum terinstall! Install dulu: pip install yt-dlp'
      }, { status: 500 })
    }

    if (msg.includes('Sign in') || msg.includes('bot')) {
      return NextResponse.json({
        error: 'YouTube memerlukan login. Coba: yt-dlp --cookies-from-browser chrome'
      }, { status: 500 })
    }

    return NextResponse.json({
      error: `Download gagal: ${msg.slice(0, 200)}`
    }, { status: 500 })
  }

  // Step 3: Find the downloaded file
  const files = readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId))
  if (files.length === 0) {
    return NextResponse.json({ error: 'File tidak ditemukan setelah download' }, { status: 500 })
  }

  const finalPath = path.join(TEMP_DIR, files[0])
  const fileSize = statSync(finalPath).size

  return NextResponse.json({
    title: info.title || 'Downloaded Audio',
    duration: info.duration || 0,
    thumbnail: info.thumbnail || '',
    author: info.uploader || info.channel || 'Unknown',
    fileSize,
    filePath: finalPath,
    fileId,
  })
}

async function downloadDirectAudio(url: string) {
  await ensureTempDir()

  const response = await fetch(url)
  if (!response.ok) throw new Error('Gagal mengunduh file')

  const buffer = Buffer.from(await response.arrayBuffer())
  const fileId = uuidv4()
  const ext = url.match(/\.(mp3|ogg|wav|m4a)/i)?.[1] || 'mp3'
  const filePath = path.join(TEMP_DIR, `${fileId}.${ext}`)

  await writeFile(filePath, buffer)

  const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'audio')

  return NextResponse.json({
    title: name.replace(/\.\w+$/, ''),
    duration: 0,
    thumbnail: '',
    author: 'Direct Download',
    fileSize: buffer.length,
    filePath,
    fileId,
  })
}
