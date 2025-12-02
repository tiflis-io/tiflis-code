//
//  KeyboardTheme.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import UIKit

// MARK: - iOS Native Keyboard Metrics

/// Точные метрики нативной iOS клавиатуры iPhone
/// Соответствуют Apple Human Interface Guidelines
/// Minimum touch target: 44x44pt
struct KeyboardMetrics {

    // MARK: - Размеры клавиатуры

    /// Общая высота клавиатуры (без safe area) - iOS standard + bottom row (globe + mic)
    static let keyboardHeight: CGFloat = 268  // 216 + 42 (bottom row with padding) + 10 (spacing)

    /// Высота тулбара терминала (дополнительная панель)
    static let terminalToolbarHeight: CGFloat = 44

    // MARK: - Размеры кнопок (Apple HIG compliant)

    /// Высота обычной буквенной кнопки - Apple HIG 44pt minimum touch target
    static let keyHeight: CGFloat = 44

    /// Радиус скругления углов кнопки - matches native iOS keyboard
    static let keyCornerRadius: CGFloat = 5

    // MARK: - Отступы

    /// Горизонтальный отступ между кнопками - matches native iOS visual gap
    static let horizontalKeySpacing: CGFloat = 6

    /// Вертикальный отступ между рядами кнопок
    static let verticalRowSpacing: CGFloat = 10

    /// Отступ от левого/правого края клавиатуры
    static let horizontalEdgePadding: CGFloat = 3

    /// Отступ сверху клавиатуры
    static let topPadding: CGFloat = 6

    /// Отступ снизу клавиатуры (до safe area) - increased for rounded screens
    static let bottomPadding: CGFloat = 8

    // MARK: - Тени

    /// Смещение тени кнопки по Y
    static let keyShadowOffsetY: CGFloat = 1

    /// Радиус размытия тени
    static let keyShadowRadius: CGFloat = 0

    /// Прозрачность тени
    static let keyShadowOpacity: Float = 0.35
}

// MARK: - Keyboard Theme

/// Визуальная тема клавиатуры, соответствующая нативной iOS клавиатуре
struct KeyboardTheme {
    
    // MARK: - Background Colors
    
    /// Цвет фона всей клавиатуры
    let keyboardBackgroundColor: UIColor
    
    // MARK: - Key Colors
    
    /// Цвет фона буквенных кнопок (обычные кнопки)
    let letterKeyBackgroundColor: UIColor
    
    /// Цвет фона функциональных кнопок (Shift, Backspace, 123, etc.)
    let functionKeyBackgroundColor: UIColor
    
    /// Цвет фона нажатой кнопки
    let pressedKeyBackgroundColor: UIColor
    
    /// Цвет текста на кнопках
    let keyTextColor: UIColor
    
    /// Цвет вторичного текста (символы над цифрами)
    let keySecondaryTextColor: UIColor
    
    // MARK: - Shadow Colors
    
    /// Цвет тени кнопки (создает эффект глубины)
    let keyShadowColor: UIColor
    
    // MARK: - Special States
    
    /// Цвет активного модификатора (Shift в нажатом состоянии)
    let modifierActiveBackgroundColor: UIColor
    
    /// Цвет текста активного модификатора
    let modifierActiveTextColor: UIColor
    
    // MARK: - Terminal Toolbar Colors
    
    /// Цвет фона тулбара терминала
    let toolbarBackgroundColor: UIColor
    
    /// Цвет разделителя между тулбаром и клавиатурой
    let toolbarSeparatorColor: UIColor
    
    // MARK: - Presets
    
