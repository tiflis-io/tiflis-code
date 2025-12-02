# Terminal Custom Keyboard

## Overview

Кастомная клавиатура терминала, визуально **идентичная нативной iOS клавиатуре** с дополнительной панелью инструментов для терминальных команд.

## Features

### 🎯 Нативный iOS Look & Feel

- **Точные размеры**: Высота кнопок 42pt, радиус скругления 5pt
- **Точные цвета**: Идентичны нативной iOS клавиатуре в светлой и тёмной теме
- **Точные отступы**: 6pt между кнопками, 12pt между рядами, 3pt от краёв
- **Тени кнопок**: Создают эффект глубины как в нативной клавиатуре

### ⌨️ Terminal Toolbar

Дополнительная панель сверху с кнопками, необходимыми для работы в терминале:

- **Esc** — Escape (0x1B)
- **Tab** — Tab (0x09)
- **Ctrl** — Control модификатор
- **← ↓ ↑ →** — Стрелки навигации
- **⌄** — Закрытие клавиатуры

### 📐 Layouts

- **Letters** — QWERTY раскладка (идентична iOS)
- **Numbers** — Цифры и основные символы (идентична iOS)
- **Symbols** — Дополнительные символы (идентична iOS)

### 🎨 Theme Support

Автоматическая адаптация к системной теме:

- **Light Theme**: Белые кнопки, серый фон (#D1D4D9)
- **Dark Theme**: Тёмно-серые кнопки (#3A3A3C), почти чёрный фон (#0D0D0D)

## Architecture

```
Terminal/Keyboard/
├── TerminalCustomKeyboardView.swift  # Главный контейнер клавиатуры
├── KeyboardKey.swift                  # Компонент отдельной кнопки
├── KeyboardLayoutManager.swift        # Менеджер раскладок
├── KeyboardTheme.swift               # Темы и метрики
└── README.md
```

### Components

| Файл                         | Описание                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| `TerminalCustomKeyboardView` | UIView, содержащий тулбар + клавиатуру. Реализует `inputView` для терминала |
| `KeyboardKeyView`            | UIView для отдельной кнопки с тенью, анимацией нажатия и авто-повтором      |
| `KeyboardLayoutManager`      | Возвращает конфигурации кнопок для каждой раскладки                         |
| `KeyboardTheme`              | Цвета и метрики, точно соответствующие iOS                                  |
| `KeyboardMetrics`            | Размеры и отступы нативной iOS клавиатуры                                   |

## iOS Keyboard Metrics

Точные метрики нативной iOS клавиатуры (измерены на iPhone 14 Pro / iOS 17):

| Параметр              | Значение |
| --------------------- | -------- |
| Высота клавиатуры     | 216pt    |
| Высота тулбара        | 44pt     |
| Высота кнопки         | 42pt     |
| Радиус скругления     | 5pt      |
| Отступ между кнопками | 6pt      |
| Отступ между рядами   | 12pt     |
| Отступ от краёв       | 3pt      |

## Colors

### Light Theme

| Элемент               | Цвет    |
| --------------------- | ------- |
| Фон клавиатуры        | #D1D4D9 |
| Буквенные кнопки      | #FFFFFF |
| Функциональные кнопки | #ADB3BC |
| Тень кнопок           | #888B91 |

### Dark Theme

| Элемент               | Цвет    |
| --------------------- | ------- |
| Фон клавиатуры        | #0D0D0D |
| Буквенные кнопки      | #3A3A3C |
| Функциональные кнопки | #5A5A5C |
| Тень кнопок           | #000000 |

## Usage

### Integration

```swift
// В TerminalViewUIKit
let keyboard = TerminalCustomKeyboardView()
keyboard.delegate = self
terminalView.inputView = keyboard
terminalView.reloadInputViews()
```

### Delegate

```swift
protocol TerminalKeyboardDelegate: AnyObject {
    func keyboard(_ keyboard: TerminalCustomKeyboardView, didSendInput data: Data)
    func keyboardDidRequestDismiss(_ keyboard: TerminalCustomKeyboardView)
}
```

## Special Keys

| Кнопка    | Действие    | Байты |
| --------- | ----------- | ----- |
| Backspace | Control-H   | 0x08  |
| Delete    | DEL         | 0x7F  |
| Enter     | CR          | 0x0D  |
| Space     | Space       | 0x20  |
| Tab       | Tab         | 0x09  |
| Escape    | Escape      | 0x1B  |
| ↑         | Arrow Up    | ESC[A |
| ↓         | Arrow Down  | ESC[B |
| →         | Arrow Right | ESC[C |
| ←         | Arrow Left  | ESC[D |

## Long Press Actions

| Кнопка    | Действие                   |
| --------- | -------------------------- |
| Shift     | Включить Caps Lock         |
| Backspace | Delete word (Ctrl+W, 0x17) |
| Escape    | Interrupt (Ctrl+C, 0x03)   |

## License

Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>  
Licensed under the MIT License. See LICENSE file for details.
