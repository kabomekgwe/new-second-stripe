'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { UserResponse } from '@stripe-app/shared';

export default function DashboardPage() {
  const [user, setUser] = useState<UserResponse | null>(null);

  useEffect(() => {
    api.get<UserResponse>('/auth/me').then(setUser).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome{user ? `, ${user.name}` : ''}
      </h1>
      <p className="mt-2 text-gray-600">
        Manage your payments, payment methods, and billing from the dashboard.
      </p>
    </div>
  );
}
