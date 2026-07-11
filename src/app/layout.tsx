import type { Metadata } from 'next'
import { AuthProvider } from '@/components/shared/AuthProvider'
import { CatalogSyncProvider } from '@/components/shared/CatalogSyncProvider'
import { AppHeader } from '@/components/shared/AppHeader'
import './globals.css'

export const metadata: Metadata = {
  title: 'openLearn',
  description: 'Your prep, at your pace. Practice questions and mock tests for competitive exams.',
   icons: {
    icon: "/logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.classList.add('theme-loaded');
                } catch(e) {}
              })()
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <CatalogSyncProvider />
          <AppHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
