# Autonomous Development Architecture

> **Vision**: Управление целыми отделами AI-ассистентов с мобильного телефона или Apple Watch или web через голосовые команды.

---

## Executive Summary

Данный документ описывает архитектуру системы автономной разработки, которая позволяет:

- Запускать параллельные направления разработки голосом с телефона/часов/web
- Интегрироваться с внешними системами управления задачами (Jira, GitHub Issues, GitLab и любыми другими - через MCP)
- Работать автономно часами без участия человека

---

## Содержание

1. [Обзор архитектуры](#1-обзор-архитектуры)
2. [Компоненты системы](#2-компоненты-системы)
3. [Backlog Agent — интеллектуальный Project Manager](#3-backlog-agent--интеллектуальный-project-manager)
4. [Harness — автономный исполнитель](#4-harness--автономный-исполнитель)
5. [Интеграция с внешними системами (MCP)](#5-интеграция-с-внешними-системами-mcp)
6. [Параллельная разработка и масштабирование](#6-параллельная-разработка-и-масштабирование)
7. [Варианты реализации](#7-варианты-реализации)
8. [Пользовательские сценарии](#8-пользовательские-сценарии)
9. [Технические решения](#9-технические-решения)
10. [Риски и митигации](#10-риски-и-митигации)
11. [Roadmap реализации](#11-roadmap-реализации)

---

## 1. Обзор архитектуры

### 1.1 Высокоуровневая схема

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ПОЛЬЗОВАТЕЛЬ                                    │
│                    (iPhone / Apple Watch / Android/ Web)                │
│                                                                         │
│  "Возьми из Jira спринт 42 и запусти разработку на feature-auth"        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Голос / Текст
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPERVISOR AGENT                                 │
│                                                                          │
│  Точка входа. Маршрутизирует команды к нужным сессиям.                 │
│  Показывает общий статус всех направлений.                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│    BACKLOG AGENT #1   │ │    BACKLOG AGENT #2   │ │    BACKLOG AGENT #3   │
│                       │ │                       │ │                       │
│  Direction: auth      │ │  Direction: terminal  │ │  Direction: android   │
│  Source: Jira Sprint  │ │  Source: GitHub Issue │ │  Source: Manual       │
│                       │ │                       │ │                       │
│  ┌─────────────────┐  │ │  ┌─────────────────┐  │ │  ┌─────────────────┐  │
│  │  MCP tools      │  │ │  │  MCP tools      │  │ │  │  MCP tools      │  │
│  │  (dynamic)      │  │ │  │  (dynamic)      │  │ │  │  (dynamic)      │  │
│  └─────────────────┘  │ │  └─────────────────┘  │ │  └─────────────────┘  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│     HARNESS #1        │ │     HARNESS #2        │ │     HARNESS #3        │
│                       │ │                       │ │                       │
│  Agent: claude/alias  │ │  Agent: cursor/alias  │ │  Agent: opencode/alias │
│  Tasks: 12            │ │  Tasks: 8             │ │  Tasks: 20            │
│  Progress: 7/12       │ │  Progress: 5/8        │ │  Progress: 2/20       │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
            │                       │                       │
            ▼                       ▼                       ▼
      Coding Agent            Coding Agent            Coding Agent
      (работает)              (работает)              (работает)
```

### 1.2 Ключевые принципы

1. **Voice-First** — все операции доступны через голосовые команды
2. **Autonomous Execution** — система работает без постоянного контроля
3. **External Integration** — задачи импортируются из внешних систем через MCP
4. **LLM-Driven Synchronization** — Backlog Agent самостоятельно решает, как синхронизировать результаты
5. **Parallel Scaling** — несколько направлений работают одновременно
6. **Progress Visibility** — статус доступен в реальном времени в чате с каждым Backlog Agent

---

## 2. Компоненты системы

### 2.1 Supervisor Agent (существующий)

**Роль:** Главный диспетчер, точка входа для всех команд.

**Ответственность:**
- Маршрутизация команд к нужным Backlog Agent сессиям
- Создание новых направлений разработки
- Агрегированный статус всех активных направлений
- Управление worktree и сессиями

**Не делает:**
- Не планирует задачи
- Не пишет код
- Не управляет Harness напрямую

---

### 2.2 Backlog Agent (новый)

**Роль:** Интеллектуальный Project Manager для конкретного направления с поддержкой любых внешних систем через MCP.

**Ответственность:**
- Общение с пользователем о требованиях
- Импорт задач из внешних систем (через динамически доступные MCP tools)
- Декомпозиция и приоритизация задач
- Управление Harness (start/stop/pause)
- Мониторинг выполнения и troubleshooting
- **Самостоятельное решение о синхронизации результатов** с внешними системами (через MCP tools)

**Подробнее:** См. [раздел 3](#3-backlog-agent--интеллектуальный-project-manager)

---

### 2.3 Harness (новый)

**Роль:** Автономный исполнитель задач (не LLM, просто код).

**Ответственность:**
- Итерация по задачам из backlog.json
- Запуск Coding Agent сессий
- Обновление статусов задач
- **Отправка результатов в чат с Backlog Agent** для дальнейшей обработки

**Подробнее:** См. [раздел 4](#4-harness--автономный-исполнитель)

---

### 2.4 Coding Agent (существующий)

**Роль:** Исполнитель одной конкретной задачи.

**Ответственность:**
- Реализация кода по заданным acceptance criteria
- Тестирование
- Коммит изменений
- Обновление progress.txt

---

## 3. Backlog Agent — интеллектуальный Project Manager

### 3.1 Концепция

Backlog Agent — это **AI Project Manager**, с которым пользователь общается голосом. Он понимает контекст проекта, умеет работать с любыми внешними системами через MCP, и управляет автономным выполнением.

### 3.2 Источники задач (динамические через MCP)

Backlog Agent может получать задачи из **любых систем**, для которых доступны MCP tools:

```
┌──────────────────────────────────────────────────────┐
│                  BACKLOG AGENT                       │
│                                                      │
│  Может получать задачи из любых источников,         │
│  в зависимости от доступных MCP tools:              │
│                                                      │
│  ✓ Jira (если есть MCP Jira server)                  │
│  ✓ GitHub Issues (если есть MCP GitHub server)      │
│  ✓ GitLab (если есть MCP GitLab server)              │
│  ✓ Linear (если есть MCP Linear server)              │
│  ✓ Notion (если есть MCP Notion server)              │
│  ✓ Любая другая система с MCP сервером              │
│                                                      │
│  Пользователь указывает, какие MCP tools доступны   │
│  (через конфигурацию workstation)                    │
└──────────────────────────────────────────────────────┘
```

### 3.3 Динамическая MCP конфигурация

Вместо хардкода, MCP серверы настраиваются гибко через конфиг:

```typescript
// workstation/config/mcp-servers.json
{
  "servers": [
    {
      "id": "jira-company",
      "name": "Jira Company",
      "command": "mcp-server-jira",
      "env": {
        "JIRA_URL": "https://company.atlassian.net",
        "JIRA_EMAIL": "user@company.com",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}"  // из .env
      },
      "enabled": true
    },
    {
      "id": "github-org",
      "name": "GitHub Organization",
      "command": "mcp-server-github",
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true
    },
    {
      "id": "gitlab-internal",
      "name": "GitLab Internal",
      "command": "mcp-server-gitlab",
      "env": {
        "GITLAB_URL": "https://gitlab.company.com",
        "GITLAB_TOKEN": "${GITLAB_TOKEN}"
      },
      "enabled": false  // отключен по умолчанию
    }
  ]
}
```

Workstation при старте сессии Backlog Agent:
1. Загружает конфиг
2. Инициализирует только **enabled** MCP серверы
3. Передаёт доступные tools в промпт Backlog Agent

**Результат:** Backlog Agent автоматически получает доступ ко всем доступным MCP tools и может использовать их для:
- Импорта задач
- Поиска информации
- Синхронизации результатов

### 3.4 Tools Backlog Agent

**Управление бэклогом (встроено):**
- `create_backlog` — создать новый бэклог
- `add_tasks` — добавить задачи
- `update_task` — изменить задачу
- `remove_task` — удалить задачу
- `reorder_tasks` — изменить порядок

**Управление Harness (встроено):**
- `start_harness` — запустить автономное выполнение
- `stop_harness` — остановить
- `pause_harness` — приостановить
- `resume_harness` — возобновить

**Мониторинг (встроено):**
- `get_backlog_status` — текущий статус
- `get_task_details` — детали задачи
- `get_task_error` — информация об ошибке

**MCP tools (динамические, зависит от конфигурации):**
- Все tools, предоставляемые включёнными MCP серверами
- Примеры: `jira_search`, `github_list_issues`, `gitlab_update_status` и т.д.

### 3.5 Системный промпт

```
You are an AI Project Manager for software development.

## Your Role
- Communicate with users about project requirements via chat
- Import and organize tasks from available external systems (via MCP tools)
- Decompose features into atomic, implementable tasks
- Manage autonomous code execution via Harness
- Monitor progress and troubleshoot failures
- Independently decide how to synchronize results with external systems

## Integration Capabilities
You have access to MCP tools for various systems. The specific tools available
depend on workstation configuration. You can:
- Import issues and tasks from available systems
- Query existing issues
- Update status and add comments
- Search for information

Check available tools at the start of conversation.

## Workflow for External Import

When user says "take sprint 42 from Jira":
1. Use available MCP tools to fetch sprint 42 data
2. Review returned issues
3. Decompose each issue into atomic tasks with acceptance criteria
4. Confirm task list with user
5. Create backlog.json
6. Ask if user wants to start execution

## Task Decomposition Rules
- Each task: 1-2 hours of work for a coding agent
- Clear acceptance criteria (testable)
- Ordered by dependencies
- Include reference to original external issue ID if applicable

## Synchronization with External Systems

When tasks are completed by Harness:
1. You receive task completion notifications in chat
2. Review the results (code, tests, commits)
3. Use available MCP tools to update external systems
   - Update issue status (e.g., mark as Done)
   - Add comments with completion details (commit hash, results)
   - Close issues if applicable
4. Inform user about sync status

Example: Task "AUTH-123" completed
- Call jira_transition(issue_id='AUTH-123', status='Done')
- Call jira_add_comment(issue_id='AUTH-123', text='Completed by AI agent. Commit: a1b2c3d')

## Communication Style
- Concise, action-oriented
- Confirm understanding before proceeding
- Report progress proactively in chat
- Escalate blockers immediately via chat messages
- All notifications and updates happen in this chat, not via push notifications
```

### 3.6 Пример диалога

```
Пользователь (с часов, в чате):
  "Возьми спринт 42 из Jira и запусти на feature-auth"

Backlog Agent:
  "Ищу спринт 42 в Jira..."
  [Использует доступные MCP tools: jira_search]

  "Нашёл 5 задач в спринте 42:

  1. AUTH-123: Implement OAuth2 login (8 story points)
  2. AUTH-124: Add JWT refresh tokens (5 story points)
  3. AUTH-125: Password reset flow (5 story points)
  4. AUTH-126: Two-factor authentication (8 story points)
  5. AUTH-127: Session management (3 story points)

  Декомпозирую на атомарные задачи...

  Получилось 23 задачи. Крупные:
  - OAuth2 login → 6 задач
  - JWT refresh → 4 задачи
  - Password reset → 4 задачи
  - 2FA → 6 задач
  - Sessions → 3 задачи

  Запустить выполнение? Какой агент использовать?"

Пользователь: "Claude, запускай"

Backlog Agent:
  [Создаёт backlog.json с 23 задачами]
  [Вызывает start_harness(agent='claude')]

  "✓ Запустил. Начинаю с AUTH-123, задача 1/6:
   'Настроить OAuth провайдеров в конфиге'.

   Оповещу здесь же, когда будут новости."

--- [Через несколько часов] ---

Harness → Backlog Agent (в чат):
  "Task 1 completed: AUTH-123.1
   Commit: a1b2c3d
   Time: 22 minutes"

Backlog Agent:
  "✓ Отлично! Первая задача готова.

   Обновляю статус в Jira..."
  [Использует MCP tools: jira_transition, jira_add_comment]

  "✓ Статус в Jira обновлён: AUTH-123 → Done

   Продолжаю со следующей задачи..."

--- [Процесс продолжается автономно] ---

Harness → Backlog Agent:
  "Task 18 failed: AUTH-123.5
   Error: Missing dependency 'otplib'"

Backlog Agent:
  "⚠️ Задача упала.

   Ошибка: отсутствует библиотека otplib.

   Варианты:
   1. Добавлю зависимость и перезапущу
   2. Пропущу задачу и продолжу с остальными
   3. Остановлю для ручного вмешательства

   Что выбираешь?"

Пользователь: "Добавь и перезапусти"

Backlog Agent:
  "✓ Готово. Добавляю otplib в prerequisites, задача вернулась в очередь."
```

---

## 4. Harness — автономный исполнитель

### 4.1 Принцип работы

Harness — это **простой код** (не LLM), который итерирует по задачам:

```
while (есть pending задачи) {
    task = взять_следующую_задачу()

    if (зависимости_не_готовы(task)) {
        пропустить()
        continue
    }

    result = запустить_coding_agent(task)

    if (result.success) {
        task.status = 'completed'
        task.commit_hash = result.hash
        notify_backlog_agent(task)  // Отправить в чат
    } else {
        task.status = 'failed'
        task.error = result.error
        notify_backlog_agent(task)  // Отправить в чат
    }

    save_backlog()
}
```

### 4.2 Структура backlog.json

```json
{
  "id": "auth-sprint-42",
  "project": "tiflis-code",
  "worktree": "feature-auth",
  "agent": "claude",
  "source": {
    "type": "external",
    "system": "jira",
    "sprint_id": 42,
    "project_key": "AUTH"
  },
  "created_at": "2025-01-15T10:00:00Z",
  "tasks": [
    {
      "id": 1,
      "external_id": "AUTH-123",
      "external_url": "https://company.atlassian.net/browse/AUTH-123",
      "title": "Configure OAuth providers",
      "description": "Set up OAuth2 configuration for Google and GitHub",
      "acceptance_criteria": [
        "OAuth config file exists at src/config/oauth.ts",
        "Google provider configured with client ID placeholder",
        "GitHub provider configured with client ID placeholder",
        "Environment variables documented in .env.example"
      ],
      "dependencies": [],
      "priority": "high",
      "complexity": "simple",
      "status": "completed",
      "started_at": "2025-01-15T10:05:00Z",
      "completed_at": "2025-01-15T10:32:00Z",
      "commit_hash": "a1b2c3d"
    },
    {
      "id": 2,
      "external_id": "AUTH-123",
      "title": "Implement Google OAuth callback",
      "description": "Handle OAuth callback from Google",
      "acceptance_criteria": [
        "GET /auth/google/callback endpoint exists",
        "Exchanges code for tokens",
        "Creates or updates user record",
        "Sets session cookie",
        "Redirects to dashboard"
      ],
      "dependencies": [1],
      "priority": "high",
      "complexity": "moderate",
      "status": "in_progress",
      "started_at": "2025-01-15T10:35:00Z"
    }
  ]
}
```

### 4.3 Коммуникация между Harness и Backlog Agent

Harness отправляет результаты **в чат с Backlog Agent** (как системные сообщения):

```typescript
// Harness сообщает о событиях в чат
interface HarnessNotification {
  type: 'task-started' | 'task-completed' | 'task-failed' | 'direction-completed';
  taskId: number;
  taskTitle: string;
  externalId?: string;
  timestamp: string;

  // Для completed/failed
  commitHash?: string;
  error?: string;
  duration?: number;
}

// Пример в чате:
// Harness: "Task completed: AUTH-123.1 | Commit: a1b2c3d | Time: 22m"
// Harness: "Task failed: AUTH-123.5 | Error: Missing otplib"
// Harness: "Direction completed: 23/23 tasks | Ready to merge"
```

Backlog Agent:
- Получает сообщение в чат
- **Самостоятельно решает**, нужна ли синхронизация с внешней системой
- Использует доступные MCP tools для обновления статусов
- Информирует пользователя о действиях в том же чате

**Пример диалога:**

```
Harness → Backlog Agent (в чат):
  "Task completed: AUTH-123.1 - Configure OAuth providers
   Commit: a1b2c3d
   Time: 22 minutes"

Backlog Agent (LLM анализирует):
  "Вижу, что задача завершена. Синхронизирую статус в Jira...
   [Использует jira_transition('AUTH-123', 'Done')]
   [Использует jira_add_comment('AUTH-123', 'Completed by AI agent...')]

   ✓ Статус обновлён в Jira.
   Переходим к следующей задаче."

Пользователь (видит всё в чате):
  [Видит обновления и может вмешаться в любой момент]
```

### 4.4 События и статус

**Нет push-notifications.** Все обновления приходят в чат с Backlog Agent:

```
Harness отправляет в чат:
  ✓ Task started: "Implement Google OAuth callback"
  ✓ Task completed: "Configure OAuth providers" (22 minutes)
  ✗ Task failed: "Implement 2FA" - Missing otplib

Backlog Agent отправляет в чат:
  [Анализирует результат]
  ✓ Updated Jira: AUTH-123 → Done
  [Может задать вопрос пользователю]

Пользователь видит всё в одном чате и может:
  - Задать вопрос Backlog Agent
  - Попросить остановить Harness
  - Попросить перезапустить задачу
  - Проверить детали
```

---

## 5. Интеграция с внешними системами (MCP)

### 5.1 MCP — архитектура

**MCP (Model Context Protocol)** позволяет подключить **любую внешнюю систему** без изменения кода Backlog Agent.

```
┌─────────────────────────────────────────────────────┐
│           Workstation Configuration                 │
│                                                     │
│  mcp-servers.json:                                  │
│  ├── jira-server (enabled)                          │
│  ├── github-server (enabled)                        │
│  ├── gitlab-server (disabled)                       │
│  └── custom-api-server (enabled)                    │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│          Workstation Runtime                        │
│                                                     │
│  Инициализирует только enabled MCP servers         │
│  Собирает все доступные tools                      │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│         Backlog Agent Session                       │
│                                                     │
│  Получает список доступных tools:                   │
│  ✓ jira_search                                      │
│  ✓ jira_get_issue                                   │
│  ✓ jira_transition                                  │
│  ✓ github_list_issues                               │
│  ✓ github_add_comment                               │
│  ✓ custom_api_query                                 │
│                                                     │
│  Может использовать любые из них в промпте        │
└─────────────────────────────────────────────────────┘
```

### 5.2 Типичные MCP серверы

**Примеры (не требуется хардкодировать):**

- **Jira MCP** — поиск issues, получение спринтов, обновление статусов
- **GitHub MCP** — список issues/PRs, создание issues, комментарии
- **GitLab MCP** — аналогично GitHub
- **Linear MCP** — управление задачами в Linear
- **Notion MCP** — запрос к базам данных Notion
- **Custom MCP** — любой пользовательский сервер

Каждый MCP сервер определяет свой набор tools, которые автоматически становятся доступны Backlog Agent.

### 5.3 Сценарии использования

**Сценарий 1: Импорт из Jira**
```
Пользователь: "Возьми спринт 42 из Jira"
→ Backlog Agent использует jira_get_sprint(sprint_id=42)
→ Декомпозиция на атомарные задачи
→ backlog.json создан
→ Harness начинает выполнение
→ Backlog Agent использует jira_transition для обновления статусов
```

**Сценарий 2: Импорт из GitHub Issues**
```
Пользователь: "Возьми issues с лейблом 'ready-for-dev'"
→ github_list_issues(labels=['ready-for-dev'])
→ Декомпозиция
→ github_add_comment для обновления статуса
```

**Сценарий 3: Ручной ввод**
```
Пользователь: "Вот список задач" [описывает задачи в чате]
→ Backlog Agent создаёт задачи вручную
→ Harness выполняет
→ Нет синхронизации с внешней системой (если не требуется)
```

### 5.4 Гибкость и расширяемость

**Новый MCP сервер добавляется просто:**

1. Установить MCP сервер на workstation
2. Добавить в `mcp-servers.json`
3. Перезагрузить сессию
4. Backlog Agent автоматически получит доступ к новым tools

**Пример: добавить Asana**
```json
{
  "id": "asana",
  "name": "Asana",
  "command": "mcp-server-asana",
  "env": {
    "ASANA_API_TOKEN": "${ASANA_TOKEN}"
  },
  "enabled": true
}
```

После этого Backlog Agent может использовать:
- `asana_get_project`
- `asana_list_tasks`
- `asana_update_task`
- и все остальные tools, предоставляемые MCP сервером

---

## 6. Параллельная разработка и масштабирование

### 6.1 Концепция направлений

**Направление (Direction)** = Worktree + Backlog + Harness

```
Project: tiflis-code
│
├── Direction: "auth"
│   ├── Worktree: feature-auth
│   ├── Backlog Agent Session
│   ├── Source: Jira Sprint 42
│   ├── Agent: claude
│   └── Status: 7/23 tasks
│
├── Direction: "terminal"
│   ├── Worktree: feature-terminal-v2
│   ├── Backlog Agent Session
│   ├── Source: GitHub Issues
│   ├── Agent: cursor
│   └── Status: 5/12 tasks
│
└── Direction: "android"
    ├── Worktree: feature-android
    ├── Backlog Agent Session
    ├── Source: Manual input
    ├── Agent: opencode
    └── Status: 15/30 tasks
```

### 6.2 Harness Manager

Компонент для управления несколькими Harness'ами:

```typescript
class HarnessManager {
  private harnesses: Map<string, BacklogHarness> = new Map();

  // Запустить новый Harness
  async start(direction: Direction): Promise<void>;

  // Остановить
  stop(directionId: string): void;

  // Статус всех
  getAllStatus(): DirectionStatus[];

  // Балансировка агентов
  suggestAgent(): AgentType;

  // Агрегированная статистика
  getOverallProgress(): {
    directions: number;
    totalTasks: number;
    completed: number;
    inProgress: number;
    failed: number;
  };
}
```

---

## 7. Варианты реализации

### 7.1 Вариант A: Минимальный (MVP)

**Scope:**
- Backlog Agent как новый тип сессии
- Harness с базовым циклом
- Только ручной ввод задач (без MCP импорта)
- Один Harness за раз
- Все обновления в чате (без push-notifications)

**Преимущества:**
- Быстрая реализация (1-2 недели)
- Проверка концепции

**Недостатки:**
- Нет интеграции с внешними системами
- Нет параллельности

**Компоненты:**
1. BacklogAgentSession (новый тип агента)
2. BacklogHarness (простой цикл)
3. Supervisor tools (start_backlog_session)
4. Chat UI для отображения прогресса

---

### 7.2 Вариант B: С MCP интеграцией

**Scope:**
- Всё из варианта A
- Поддержка динамической MCP конфигурации
- Импорт задач из доступных внешних систем
- LLM-driven синхронизация статусов обратно

**Преимущества:**
- Реальная интеграция с рабочим процессом
- Гибкая конфигурация (работает с любыми MCP)
- Backlog Agent самостоятельно решает, что обновлять

**Недостатки:**
- Сложнее настройка (API ключи, permissions)
- Зависимость от внешних API

**Дополнительные компоненты:**
1. Dynamic MCP loader
2. MCP configuration in workstation
3. Import tools (используются из доступных MCP)
4. Chat-based sync (Backlog Agent сам решает)

---

### 7.3 Вариант C: Полная параллельность

**Scope:**
- Всё из вариантов A и B
- HarnessManager для нескольких направлений
- Агрегированный статус в Supervisor

**Преимущества:**
- Максимальная утилизация ресурсов
- Масштабирование на большие проекты

**Недостатки:**
- Сложность управления
- Потенциальные конфликты при мерже

**Дополнительные компоненты:**
1. HarnessManager
2. Direction management
3. Merge conflict resolution

---

### 7.4 Вариант D: Enterprise (полный)

**Scope:**
- Всё из вариантов A, B, C
- Голосовые отчёты о прогрессе (TTS)
- Автоматический merge при готовности

**Преимущества:**
- Полностью автономная работа
- Профессиональный workflow

**Компоненты:**
1. TTS отчёты о прогрессе

---

### 7.5 Сравнение вариантов

| Вариант | Scope | Время | Сложность | Ценность |
|---------|-------|-------|-----------|----------|
| **A (MVP)** | Ручной ввод, один Harness | 1-2 нед | Низкая | Проверка концепции |
| **B (MCP)** | + Динамический импорт | 3-4 нед | Средняя | Реальная интеграция |
| **C (Параллель)** | + Несколько направлений | 5-6 нед | Высокая | Масштабирование |
| **D (Enterprise)** | + TTS, автомерж | 8-10 нед | Очень высокая | Полная автономность |

---

## 8. Пользовательские сценарии

### 8.1 Сценарий: Утренний запуск с часов

```
[07:00, Apple Watch]

Пользователь: "Доброе утро. Что в работе?"

Supervisor (голосом):
  "Доброе утро! Три направления активны:
   - Auth: 18 из 23 задач готово
   - Terminal: завершено ночью, готово к мержу
   - Android: 20 из 30, работает

   Terminal ждёт твоего подтверждения на мерж."

Пользователь: "Мержи terminal в main"

Supervisor:
  [Выполняет merge workflow]
  "Готово. Terminal влит в main.
   Осталось 2 активных направления."

Пользователь: "Добавь новое направление — спринт 43 из Jira"

Supervisor:
  "Создаю Backlog Agent для спринта 43.
   Какой worktree использовать?"

Пользователь: "feature-api-v2"

Supervisor:
  [Создаёт worktree, открывает Backlog Agent]

Backlog Agent (в чате):
  [Импортирует спринт 43 через Jira MCP]
  "✓ Спринт 43: 8 issues, декомпозировал в 35 задач.
   Запустить на claude или cursor?"

Пользователь: "Claude"

Backlog Agent:
  "✓ Запустил. Три направления теперь работают параллельно.
   Буду обновлять статус здесь же в чате.
   Хорошего дня!"
```

### 8.2 Сценарий: Проверка статуса в течение дня

```
[14:30, iPhone, в чате с Supervisor]

Пользователь: "Статус всех направлений"

Supervisor:
  "Три направления:

   1. Auth (claude): 21/23 задач, ~1 час до завершения
   2. Android (opencode): 25/30 задач, ~2 часа
   3. API v2 (claude): 12/35 задач, ~4 часа

   Проблем нет, всё идёт по плану."
```

### 8.3 Сценарий: Обработка ошибки

```
[16:45, в чате с Backlog Agent (auth)]

Harness → чат:
  "Task failed: 19 - Implement 2FA TOTP verification
   Error: Missing authenticator library"

Backlog Agent:
  "⚠️ Задача упала.

   Ошибка: Агент не нашёл библиотеку для TOTP.
   Нужно добавить зависимость otplib.

   Варианты:
   1. Добавлю зависимость в package.json и перезапущу задачу
   2. Пропущу эту задачу, продолжу с остальными
   3. Остановлю направление для ручного вмешательства

   Что выбираешь?"

Пользователь: "Добавь зависимость и перезапусти"

Backlog Agent:
  "✓ Готово. Добавляю otplib в prerequisites.
   Задача вернулась в очередь и будет выполнена после текущей."
```

### 8.4 Сценарий: Завершение направления

```
[20:00, в чате с Backlog Agent (auth)]

Harness → чат:
  "Direction completed: 23/23 tasks
   Total time: 12 hours
   Commits: 47
   Lines added: 2340"

Backlog Agent:
  "✅ Направление Auth завершено!

   - 23 задачи выполнены
   - 47 коммитов
   - 2,340 строк кода добавлено
   - Все тесты проходят

   Обновляю статусы в Jira...
   [Использует jira_transition для всех issues]

   ✓ Jira updated:
   - AUTH-123: Done ✓
   - AUTH-124: Done ✓
   - AUTH-125: Done ✓
   - AUTH-126: Done ✓
   - AUTH-127: Done ✓

   Готов к мержу в main. Мержить?"

Пользователь: "Да"

Backlog Agent:
  "✓ Запускаю merge...
   [Выполняет merge workflow]
   ✓ Auth влит в main.
   [Удаляет worktree, закрывает сессию]

   Направление закрыто.
   Осталось 2 активных направления."
```

---

## 9. Технические решения

### 9.1 Хранение состояния

**Файловая система (в worktree):**
```
feature-auth/
├── backlog.json      # Список задач и статусы
├── progress.txt      # Человекочитаемый лог
├── .harness/
│   ├── config.json   # Конфигурация Harness
│   ├── history.json  # История выполнения
│   └── errors/       # Логи ошибок по задачам
└── src/              # Код проекта
```

**SQLite (в workstation):**
```sql
-- Активные направления
CREATE TABLE directions (
  id TEXT PRIMARY KEY,
  workspace TEXT,
  project TEXT,
  worktree TEXT,
  agent TEXT,
  status TEXT,  -- 'running', 'paused', 'completed', 'failed'
  created_at INTEGER,
  updated_at INTEGER
);

-- История задач
CREATE TABLE task_history (
  id INTEGER PRIMARY KEY,
  direction_id TEXT,
  task_id INTEGER,
  status TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  commit_hash TEXT
);
```

### 9.2 Коммуникация между компонентами

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket (SESSION)                          │
│                                                                  │
│  Harness ──emit──▶ 'task-completed' ──▶ Backlog Agent Session   │
│                                     ──▶ UI (via broadcast)       │
└─────────────────────────────────────────────────────────────────┘

Backlog Agent (LLM):
  [Получает сообщение в чат]
  → Анализирует результат
  → Решает, нужна ли синхронизация
  → Использует MCP tools для обновления внешней системы
  → Информирует пользователя в чате
```

### 9.3 Graceful shutdown

```typescript
async function shutdownGracefully(): Promise<void> {
  // 1. Остановить приём новых задач
  for (const harness of harnessManager.getAll()) {
    harness.stopAcceptingTasks();
  }

  // 2. Дождаться завершения текущих задач (с таймаутом)
  await Promise.race([
    waitForAllTasksComplete(),
    timeout(5 * 60 * 1000)  // 5 минут максимум
  ]);

  // 3. Сохранить состояние
  for (const harness of harnessManager.getAll()) {
    await harness.saveState();
  }

  // 4. Закрыть соединения
  await cleanup();
}
```

### 9.4 Recovery после падения

```typescript
async function recoverFromCrash(): Promise<void> {
  // 1. Найти все directions с status='running'
  const interrupted = await db.getInterruptedDirections();

  for (const direction of interrupted) {
    // 2. Проверить состояние worktree
    const worktreeOk = await checkWorktreeIntegrity(direction.worktree);

    if (!worktreeOk) {
      // Восстановить из git
      await recoverWorktree(direction);
    }

    // 3. Найти последнюю завершённую задачу
    const lastCompleted = await getLastCompletedTask(direction);

    // 4. Сбросить in_progress задачи на pending
    await resetInProgressTasks(direction);

    // 5. Предложить пользователю продолжить
    notifyUser(`Direction ${direction.name} was interrupted. Resume?`);
  }
}
```

---

## 10. Риски и митигации

### 10.1 Риск: LLM галлюцинации / некорректный код

**Проблема:** Coding Agent может написать неработающий код.

**Митигации:**
- Обязательные acceptance criteria с тестами
- Проверка компиляции/lint перед коммитом
- E2E тесты где возможно
- Ограничение на количество retry (2-3)
- Эскалация человеку при repeated failures

### 10.2 Риск: Конфликты при мерже

**Проблема:** Параллельные направления могут конфликтовать.

**Митигации:**
- Разные worktrees = изолированные ветки
- Регулярный rebase на main (между задачами)
- Мерж только после ревью или авто-проверок
- Уведомление о потенциальных конфликтах

### 10.3 Риск: Исчерпание API лимитов

**Проблема:** Слишком много параллельных запросов.

**Митигации:**
- Throttling на уровне Harness
- Балансировка между агентами
- Очереди с приоритетами
- Мониторинг usage в реальном времени

### 10.4 Риск: Потеря прогресса при сбое

**Проблема:** Crash = потеря состояния.

**Митигации:**
- Всё состояние в файлах (git + backlog.json)
- Атомарные операции (задача либо выполнена, либо нет)
- Recovery процедура при старте
- Регулярные коммиты

### 10.5 Риск: Security (API ключи, доступы)

**Проблема:** MCP серверы имеют доступ к внешним системам.

**Митигации:**
- Минимальные permissions для API ключей
- Ключи только в environment variables
- Audit log всех MCP операций в чате
- Возможность отзыва ключей
- MCP серверы включаются явно (disabled по умолчанию)

---

## 11. Roadmap реализации

### Phase 1: Foundation (2 недели)

**Week 1:**
- [ ] BacklogAgentSession — новый тип сессии
- [ ] Базовые tools (create_backlog, add_tasks, get_status)
- [ ] backlog.json schema и валидация

**Week 2:**
- [ ] BacklogHarness — базовый цикл
- [ ] Интеграция с HeadlessAgentExecutor
- [ ] Chat-based progress broadcasting (все обновления в чат)

**Результат:** Можно создать бэклог вручную и запустить автономное выполнение.

---

### Phase 2: MCP Integration (2 недели)

**Week 3:**
- [ ] Dynamic MCP loader в workstation
- [ ] mcp-servers.json конфигурация
- [ ] Инициализация доступных MCP tools в Backlog Agent

**Week 4:**
- [ ] Тестирование с реальными MCP серверами (Jira, GitHub)
- [ ] LLM-driven синхронизация (Backlog Agent решает сам)
- [ ] Chat-based уведомления об обновлениях

**Результат:** Можно импортировать задачи из любых систем через MCP.

---

### Phase 3: Parallel Execution (2 недели)

**Week 5:**
- [ ] HarnessManager для нескольких направлений
- [ ] Балансировка LLM ресурсов
- [ ] Агрегированный статус в Supervisor

**Week 6:**
- [ ] UI для отображения нескольких направлений
- [ ] Merge workflow для завершённых направлений
- [ ] Recovery после сбоев

**Результат:** Несколько направлений работают параллельно.

---

### Phase 4: Polish & Enterprise (2 недели)

**Week 7:**
- [ ] Голосовые отчёты о прогрессе (TTS)
- [ ] watchOS UI для статуса направлений
- [ ] Автоматический retry failed tasks

**Week 8:**
- [ ] Analytics и метрики
- [ ] Документация
- [ ] Production hardening

**Результат:** Production-ready система автономной разработки.

---

## Заключение

Данная архитектура позволяет превратить мобильный телефон или Apple Watch в пульт управления целой командой AI-разработчиков. Ключевые преимущества:

1. **Voice-First** — управление голосом из любой точки
2. **Integration** — гибкая интеграция с любыми системами через MCP
3. **Autonomy** — работает часами без участия человека
4. **LLM-Driven** — Backlog Agent самостоятельно решает, как синхронизировать
5. **Scale** — параллельные направления утилизируют все LLM подписки
6. **Visibility** — статус доступен в чате с каждым Backlog Agent

Рекомендуемый путь реализации: начать с Phase 1 (MVP), валидировать концепцию, затем добавлять MCP интеграции и параллельность по мере необходимости.
