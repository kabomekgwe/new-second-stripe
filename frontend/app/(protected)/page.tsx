'use client';

import { useGetMeQuery } from '@/lib/store/auth-api';

export default function DashboardPage() {
  const { data: user } = useGetMeQuery();

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