    /// Светлая тема - точное соответствие нативной iOS клавиатуре
    static let light = KeyboardTheme(
        keyboardBackgroundColor: UIColor(red: 0.820, green: 0.831, blue: 0.851, alpha: 1.0), // #D1D4D9
        letterKeyBackgroundColor: .white,
        functionKeyBackgroundColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0), // #ADB3BC
        pressedKeyBackgroundColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0), // #ADB3BC (как функциональные)
        keyTextColor: .black,
        keySecondaryTextColor: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.5),
        keyShadowColor: UIColor(red: 0.533, green: 0.545, blue: 0.569, alpha: 1.0), // #888B91
        modifierActiveBackgroundColor: .white,
        modifierActiveTextColor: .black,
        toolbarBackgroundColor: UIColor(red: 0.820, green: 0.831, blue: 0.851, alpha: 1.0), // Тот же что и клавиатура
        toolbarSeparatorColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0)
    )
    
    /// Тёмная тема - точное соответствие нативной iOS клавиатуре
    static let dark = KeyboardTheme(
        keyboardBackgroundColor: UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1.0), // #0D0D0D
        letterKeyBackgroundColor: UIColor(red: 0.227, green: 0.227, blue: 0.235, alpha: 1.0), // #3A3A3C
        functionKeyBackgroundColor: UIColor(red: 0.353, green: 0.353, blue: 0.361, alpha: 1.0), // #5A5A5C
        pressedKeyBackgroundColor: UIColor(red: 0.353, green: 0.353, blue: 0.361, alpha: 1.0), // #5A5A5C
        keyTextColor: .white,
        keySecondaryTextColor: UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.5),
        keyShadowColor: .black,
        modifierActiveBackgroundColor: UIColor(red: 0.478, green: 0.478, blue: 0.502, alpha: 1.0), // #7A7A80 - lighter gray for dark mode
        modifierActiveTextColor: .white,
        toolbarBackgroundColor: UIColor(red: 0.051, green: 0.051, blue: 0.051, alpha: 1.0),
        toolbarSeparatorColor: UIColor(red: 0.227, green: 0.227, blue: 0.235, alpha: 1.0)
    )
    
    /// Получить тему в зависимости от текущего стиля интерфейса
    static func theme(for userInterfaceStyle: UIUserInterfaceStyle) -> KeyboardTheme {
        switch userInterfaceStyle {
        case .dark:
            return .dark
        default:
            return .light
        }
    }
}

// MARK: - Keyboard Language

/// Языки клавиатуры
enum KeyboardLanguage: String, CaseIterable {
    case english = "en"
    case russian = "ru"
    case georgian = "ka"

    /// Название языка для UI
    var displayName: String {
        switch self {
        case .english: return "English"
        case .russian: return "Русский"
        case .georgian: return "ქართული"
        }
    }

    /// Эмодзи флаг для визуального отображения
    var flag: String {
        switch self {
        case .english: return "🇺🇸"
        case .russian: return "🇷🇺"
        case .georgian: return "🇬🇪"
        }
    }

    /// Получить список доступных языков (пересечение с системными языками)
    /// English всегда доступен по умолчанию
    static func availableLanguages() -> [KeyboardLanguage] {
        // Get system keyboard language identifiers
        let systemLanguages = UserDefaults.standard.object(forKey: "AppleKeyboards") as? [String] ?? []

        print("🌐 System keyboards raw: \(systemLanguages)")

        let systemLanguageCodes = systemLanguages.compactMap { keyboard -> String? in
            // Extract language code from keyboard identifier (e.g., "en_US@sw=QWERTY" -> "en")
            let components = keyboard.split(separator: "_")
            let code = components.first.map(String.init)
            print("   Keyboard '\(keyboard)' -> code: '\(code ?? "nil")'")
            return code
        }

        print("🌐 Extracted language codes: \(systemLanguageCodes)")
        print("🌐 App supported languages: \(KeyboardLanguage.allCases.map { "\($0.displayName) (\($0.rawValue))" })")

        // Filter app languages to only those in system languages
        var available = KeyboardLanguage.allCases.filter { language in
            let match = systemLanguageCodes.contains(language.rawValue)
            print("   Checking \(language.displayName) (\(language.rawValue)): \(match ? "✅ MATCH" : "❌ no match")")
            return match
        }

        print("🌐 Matched languages: \(available.map { $0.displayName })")

        // English must always be available (fallback)
        if !available.contains(.english) {
            print("🌐 English not found in system, adding as fallback")
            available.insert(.english, at: 0)
        }

        print("🌐 Final available languages: \(available.map { $0.displayName })")
        return available.isEmpty ? [.english] : available
    }

    /// Следующий язык в цикле (только среди доступных)
    func next(availableLanguages: [KeyboardLanguage]) -> KeyboardLanguage {
        guard let currentIndex = availableLanguages.firstIndex(of: self) else {
            return .english
        }
        let nextIndex = (currentIndex + 1) % availableLanguages.count
        return availableLanguages[nextIndex]
    }

    /// Следующий язык в цикле (legacy - использует все языки)
    var next: KeyboardLanguage {
        return next(availableLanguages: KeyboardLanguage.availableLanguages())
    }
}

// MARK: - Keyboard Layout

/// Типы раскладки клавиатуры
enum KeyboardLayout {
    case letters      // Буквенная раскладка (QWERTY/ЙЦУКЕН/ჯერუპ)
    case numbers      // Цифры и основные символы
    case symbols      // Дополнительные символы

    /// Текст для кнопки переключения на эту раскладку
    var switchButtonTitle: String {
        switch self {
        case .letters: return "ABC"
        case .numbers: return "123"
        case .symbols: return "#+="
        }
    }

