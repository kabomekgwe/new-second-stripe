'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useGetMeQuery, useLogoutMutation } from '@/lib/store/auth-api';
import type { UserResponse } from '@/lib/shared';

// Auth context to share user data with children
const AuthContext = createContext<UserResponse | null>(null);

export const useAuth = () => {
  const user = useContext(AuthContext);
  return user;
};

// Re-export UserResponse for children
export type { UserResponse } from '@/lib/shared';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/payment-methods', label: 'Payment Methods' },
  { href: '/payments', label: 'Make Payment' },
  { href: '/billing', label: 'Billing' },
  { href: '/profile', label: 'Profile' },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError, error } = useGetMeQuery();
  const [logout] = useLogoutMutation();

  // Memoize the context value to prevent unnecessary re-renders
  // MUST be called before any conditional returns (Rules of Hooks)
  const contextValue = useMemo(() => user ?? null, [user]);

  useEffect(() => {
    if (isError) {
      // Log error for debugging
      console.error('Auth error:', error);
      router.push('/auth/login');
    }
  }, [isError, router, error]);

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch {
      // Redirect to login even if the session is already invalid.
    } finally {
      router.push('/auth/login');
    }
  }

  // Show loading only on initial load, not on every navigation
  // Early returns MUST come AFTER all hooks (Rules of Hooks)
  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // If there's an error but we have cached user data, show it (will redirect in useEffect)
  if (!user) return null;

  return (
    <AuthContext.Provider value={contextValue}>
      <div className="flex min-h-screen bg-gray-50">
        {/* Sidebar */}
        <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-white md:block">
          <div className="flex h-16 items-center border-b border-gray-200 px-6">
            <span className="text-lg font-semibold text-gray-900">Stripe App</span>
          </div>
          <nav className="mt-4 space-y-1 px-3">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
            {/* Mobile nav */}
            <nav className="flex gap-4 md:hidden">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium ${
                    pathname === link.href ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:block" />

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700">{user.name}</span>
              <button
                onClick={handleLogout}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Logout
              </button>
            </div>
          </header>

          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
