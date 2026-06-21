import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const TEMP_DIR = path.join(process.cwd(), 'tmp', 'roblox-audio')
const COOKIES_PATH = path.join(process.cwd(), 'tmp', 'cookies.txt')

// yt-dlp binary path - change this if yt-dlp is not in PATH
const YT_DLP_PATH = process.env.YT_DLP_PATH || 'yt-dlp'

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true })
  }
}

// Write cookies from env variable to file (for yt-dlp --cookies flag)
async function ensureCookiesFile(): Promise<string | null> {
  const cookies = process.env.YOUTUBE_COOKIES
  if (!cookies) return null

  await ensureTempDir()
  
  if (!existsSync(COOKIES_PATH)) {
    await writeFile(COOKIES_PATH, cookies, 'utf-8')
  }
  
  return COOKIES_PATH
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

    // For direct audio URLs (no need yt-dlp)
    if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
      return await downloadDirectAudio(url)
    }

    // Use yt-dlp for YouTube and other supported sites
    const result = await downloadWithYtDlp(url)
    if (result.success) {
      return NextResponse.json({
        title: result.title,
        duration: result.duration,
        thumbnail: result.thumbnail,
        author: result.author,
        fileSize: result.fileSize,
        filePath: result.filePath,
        fileId: result.fileId
      })
    } else {
      return NextResponse.json(
        { error: result.error || 'Gagal mengunduh audio' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: error.message || 'Gagal mengunduh audio' },
      { status: 500 }
    )
  }
}

async function handleBulkDownload(urls: string[]): Promise<NextResponse> {
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
      if (url.match(/\.(mp3|ogg|wav|m4a)(\?.*)?$/i)) {
        const result = await downloadDirectAudioBulk(url)
        results.push(result)
      } else {
        // Use yt-dlp for everything else (YouTube, SoundCloud, etc.)
        const result = await downloadWithYtDlp(url)
        results.push(result)
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

async function downloadWithYtDlp(url: string): Promise<DownloadResult> {
  await ensureTempDir()

  const fileId = uuidv4()
  const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`)
  const infoPath = path.join(TEMP_DIR, `${fileId}.info.json`)

  // Strip playlist parameters from YouTube URLs to avoid issues
  let cleanUrl = url
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      urlObj.searchParams.delete('list')
      urlObj.searchParams.delete('index')
      urlObj.searchParams.delete('start_radio')
      cleanUrl = urlObj.toString()
    }
  } catch {}

  try {
    // Get cookies file path if available
    const cookiesFile = await ensureCookiesFile()

    // Build yt-dlp arguments
    const args = [
      '-x',                          // Extract audio
      '--audio-format', 'mp3',       // Convert to mp3
      '--audio-quality', '5',        // Medium quality (0=best, 10=worst)
      '-o', outputPath,              // Output path
      '--no-playlist',               // Don't download playlist
      '--no-warnings',               // Suppress warnings
      '--write-info-json',           // Write metadata to .info.json file
      '--socket-timeout', '60',      // Socket timeout 60s
      '--retries', '3',              // Retry 3 times
      '--no-check-certificates',     // Skip cert check (faster)
      '--extractor-retries', '3',    // Retry extractor 3 times
      '--force-ipv4',                // Force IPv4 (more reliable on servers)
    ]

    // Add cookies if available
    if (cookiesFile) {
      args.push('--cookies', cookiesFile)
    }

    args.push(cleanUrl)

    // Download audio + write info json in one step (faster, less requests)
    await execFileAsync(YT_DLP_PATH, args, { timeout: 300000, maxBuffer: 50 * 1024 * 1024 }) // 5 min timeout

    // Read info from .info.json
    let info: any = {}
    if (existsSync(infoPath)) {
      try {
        const infoContent = await readFile(infoPath, 'utf-8')
        info = JSON.parse(infoContent)
        // Clean up info file
        const { unlink } = await import('fs/promises')
        await unlink(infoPath).catch(() => {})
      } catch {}
    }

    // Find the downloaded file
    const finalPath = path.join(TEMP_DIR, `${fileId}.mp3`)

    let foundPath = finalPath
    if (!existsSync(finalPath)) {
      // yt-dlp might have used a different extension
      const possibleExts = ['mp3', 'webm', 'm4a', 'opus', 'ogg', 'wav']
      foundPath = ''
      for (const ext of possibleExts) {
        const tryPath = path.join(TEMP_DIR, `${fileId}.${ext}`)
        if (existsSync(tryPath)) {
          foundPath = tryPath
          break
        }
      }

      if (!foundPath) {
        return { url, success: false, error: 'File audio tidak ditemukan setelah download' }
      }
    }

    const fileBuffer = await readFile(foundPath)

    return {
      url,
      success: true,
      title: info.title || 'Untitled',
      duration: info.duration || 0,
      thumbnail: info.thumbnail || '',
      author: info.uploader || info.channel || 'Unknown',
      fileSize: fileBuffer.length,
      filePath: foundPath,
      fileId
    }
  } catch (error: any) {
    console.error('yt-dlp error for', url, ':', error.message || error)

    // Parse common yt-dlp errors
    let errorMessage = 'Gagal download'
    const stderr = error.stderr || error.message || ''

    if (stderr.includes('Video unavailable') || stderr.includes('is not available')) {
      errorMessage = 'Video tidak tersedia'
    } else if (stderr.includes('Private video')) {
      errorMessage = 'Video bersifat private'
    } else if (stderr.includes('Sign in to confirm your age')) {
      errorMessage = 'Video memerlukan verifikasi umur'
    } else if (stderr.includes('HTTP Error 403')) {
      errorMessage = 'Akses ditolak (403)'
    } else if (stderr.includes('HTTP Error 404')) {
      errorMessage = 'Video tidak ditemukan (404)'
    } else if (stderr.includes('is not a valid URL') || stderr.includes('Unsupported URL')) {
      errorMessage = 'URL tidak valid atau tidak didukung'
    } else if (stderr.includes('timed out') || stderr.includes('Read timed out')) {
      errorMessage = 'Koneksi timeout - coba lagi'
    } else if (error.killed) {
      errorMessage = 'Timeout - download terlalu lama (max 5 menit)'
    }

    return { url, success: false, error: errorMessage }
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
