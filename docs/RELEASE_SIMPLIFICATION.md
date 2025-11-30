# Упрощение процесса релиза

## Текущий процесс (сложный)

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant CI as GitHub Actions
    participant Bot as Changesets Bot
    participant NPM as GitHub Packages
    participant Docker as GHCR

    Dev->>Git: 1. Создать changeset (pnpm changeset)
    Dev->>Git: 2. Закоммитить changeset
    Dev->>Git: 3. Push в main
    Git->>CI: 4. Запустить Release workflow
    CI->>Bot: 5. Проверить changesets
    Bot->>Git: 6. Создать PR "chore: version packages"
    Dev->>Git: 7. Открыть и проверить PR
    Dev->>Git: 8. Смержить PR
    Git->>CI: 9. Запустить Release workflow (снова)
    CI->>Bot: 10. Обновить версии
    CI->>NPM: 11. Опубликовать пакеты
    CI->>Docker: 12. Собрать и опубликовать Docker образы
    CI->>Git: 13. Создать GitHub Release
```

**Проблемы:**
- 13 шагов
- 2 запуска workflow
- Ручной мердж PR
- Долгое ожидание

---

## Вариант 1: Прямая публикация (рекомендуется)

**Идея:** Если есть changesets, сразу публиковать без создания PR.

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant CI as GitHub Actions
    participant NPM as GitHub Packages
    participant Docker as GHCR

    Dev->>Git: 1. Создать changeset
    Dev->>Git: 2. Закоммитить и push в main
    Git->>CI: 3. Запустить Release workflow
    CI->>CI: 4. Обновить версии (changeset version)
    CI->>CI: 5. Закоммитить версии в main
    CI->>NPM: 6. Опубликовать пакеты
    CI->>Docker: 7. Собрать и опубликовать Docker
    CI->>Git: 8. Создать GitHub Release
```

**Преимущества:**
- ✅ 8 шагов вместо 13
- ✅ 1 запуск workflow
- ✅ Нет ручного мерджа PR
- ✅ Быстрее в 2 раза

**Недостатки:**
- ⚠️ Версии обновляются автоматически (но это можно контролировать через changesets)

---

## Вариант 2: Manual version bump

**Идея:** Просто обновить версию в `package.json` вручную, workflow опубликует.

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Git as Git
    participant CI as GitHub Actions
    participant NPM as GitHub Packages
    participant Docker as GHCR

    Dev->>Git: 1. Обновить версию в package.json
    Note over Dev,Git: Например: 0.1.1 → 0.1.2
    Dev->>Git: 2. Закоммитить и push в main
    Git->>CI: 3. Запустить Release workflow
    CI->>CI: 4. Проверить изменение версии
    CI->>NPM: 5. Опубликовать пакеты
    CI->>Docker: 6. Собрать и опубликовать Docker
    CI->>Git: 7. Создать GitHub Release
```

**Преимущества:**
- ✅ 7 шагов
- ✅ Полный контроль версий
- ✅ Простота
- ✅ Нет зависимости от changesets

**Недостатки:**
- ⚠️ Нужно вручную обновлять версии
- ⚠️ Нет автоматического changelog

---

## Вариант 3: Workflow dispatch с версией

**Идея:** Запускать релиз вручную через GitHub UI, указывая версию.

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant UI as GitHub UI
    participant CI as GitHub Actions
    participant NPM as GitHub Packages
    participant Docker as GHCR

    Dev->>UI: 1. Открыть Actions → Release
    Dev->>UI: 2. Нажать "Run workflow"
    Dev->>UI: 3. Ввести версию (например: 0.1.2)
    UI->>CI: 4. Запустить Release workflow
    CI->>CI: 5. Обновить версию в package.json
    CI->>CI: 6. Закоммитить версию
    CI->>NPM: 7. Опубликовать пакеты
    CI->>Docker: 8. Собрать и опубликовать Docker
    CI->>Git: 9. Создать GitHub Release
```

**Преимущества:**
- ✅ Полный контроль
- ✅ Можно релизить в любое время
- ✅ Нет необходимости в changesets

**Недостатки:**
- ⚠️ Нужно помнить обновлять версию
- ⚠️ Нет автоматического changelog

---

## Рекомендация: Вариант 1 (Прямая публикация)

**Почему:**
- Сохраняет преимущества changesets (changelog, контроль версий)
- Убирает лишние шаги (PR, мердж)
- Автоматизирует процесс
- Быстрее и проще

**Что нужно изменить:**
- Убрать создание PR из changesets action
- Публиковать сразу после обновления версий
- Коммитить версии обратно в main

---

## Сравнение вариантов

| Критерий | Текущий | Вариант 1 | Вариант 2 | Вариант 3 |
|----------|---------|-----------|-----------|-----------|
| **Шагов** | 13 | 8 | 7 | 9 |
| **Ручной мердж PR** | ✅ Да | ❌ Нет | ❌ Нет | ❌ Нет |
| **Автоматический changelog** | ✅ Да | ✅ Да | ❌ Нет | ❌ Нет |
| **Контроль версий** | ✅ Да | ✅ Да | ⚠️ Ручной | ⚠️ Ручной |
| **Скорость** | 🐌 Медленно | ⚡ Быстро | ⚡ Быстро | ⚡ Быстро |
| **Простота** | 😰 Сложно | 😊 Просто | 😊 Просто | 😊 Просто |

