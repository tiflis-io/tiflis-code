// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">Page not found</p>
      <Link
        href="/"
        className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:opacity-90 transition-opacity"
      >
        Go Home
      </Link>
    </main>
  );
}
