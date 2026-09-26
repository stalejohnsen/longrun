import type { Metadata } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Longrun',
  description: 'Lifecycle register for technology components',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce-based CSP requires every page to render per request (Next.js CSP guide).
  await connection()
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
