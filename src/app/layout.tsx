import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Longrun',
  description: 'Lifecycle register for technology components',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce-based CSP requires every page to render per request (Next.js CSP guide).
  await connection()
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">
            Longrun
          </Link>
          <nav aria-label="Main">
            <Link href="/">Components</Link>
          </nav>
          {/* App Service built-in auth sign-out (ADR 0002). */}
          <a href="/.auth/logout">Sign out</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
