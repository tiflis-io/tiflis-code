// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

"use client";

import dynamic from "next/dynamic";

const Hero = dynamic(() => import("./hero"), { ssr: false });

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-end gap-6 px-6 py-4">
        <a
          href="/docs/install"
          className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white text-sm transition-colors"
        >
          Docs
        </a>
        <a
          href="https://github.com/tiflis-io/tiflis-code"
          className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          aria-label="GitHub"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </header>

      {/* Hero Section - Full Screen (client-only) */}
      <Hero />

      {/* Features Section */}
      <section className="w-full max-w-6xl mx-auto py-24 px-8">
        <h2 className="text-3xl font-bold text-center mb-16">Key Features</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Voice-First Control</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Dictate commands to AI agents using natural voice input.
              Speech-to-text transcription with text-to-speech responses.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Multi-Agent Support</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Run Cursor, Claude Code, OpenCode, and custom agents
              simultaneously. Switch between agents on the fly.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Self-Hosted & Secure</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Your code never leaves your machine. End-to-end encrypted tunnel
              connection. Full control over your data.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Mobile & Watch Apps</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Native iOS and watchOS apps. Control your agents from iPhone or
              Apple Watch anywhere in the world.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Full Terminal Access</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Complete PTY terminal in your pocket. Run any command on your
              workstation remotely with full shell support.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
            <div className="w-12 h-12 mb-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">LangGraph Supervisor</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Intelligent orchestrator managing sessions and workspaces. Powered
              by LangChain and LangGraph for smart task routing.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="w-full max-w-4xl mx-auto py-24 px-8">
        <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
        <div className="space-y-8">
          <div className="flex items-start gap-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
              1
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">
                Deploy Tunnel Server
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Deploy the tunnel server to any VPS. It acts as a secure relay
                between your mobile device and workstation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
              2
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">
                Install Workstation Agent
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Run the workstation server on your development machine. It
                connects to the tunnel and manages AI agent sessions.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
              3
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Connect Mobile App</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Scan the magic link QR code or enter connection details. Your
                iPhone and Apple Watch are now connected.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-6">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
              4
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Code from Anywhere</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Start agent sessions, dictate commands, and monitor progress.
                Your workstation does the heavy lifting while you stay mobile.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Author Section */}
      <section className="w-full max-w-4xl mx-auto py-24 px-8 border-t border-gray-200 dark:border-gray-800">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-8">Created by</h2>
          <div className="inline-flex flex-col items-center">
            <img
              src="/avatar.png"
              alt="Roman Barinov"
              className="w-24 h-24 rounded-full mb-4"
            />
            <h3 className="text-2xl font-semibold mb-2">Roman Barinov</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Entrepreneur, Architect and Software Developer
            </p>
            <div className="flex gap-4">
              <a
                href="https://github.com/rbarinov"
                className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
              <a
                href="mailto:rbarinov@gmail.com"
                className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-8 px-8 border-t border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            FSL-1.1-NC - Copyright (c) 2025 Roman Barinov
          </p>
          <div className="flex gap-6">
            <a
              href="https://github.com/tiflis-io/tiflis-code"
              className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white text-sm transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://github.com/tiflis-io/tiflis-code/issues"
              className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white text-sm transition-colors"
            >
              Issues
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
