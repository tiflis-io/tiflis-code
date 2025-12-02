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
/// Измерены на iPhone 14 Pro / iOS 17
struct KeyboardMetrics {
    
    // MARK: - Размеры клавиатуры
    
    /// Общая высота клавиатуры (без safe area)
    static let keyboardHeight: CGFloat = 216
    
    /// Высота тулбара терминала (дополнительная панель)
    static let terminalToolbarHeight: CGFloat = 44
    
    // MARK: - Размеры кнопок
    
    /// Высота обычной буквенной кнопки
    static let keyHeight: CGFloat = 42
    
    /// Радиус скругления углов кнопки
    static let keyCornerRadius: CGFloat = 5
    
    // MARK: - Отступы
    
    /// Горизонтальный отступ между кнопками
    static let horizontalKeySpacing: CGFloat = 6
    
    /// Вертикальный отступ между рядами кнопок
    static let verticalRowSpacing: CGFloat = 12
    
    /// Отступ от левого/правого края клавиатуры
    static let horizontalEdgePadding: CGFloat = 3
    
    /// Отступ сверху клавиатуры
    static let topPadding: CGFloat = 8
    
    /// Отступ снизу клавиатуры (до safe area)
    static let bottomPadding: CGFloat = 4
    
    // MARK: - Множители ширины кнопок
    
    /// Множитель ширины для кнопки Shift / Backspace
    static let shiftWidthMultiplier: CGFloat = 1.0
    
    /// Множитель ширины для пробела
    static let spaceWidthMultiplier: CGFloat = 5.0
    
    /// Множитель ширины для кнопок переключения раскладки (123, ABC)
    static let switchWidthMultiplier: CGFloat = 1.5
    
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
        modifierActiveBackgroundColor: .white,
        modifierActiveTextColor: .black,
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

// MARK: - Keyboard Layout

/// Типы раскладки клавиатуры
enum KeyboardLayout {
    case letters      // Буквенная раскладка (QWERTY)
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
