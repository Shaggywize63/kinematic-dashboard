'use client';

import { useState } from 'react';

type SectionId = 'geofence' | 'hours' | 'roles' | 'cities' | 'users';

const sections: { id: SectionId; label: string }[] = [
  { id: 'geofence', label: 'Geofence' },
  { id: 'hours', label: 'Min. Working Hours' },
  { id: 'roles', label: 'User Role Access' },
  { id: 'cities', label: 'City Management' },
  { id: 'users', label: 'User Management' },
];

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('geofence');

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white">
        <div className="px-4 py-4 border-b">
          <h2 className="text-xs font-semibold text-gray-500 tracking-wide uppercase">
            Admin Settings
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Configure platform rules and access
          </p>
        </div>

        <nav className="py-2 space-y-1">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                active === item.id
                  ? 'bg-indigo-50 text-indigo-600 font-medium border-r-4 border-indigo-500'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {active === 'geofence' && <GeofenceSettings />}
        {active === 'hours' && <WorkingHoursSettings />}
        {active === 'roles' && <RoleAccessSettings />}
        {active === 'cities' && <CityManagement />}
        {active === 'users' && <UserManagement />}
      </main>
    </div>
  );
}

/* ---------- Individual sections ---------- */

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-gray-500">
          {subtitle}
        </p>
      )}
    </header>
  );
}

function GeofenceSettings() {
  return (
    <section>
      <SectionHeader
        title="Geofence"
        subtitle="Define allowed working areas for your field executives."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add Geofence Rule</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                City
              </label>
              <select className="w-full border rounded-md px-3 py-2 text-sm">
                <option>Select city</option>
                <option>Gurugram</option>
                <option>Delhi</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Radius (km)
              </label>
              <input
                type="number"
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g. 5"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Status</span>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" className="rounded" defaultChecked />
                Enabled
              </label>
            </div>

            <button
              type="button"
              className="w-full mt-2 inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Save Geofence
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Existing Geofences</h2>
          <p className="text-xs text-gray-500 mb-3">
            List of configured geofence rules (connect to your API).
          </p>
          <div className="border border-dashed rounded-md p-4 text-xs text-gray-400 text-center">
            Connect to backend API to load geofences.
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkingHoursSettings() {
  return (
    <section>
      <SectionHeader
        title="Minimum Working Hours"
        subtitle="Configure daily minimum hours and grace rules."
      />

      <div className="max-w-xl bg-white p-4 rounded-lg border space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Minimum hours per day
          </label>
          <input
            type="number"
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. 8"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Grace period (minutes)
          </label>
          <input
            type="number"
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. 15"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Half-day threshold (hours)
          </label>
          <input
            type="number"
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="e.g. 4"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" className="rounded" defaultChecked />
            Apply different rules per role
          </label>
          <button
            type="button"
            className="inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Save Rules
          </button>
        </div>
      </div>
    </section>
  );
}

const modules = [
  'Dashboard',
  'Field Execs',
  'Attendance',
  'Analytics',
  'Warehouse',
  'Broadcast',
  'HR',
  'Live Tracking',
  'Notifications',
  'Settings',
];

function RoleAccessSettings() {
  const roles = ['Admin', 'Manager', 'HR', 'Warehouse'];

  return (
    <section>
      <SectionHeader
        title="User Role Access"
        subtitle="Control which modules each role can access in the admin panel."
      />

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Module
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <tr key={mod} className="border-t">
                <td className="px-4 py-2 text-xs text-gray-700">{mod}</td>
                {roles.map((role) => (
                  <td key={role} className="px-4 py-2 text-center">
                    <input type="checkbox" className="rounded" defaultChecked />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="inline-flex justify-center items-center px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Save Permissions
        </button>
      </div>
    </section>
  );
}

function CityManagement() {
  return (
    <section>
      <SectionHeader
        title="City Management"
        subtitle="Manage cities where your field force operates."
      />

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="bg-white p-4 rounded-lg border md:w-1/3">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Add City</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                City name
              </label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Gurugram"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                State
              </label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="e.g. Haryana"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Status</span>
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" className="rounded" defaultChecked />
                Active
              </label>
            </div>
            <button
              type="button"
              className="w-full mt-2 inline-flex justify-center items-center px-3 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Save City
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border flex-1 overflow-x-auto">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Cities</h2>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  City
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-3 py-2">Gurugram</td>
                <td className="px-3 py-2">Haryana</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                    Active
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button className="text-xs text-indigo-600 hover:underline">Edit</button>
                  <button className="text-xs text-red-600 hover:underline">Disable</button>
                </td>
              </tr>
              <tr className="border-t">
                <td className="px-3 py-2">Delhi</td>
                <td className="px-3 py-2">Delhi</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                    Inactive
                  </span>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button className="text-xs text-indigo-600 hover:underline">Edit</button>
                  <button className="text-xs text-green-600 hover:underline">Enable</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-gray-400">
            Replace static rows with data from your API.
          </p>
        </div>
      </div>
    </section>
  );
}

function UserManagement() {
  return (
    <section>
      <SectionHeader
        title="User Management"
        subtitle="Create and manage users, assign roles and cities."
      />

      <div className="bg-white p-4 rounded-lg border mb-4 flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Search user
          </label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Name, phone, or email"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Role
          </label>
          <select className="border rounded-md px-3 py-2 text-sm">
            <option>All</option>
            <option>Admin</option>
            <option>Manager</option>
            <option>Field Exec</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            City
          </label>
          <select className="border rounded-md px-3 py-2 text-sm">
            <option>All</option>
            <option>Gurugram</option>
            <option>Delhi</option>
          </select>
        </div>
        <button
          type="button"
          className="inline-flex justify-center items-center px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          + Add User
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                City
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-3 py-2">Sagar Bhargava</td>
              <td className="px-3 py-2">Admin</td>
              <td className="px-3 py-2">Gurugram</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                  Active
                </span>
              </td>
              <td className="px-3 py-2 text-right space-x-2">
                <button className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button className="text-xs text-yellow-600 hover:underline">Reset PW</button>
                <button className="text-xs text-red-600 hover:underline">Deactivate</button>
              </td>
            </tr>
            <tr className="border-t">
              <td className="px-3 py-2">Rohit Kumar</td>
              <td className="px-3 py-2">Field Exec</td>
              <td className="px-3 py-2">Delhi</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
                  Active
                </span>
              </td>
              <td className="px-3 py-2 text-right space-x-2">
                <button className="text-xs text-indigo-600 hover:underline">Edit</button>
                <button className="text-xs text-yellow-600 hover:underline">Reset PW</button>
                <button className="text-xs text-red-600 hover:underline">Deactivate</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 px-3 pb-3 text-[11px] text-gray-400">
          Replace static data with your API response and hook up the actions.
        </p>
      </div>
    </section>
  );
}
