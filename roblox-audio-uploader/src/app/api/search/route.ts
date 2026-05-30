import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json()

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Query terlalu pendek' }, { status: 400 })
    }

    // Use yt-dlp to search YouTube
    const searchQuery = query.replace(/"/g, '\\"')
    const { stdout } = await execAsync(
      `yt-dlp "ytsearch10:${searchQuery}" --dump-json --no-download --flat-playlist`,
      { timeout: 30000 }
    )

    // Parse each JSON line (yt-dlp outputs one JSON per line)
    const results = stdout
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          const item = JSON.parse(line)
          return {
            id: item.id,
            title: item.title,
            url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
            duration: item.duration || 0,
            thumbnail: item.thumbnails?.[0]?.url || item.thumbnail || '',
            author: item.uploader || item.channel || 'Unknown',
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return NextResponse.json({ results })
  } catch (error: any) {
    console.error('Search error:', error)

    if (error.message?.includes('is not recognized') || error.message?.includes('not found')) {
      return NextResponse.json({ error: 'yt-dlp belum terinstall' }, { status: 500 })
    }

    return NextResponse.json(
      { error: error.message || 'Search gagal' },
      { status: 500 }
    )
  }
}
