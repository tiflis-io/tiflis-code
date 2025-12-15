// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Installation - Tiflis Code",
  description:
    "Install Tiflis Code tunnel and workstation servers with one-liner scripts.",
};

function CodeBlock({
  children,
  title,
}: {
  children: string;
  title?: string;
}) {
  return (
    <div className="my-4">
      {title && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-mono">
          {title}
        </div>
      )}
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function InstallPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="font-semibold text-lg hover:text-blue-600 transition-colors"
          >
            Tiflis Code
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs/install"
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
            >
              Docs
            </Link>
            <a
              href="https://github.com/tiflis-io/tiflis-code"
              className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
            </a>
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold mb-4">Installation</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-12">
          Get started with Tiflis Code in minutes using our one-liner
          installation scripts.
        </p>

        {/* Prerequisites */}
        <Section title="Prerequisites">
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
            <li>
              <strong>Tunnel Server:</strong> Any Linux VPS or local machine
              with Docker, or Node.js 22+
            </li>
            <li>
              <strong>Workstation:</strong> macOS, Linux, or Windows (via WSL2)
              with Node.js 22+
            </li>
            <li>
              <strong>Mobile App:</strong> iOS 17+ (iPhone), watchOS 10+ (Apple Watch),
              or Android 8.0+ (Oreo)
            </li>
          </ul>
        </Section>

        {/* Tunnel Server */}
        <Section title="1. Tunnel Server">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The tunnel server acts as a secure relay between your mobile device
            and workstation. Deploy it on any VPS with a public IP.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">
            Docker Compose (Recommended)
          </h3>
          <CodeBlock>{`curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">Native Node.js</h3>
          <CodeBlock>{`curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --native`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">Options</h3>
          <CodeBlock title="Preview changes without installing">{`curl -fsSL https://code.tiflis.io/install-tunnel.sh | bash -s -- --dry-run`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">
            Environment Variables
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-semibold">
                    Variable
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold">Default</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_TUNNEL_VERSION
                  </td>
                  <td className="py-2 pr-4">latest</td>
                  <td className="py-2">Package version to install</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_INSTALL_DIR
                  </td>
                  <td className="py-2 pr-4">~/.tiflis-code</td>
                  <td className="py-2">Installation directory</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_TUNNEL_PORT
                  </td>
                  <td className="py-2 pr-4">3001</td>
                  <td className="py-2">Port for tunnel server</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_TUNNEL_MODE
                  </td>
                  <td className="py-2 pr-4">docker</td>
                  <td className="py-2">Installation mode (docker or native)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* Workstation */}
        <Section title="2. Workstation Server">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The workstation server runs on your development machine. It connects
            to the tunnel and manages AI agent sessions.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">Installation</h3>
          <CodeBlock>{`curl -fsSL https://code.tiflis.io/install-workstation.sh | bash`}</CodeBlock>

          <p className="text-gray-600 dark:text-gray-400 mt-4">
            The installer will prompt for:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 mt-2">
            <li>Tunnel URL (e.g., wss://tunnel.example.com/ws)</li>
            <li>Tunnel API key</li>
            <li>Workspaces root directory</li>
            <li>Optional: AI agents installation (Claude Code, Cursor, OpenCode)</li>
          </ul>

          <h3 className="text-lg font-semibold mt-6 mb-2">Non-Interactive</h3>
          <CodeBlock>{`TUNNEL_URL=wss://tunnel.example.com/ws \\
TUNNEL_API_KEY=your-api-key \\
curl -fsSL https://code.tiflis.io/install-workstation.sh | bash`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">
            Environment Variables
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-semibold">
                    Variable
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold">Default</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_WORKSTATION_VERSION
                  </td>
                  <td className="py-2 pr-4">latest</td>
                  <td className="py-2">Package version to install</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    TIFLIS_INSTALL_DIR
                  </td>
                  <td className="py-2 pr-4">~/.tiflis-code</td>
                  <td className="py-2">Installation directory</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TUNNEL_URL</td>
                  <td className="py-2 pr-4">(prompted)</td>
                  <td className="py-2">WebSocket URL of tunnel server</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TUNNEL_API_KEY</td>
                  <td className="py-2 pr-4">(prompted)</td>
                  <td className="py-2">API key for tunnel authentication</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">
                    WORKSTATION_AUTH_KEY
                  </td>
                  <td className="py-2 pr-4">(generated)</td>
                  <td className="py-2">Key for mobile app authentication</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">WORKSPACES_ROOT</td>
                  <td className="py-2 pr-4">~/work</td>
                  <td className="py-2">Directory containing your projects</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* Mobile App */}
        <Section title="3. Mobile App">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            After installing the workstation, you&apos;ll see a magic link and QR
            code. Use these to connect the iOS app.
          </p>

          <div className="flex flex-wrap gap-4 mt-6">
            <a href="#" className="hover:opacity-80 transition-opacity">
              <img
                src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
                alt="Download on the App Store"
                className="h-11"
              />
            </a>
            <a href="#" className="hover:opacity-80 transition-opacity">
              <img
                src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png"
                alt="Get it on Google Play"
                className="h-16 -my-2"
              />
            </a>
          </div>
        </Section>

        {/* AI & Speech Configuration */}
        <Section title="4. AI & Speech Configuration">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Configure AI providers for the Supervisor agent, speech-to-text (STT),
            and text-to-speech (TTS) in your workstation .env file.
          </p>

          <h3 className="text-lg font-semibold mt-6 mb-2">
            Supervisor Agent (LLM)
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The Supervisor agent orchestrates sessions using an LLM. Supports OpenAI,
            Anthropic, and Cerebras providers.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-semibold">Variable</th>
                  <th className="text-left py-2 pr-4 font-semibold">Default</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">AGENT_PROVIDER</td>
                  <td className="py-2 pr-4">openai</td>
                  <td className="py-2">LLM provider (openai, anthropic, cerebras)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">AGENT_API_KEY</td>
                  <td className="py-2 pr-4">(required)</td>
                  <td className="py-2">API key for the LLM provider</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">AGENT_MODEL_NAME</td>
                  <td className="py-2 pr-4">gpt-4o-mini</td>
                  <td className="py-2">Model name to use</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">AGENT_BASE_URL</td>
                  <td className="py-2 pr-4">(provider default)</td>
                  <td className="py-2">Custom API endpoint URL</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">AGENT_TEMPERATURE</td>
                  <td className="py-2 pr-4">0</td>
                  <td className="py-2">Model temperature (0-2)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="text-base font-semibold mt-4 mb-2">OpenAI Example</h4>
          <CodeBlock>{`AGENT_PROVIDER=openai
AGENT_API_KEY=sk-proj-...
AGENT_MODEL_NAME=gpt-4o`}</CodeBlock>

          <h4 className="text-base font-semibold mt-4 mb-2">Anthropic Example</h4>
          <CodeBlock>{`AGENT_PROVIDER=anthropic
AGENT_API_KEY=sk-ant-...
AGENT_MODEL_NAME=claude-3-5-sonnet-20241022`}</CodeBlock>

          <h4 className="text-base font-semibold mt-4 mb-2">Cerebras Example</h4>
          <CodeBlock>{`AGENT_PROVIDER=cerebras
AGENT_API_KEY=csk-...
AGENT_MODEL_NAME=llama3.1-70b`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-8 mb-2">
            Speech-to-Text (STT)
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Voice input transcription. Supports OpenAI Whisper, ElevenLabs, and Deepgram.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-semibold">Variable</th>
                  <th className="text-left py-2 pr-4 font-semibold">Default</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">STT_PROVIDER</td>
                  <td className="py-2 pr-4">openai</td>
                  <td className="py-2">STT provider (openai, elevenlabs, deepgram)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">STT_API_KEY</td>
                  <td className="py-2 pr-4">(required)</td>
                  <td className="py-2">API key for the STT provider</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">STT_MODEL</td>
                  <td className="py-2 pr-4">whisper-1</td>
                  <td className="py-2">Model name</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">STT_LANGUAGE</td>
                  <td className="py-2 pr-4">en</td>
                  <td className="py-2">Language code (en, ru, de, etc.)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">STT_BASE_URL</td>
                  <td className="py-2 pr-4">(provider default)</td>
                  <td className="py-2">Custom API endpoint</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="text-base font-semibold mt-4 mb-2">OpenAI Whisper Example</h4>
          <CodeBlock>{`STT_PROVIDER=openai
STT_API_KEY=sk-proj-...
STT_MODEL=whisper-1
STT_LANGUAGE=en`}</CodeBlock>

          <h4 className="text-base font-semibold mt-4 mb-2">Deepgram Example</h4>
          <CodeBlock>{`STT_PROVIDER=deepgram
STT_API_KEY=...
STT_MODEL=nova-2
STT_LANGUAGE=en`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-8 mb-2">
            Text-to-Speech (TTS)
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Voice output synthesis. Supports OpenAI and ElevenLabs.
          </p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800">
                  <th className="text-left py-2 pr-4 font-semibold">Variable</th>
                  <th className="text-left py-2 pr-4 font-semibold">Default</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TTS_PROVIDER</td>
                  <td className="py-2 pr-4">openai</td>
                  <td className="py-2">TTS provider (openai, elevenlabs)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TTS_API_KEY</td>
                  <td className="py-2 pr-4">(required)</td>
                  <td className="py-2">API key for the TTS provider</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TTS_MODEL</td>
                  <td className="py-2 pr-4">tts-1</td>
                  <td className="py-2">Model name</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TTS_VOICE</td>
                  <td className="py-2 pr-4">alloy</td>
                  <td className="py-2">Voice name</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-xs">TTS_BASE_URL</td>
                  <td className="py-2 pr-4">(provider default)</td>
                  <td className="py-2">Custom API endpoint</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="text-base font-semibold mt-4 mb-2">OpenAI TTS Example</h4>
          <CodeBlock>{`TTS_PROVIDER=openai
TTS_API_KEY=sk-proj-...
TTS_MODEL=tts-1
TTS_VOICE=nova`}</CodeBlock>
          <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
            Available voices: alloy, echo, fable, onyx, nova, shimmer
          </p>

          <h4 className="text-base font-semibold mt-4 mb-2">ElevenLabs Example</h4>
          <CodeBlock>{`TTS_PROVIDER=elevenlabs
TTS_API_KEY=...
TTS_MODEL=eleven_multilingual_v2
TTS_VOICE=Rachel`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-8 mb-2">
            Agent Aliases
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Define custom agent configurations using environment variables.
            Aliases appear alongside built-in agents (Claude, Cursor, OpenCode) in the app.
          </p>
          <CodeBlock title="Format">{`AGENT_ALIAS_<NAME>=<base_command> [args...]`}</CodeBlock>
          <p className="text-gray-600 dark:text-gray-400 mt-4 mb-2">
            Base commands: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">claude</code>,{" "}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">cursor-agent</code>,{" "}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">opencode</code>
          </p>

          <h4 className="text-base font-semibold mt-4 mb-2">Examples</h4>
          <CodeBlock>{`# Claude with custom settings file
AGENT_ALIAS_ZAI=claude --settings /Users/yourname/.zai/settings.json

# Claude with specific model
AGENT_ALIAS_CLAUDE_OPUS=claude --model opus

# Cursor with experimental features
AGENT_ALIAS_CURSOR_PRO=cursor-agent --experimental-features`}</CodeBlock>
          <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
            Note: Use absolute paths for file arguments. Relative paths will not be expanded.
          </p>

          <h3 className="text-lg font-semibold mt-8 mb-2">
            Complete Example
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            A full .env configuration with all services:
          </p>
          <CodeBlock>{`# Connection
TUNNEL_URL=wss://tunnel.example.com/ws
TUNNEL_API_KEY=your-32-character-api-key-here!!!
WORKSTATION_AUTH_KEY=your-workstation-auth-key

# Workspaces
WORKSPACES_ROOT=/Users/yourname/work

# Supervisor Agent (OpenAI)
AGENT_PROVIDER=openai
AGENT_API_KEY=sk-proj-...
AGENT_MODEL_NAME=gpt-4o

# Speech-to-Text (OpenAI Whisper)
STT_PROVIDER=openai
STT_API_KEY=sk-proj-...
STT_MODEL=whisper-1
STT_LANGUAGE=en

# Text-to-Speech (OpenAI)
TTS_PROVIDER=openai
TTS_API_KEY=sk-proj-...
TTS_MODEL=tts-1
TTS_VOICE=nova

# Custom Agent Aliases
AGENT_ALIAS_ZAI=claude --settings /Users/yourname/.zai/settings.json`}</CodeBlock>
        </Section>

        {/* Service Management */}
        <Section title="Service Management">
          <h3 className="text-lg font-semibold mt-6 mb-2">macOS (launchd)</h3>
          <CodeBlock title="View status">{`launchctl list | grep tiflis`}</CodeBlock>
          <CodeBlock title="View logs">{`tail -f ~/.tiflis-code/workstation/logs/output.log`}</CodeBlock>
          <CodeBlock title="Stop service">{`launchctl unload ~/Library/LaunchAgents/io.tiflis.workstation.plist`}</CodeBlock>
          <CodeBlock title="Start service">{`launchctl load ~/Library/LaunchAgents/io.tiflis.workstation.plist`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">Linux (systemd)</h3>
          <CodeBlock title="View status">{`systemctl --user status tiflis-workstation`}</CodeBlock>
          <CodeBlock title="View logs">{`journalctl --user -u tiflis-workstation -f`}</CodeBlock>
          <CodeBlock title="Stop service">{`systemctl --user stop tiflis-workstation`}</CodeBlock>
          <CodeBlock title="Start service">{`systemctl --user start tiflis-workstation`}</CodeBlock>
        </Section>

        {/* Uninstall */}
        <Section title="Uninstall">
          <h3 className="text-lg font-semibold mt-2 mb-2">macOS</h3>
          <CodeBlock>{`# Stop and remove workstation
launchctl unload ~/Library/LaunchAgents/io.tiflis.workstation.plist
rm ~/Library/LaunchAgents/io.tiflis.workstation.plist

# Stop and remove tunnel (if installed locally)
launchctl unload ~/Library/LaunchAgents/io.tiflis.tunnel.plist
rm ~/Library/LaunchAgents/io.tiflis.tunnel.plist

# Remove installation directory
rm -rf ~/.tiflis-code`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">Linux</h3>
          <CodeBlock>{`# Stop and disable workstation
systemctl --user stop tiflis-workstation
systemctl --user disable tiflis-workstation
rm ~/.config/systemd/user/tiflis-workstation.service

# Stop and disable tunnel (if installed locally)
systemctl --user stop tiflis-tunnel
systemctl --user disable tiflis-tunnel
rm ~/.config/systemd/user/tiflis-tunnel.service

# Remove installation directory
rm -rf ~/.tiflis-code`}</CodeBlock>
        </Section>

        {/* Troubleshooting */}
        <Section title="Troubleshooting">
          <h3 className="text-lg font-semibold mt-2 mb-2">
            Node.js not found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Install Node.js 22+ using nvm:
          </p>
          <CodeBlock>{`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc  # or ~/.zshrc
nvm install 22`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">
            Connection refused
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Ensure the tunnel server is running and accessible:
          </p>
          <CodeBlock>{`curl -s https://your-tunnel-server/health`}</CodeBlock>

          <h3 className="text-lg font-semibold mt-6 mb-2">Permission denied</h3>
          <p className="text-gray-600 dark:text-gray-400">
            The scripts don&apos;t require root access. If you encounter permission
            issues, check that your user owns ~/.tiflis-code directory.
          </p>
        </Section>

        {/* Next Steps */}
        <Section title="Next Steps">
          <ul className="list-disc list-inside space-y-2 text-gray-600 dark:text-gray-400">
            <li>Explore agent aliases for custom AI agent configurations</li>
          </ul>
        </Section>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
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
