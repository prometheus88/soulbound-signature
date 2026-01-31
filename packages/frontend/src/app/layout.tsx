import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { WalletSelector } from '@/components/WalletSelector';
import { Toaster } from '@/components/ui/toaster';
import Link from 'next/link';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Soulbound Signature',
  description: 'x402-powered e-signature with KYC-verified wallet signing on Aptos',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            {/* Header */}
            <header className="border-b bg-white sticky top-0 z-50">
              <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-3">
                  {/* Signature Logo */}
                  <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                    <svg 
                      className="w-6 h-6 text-white" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
                      />
                    </svg>
                  </div>
                  <span className="text-xl font-bold text-gray-900">Soulbound Signature</span>
                </Link>
                
                <nav className="flex items-center gap-6">
                  <Link 
                    href="/create" 
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Create Document
                  </Link>
                  <Link 
                    href="/documents" 
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    My Documents
                  </Link>
                  <Link 
                    href="/inbox" 
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Inbox
                  </Link>
                  <WalletSelector />
                </nav>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 bg-gray-50">
              <div className="container mx-auto px-4 py-8">
                {children}
              </div>
            </main>

            {/* Footer */}
            <footer className="border-t bg-white">
              <div className="container mx-auto px-4 py-6">
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <p>Powered by x402 on Aptos</p>
                  <div className="flex items-center gap-4">
                    <a 
                      href={`${API_URL}/api-docs`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-gray-900 transition-colors"
                    >
                      API Docs
                    </a>
                    <a 
                      href={`${API_URL}/discovery/resources`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-gray-900 transition-colors"
                    >
                      Discovery
                    </a>
                  </div>
                </div>
              </div>
            </footer>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