    /// SF Symbol name for layout switch button
    var sfSymbolName: String? {
        switch self {
        case .letters: return nil  // Use text instead
        case .numbers: return nil  // Use text instead
        default: return nil
        }
    }
}

// MARK: - Modifier State

/// Состояние модификаторов клавиатуры
struct ModifierState {
    var shift: Bool
    var capsLock: Bool
    var control: Bool
    var alt: Bool
    
    init(shift: Bool = false, capsLock: Bool = false, control: Bool = false, alt: Bool = false) {
        self.shift = shift
        self.capsLock = capsLock
        self.control = control
        self.alt = alt
    }
    
    /// Быстрая проверка - нет активных модификаторов
    var isEmpty: Bool {
        return !shift && !capsLock && !control && !alt
    }
    
    /// Нужно ли показывать заглавные буквы
    var isUppercase: Bool {
        return shift || capsLock
    }
    
    /// Применить модификаторы к символу
    func apply(to character: Character) -> String {
        var result = String(character)

        // Преобразование регистра
        if isUppercase {
            // Georgian letters - iOS keyboard shift mapping
            switch character {
            // Row 1: ქ წ ე რ ტ ყ უ ი ო პ
            case "ქ": result = "ქ"  // ქ → ქ (no change)
            case "წ": result = "ჭ"  // წ → ჭ
            case "ე": result = "ე"  // ე → ე (no change)
            case "რ": result = "ღ"  // რ → ღ
            case "ტ": result = "თ"  // ტ → თ
            case "ყ": result = "ყ"  // ყ → ყ (no change)
            case "უ": result = "უ"  // უ → უ (no change)
            case "ი": result = "ი"  // ი → ი (no change)
            case "ო": result = "ო"  // ო → ო (no change)
            case "პ": result = "პ"  // პ → პ (no change)

            // Row 2: ა ს დ ფ გ ჰ ჯ კ ლ
            case "ა": result = "ა"  // ა → ა (no change)
            case "ს": result = "შ"  // ს → შ
            case "დ": result = "დ"  // დ → დ (no change)
            case "ფ": result = "ფ"  // ფ → ფ (no change)
            case "გ": result = "გ"  // გ → გ (no change)
            case "ჰ": result = "ჰ"  // ჰ → ჰ (no change)
            case "ჯ": result = "ჟ"  // ჯ → ჟ
            case "კ": result = "კ"  // კ → კ (no change)
            case "ლ": result = "ლ"  // ლ → ლ (no change)

            // Row 3: ზ ხ ც ვ ბ ნ მ
            case "ზ": result = "ძ"  // ზ → ძ
            case "ხ": result = "ხ"  // ხ → ხ (no change)
            case "ც": result = "ჩ"  // ც → ჩ
            case "ვ": result = "ვ"  // ვ → ვ (no change)
            case "ბ": result = "ბ"  // ბ → ბ (no change)
            case "ნ": result = "ნ"  // ნ → ნ (no change)
            case "მ": result = "მ"  // მ → მ (no change)

            // Non-Georgian letters - use standard uppercase
            default:
                if character.isLetter {
                    result = character.uppercased()
                } else {
                    // Символы над цифрами при Shift
                    switch character {
                    case "1": result = "!"
                    case "2": result = "@"
                    case "3": result = "#"
                    case "4": result = "$"
                    case "5": result = "%"
                    case "6": result = "^"
                    case "7": result = "&"
                    case "8": result = "*"
                    case "9": result = "("
                    case "0": result = ")"
                    case "-": result = "_"
                    case "=": result = "+"
                    case "[": result = "{"
                    case "]": result = "}"
                    case "\\": result = "|"
                    case ";": result = ":"
                    case "'": result = "\""
                    case ",": result = "<"
                    case ".": result = ">"
                    case "/": result = "?"
                    case "`": result = "~"
                    default: break
                    }
                }
            }
        } else if character.isLetter {
            result = character.lowercased()
        }
        
        // Control комбинации
        if control, let asciiValue = character.uppercased().first?.asciiValue {
            // Ctrl+A = 0x01, Ctrl+B = 0x02, etc.
            if asciiValue >= 65 && asciiValue <= 90 { // A-Z
                let controlValue = asciiValue - 64
                let unicodeScalar = UnicodeScalar(controlValue)
                return String(Character(unicodeScalar))
            }
        }
        
        return result
    }
}

// MARK: - Character Extension

extension Character {
    var asciiValue: UInt8? {
        guard let scalar = unicodeScalars.first, scalar.value <= 127 else { return nil }
        return UInt8(scalar.value)
    }
}
