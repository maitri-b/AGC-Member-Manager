'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import Navbar from './Navbar';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show Navbar on login, apply, and root pages
  const hideNavbar = pathname === '/' || pathname === '/login' || pathname === '/apply';

  return (
    <>
      {!hideNavbar && <Navbar />}
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          // Set z-index higher than modal (modal is usually 50, so use 9999)
          style: {
            zIndex: 9999,
          },
          duration: 4000,
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </>
  );
}
