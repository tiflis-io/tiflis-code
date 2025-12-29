// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useEffect, useCallback, memo } from 'react';
import { codeToHtml, type BundledLanguage } from 'shiki';
import { cn } from '@/lib/utils';
import { Code, Copy, Check } from 'lucide-react';

interface CodeHighlighterProps {
  code: string;
  language?: string;
}

const SUPPORTED_LANGUAGES: Set<string> = new Set([
  'javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx',
  'python', 'py', 'java', 'kotlin', 'swift', 'go', 'rust',
  'c', 'cpp', 'c++', 'csharp', 'c#', 'cs',
  'html', 'css', 'scss', 'sass', 'less',
  'json', 'yaml', 'yml', 'toml', 'xml',
  'bash', 'sh', 'shell', 'zsh', 'powershell', 'ps1',
  'sql', 'graphql', 'markdown', 'md',
  'dockerfile', 'ruby', 'php', 'perl', 'lua',
  'r', 'matlab', 'scala', 'groovy', 'haskell', 'elixir',
  'vue', 'svelte', 'astro',
]);

function normalizeLanguage(lang?: string): BundledLanguage | 'text' {
  if (!lang) return 'text';
  const normalized = lang.toLowerCase().trim();
  
  const aliases: Record<string, BundledLanguage> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'c++': 'cpp',
    'c#': 'csharp',
    'cs': 'csharp',
    'sh': 'bash',
    'shell': 'bash',
    'zsh': 'bash',
    'yml': 'yaml',
    'md': 'markdown',
    'ps1': 'powershell',
  };
  
  const resolved = aliases[normalized] || normalized;
  if (SUPPORTED_LANGUAGES.has(resolved)) {
    return resolved as BundledLanguage;
  }
  return 'text';
}

export const CodeHighlighter = memo(function CodeHighlighter({ 
  code, 
  language 
}: CodeHighlighterProps) {
  const [html, setHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const normalizedLang = normalizeLanguage(language);
  const displayLanguage = language || 'code';

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    async function highlight() {
      try {
        if (normalizedLang === 'text') {
          setHtml(`<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`);
        } else {
          const result = await codeToHtml(code, {
            lang: normalizedLang,
            themes: {
              light: 'github-light',
              dark: 'github-dark',
            },
          });
          if (!cancelled) {
            setHtml(result);
          }
        }
      } catch {
        if (!cancelled) {
          setHtml(`<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    highlight();
    return () => { cancelled = true; };
  }, [code, normalizedLang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="my-2 rounded-lg overflow-hidden border bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 border-b text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <Code className="w-3 h-3" aria-hidden="true" />
          <span>{displayLanguage}</span>
        </div>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 transition-colors',
            copied ? 'text-green-500' : 'hover:text-zinc-700 dark:hover:text-zinc-200'
          )}
          onClick={handleCopy}
          aria-label={copied ? 'Copied to clipboard' : 'Copy code'}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div 
        className={cn(
          'overflow-x-auto text-sm [&_.shiki]:!bg-transparent [&_.shiki]:p-3 [&_.shiki]:m-0',
          '[&_pre]:!bg-transparent [&_code]:!bg-transparent',
          isLoading && 'animate-pulse'
        )}
        dangerouslySetInnerHTML={{ __html: html || `<pre class="p-3"><code>${escapeHtml(code)}</code></pre>` }}
      />
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
