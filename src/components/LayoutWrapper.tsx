'use client';

import { usePathname } from 'next/navigation';
import Navbar from './Navbar';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show Navbar on login, apply, and root pages
  const hideNavbar = pathname === '/' || pathname === '/login' || pathname === '/apply';

  return (
    <>
      {!hideNavbar && <Navbar />}
      {children}
    </>
  );
}
