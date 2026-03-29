'use client';

import { useAuth } from './layout';

export default function DashboardPage() {
  const user = useAuth();

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
