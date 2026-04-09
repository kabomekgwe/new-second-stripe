'use client';

import { useState } from 'react';
import { useAuth } from '../layout';
import { useUpdateProfileMutation } from '@/lib/store/auth-api';

const COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'AT', name: 'Austria' },
  { code: 'AU', name: 'Australia' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DE', name: 'Germany' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EE', name: 'Estonia' },
  { code: 'ES', name: 'Spain' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HR', name: 'Croatia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'South Korea' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'LV', name: 'Latvia' },
  { code: 'MT', name: 'Malta' },
  { code: 'MX', name: 'Mexico' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NO', name: 'Norway' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'US', name: 'United States' },
  { code: 'ZA', name: 'South Africa' },
].sort((a, b) => a.name.localeCompare(b.name));

export default function ProfilePage() {
  const user = useAuth();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [country, setCountry] = useState(user?.country ?? '');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const countryName = COUNTRIES.find((c) => c.code === user.country)?.name ?? user.country;

  async function handleSave() {
    setSuccess(false);
    setError(null);
    try {
      await updateProfile({ country }).unwrap();
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Profile</h1>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-500">Name</label>
          <p className="mt-1 text-gray-900">{user.name}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500">Email</label>
          <p className="mt-1 text-gray-900">{user.email}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500">Currency</label>
          <p className="mt-1 text-gray-900">{user.currency}</p>
        </div>

        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-500">
            Country
          </label>
          <p className="mt-1 text-xs text-gray-400 mb-1">
            Current: {countryName} ({user.country})
          </p>
          <select
            id="country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setSuccess(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {success && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            Country updated to {COUNTRIES.find((c) => c.code === country)?.name}. Payment methods will reflect this change.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isLoading || country === user.country}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
