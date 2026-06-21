import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'SoundCiel — Roblox Audio Tool',
  description: 'Download YouTube, konversi ke MP3/OGG, dan upload langsung ke Roblox via Open Cloud API.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans`}>{children}</body>
    </html>
  )
}
