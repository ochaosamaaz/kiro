import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Roblox Audio Uploader',
  description: 'Download lagu & upload ke Roblox',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
