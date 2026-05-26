/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', '@distube/ytdl-core']
  }
}

module.exports = nextConfig
