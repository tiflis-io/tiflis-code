//
//  KeyboardTheme.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import UIKit

// MARK: - iOS Native Keyboard Metrics

/// Exact metrics of native iOS iPhone keyboard
/// Matches Apple Human Interface Guidelines
/// Minimum touch target: 44x44pt
struct KeyboardMetrics {

    // MARK: - Keyboard Dimensions

    /// Total keyboard height (without safe area) - iOS standard + bottom row (globe + mic)
    static let keyboardHeight: CGFloat = 268  // 216 + 42 (bottom row with padding) + 10 (spacing)

    /// Terminal toolbar height (additional panel)
    static let terminalToolbarHeight: CGFloat = 44

    // MARK: - Key sizes (Apple HIG compliant)

    /// Height of regular letter key - Apple HIG 44pt minimum touch target
    static let keyHeight: CGFloat = 44

    /// Key corner radius - matches native iOS keyboard
    static let keyCornerRadius: CGFloat = 5

    // MARK: - Paddings

    /// Horizontal key spacing - matches native iOS visual gap
    static let horizontalKeySpacing: CGFloat = 6

    /// Vertical row spacing
    static let verticalRowSpacing: CGFloat = 10

    /// Horizontal edge padding
    static let horizontalEdgePadding: CGFloat = 3

    /// Top padding
    static let topPadding: CGFloat = 6

    /// Bottom padding (to safe area) - increased for rounded screens
    static let bottomPadding: CGFloat = 8

    // MARK: - Shadows

    /// Key shadow offset Y
    static let keyShadowOffsetY: CGFloat = 1

    /// Shadow blur radius
    static let keyShadowRadius: CGFloat = 0

    /// Shadow opacity
    static let keyShadowOpacity: Float = 0.35
}

// MARK: - Keyboard Theme

/// Visual theme matching native iOS keyboard
struct KeyboardTheme {
    
    // MARK: - Background Colors
    
    /// Keyboard background color
    let keyboardBackgroundColor: UIColor
    
    // MARK: - Key Colors
    
    /// Alphabetic key background color (regular keys)
    let letterKeyBackgroundColor: UIColor
    
    /// Functional key background color (Shift, Backspace, 123, etc.)
    let functionKeyBackgroundColor: UIColor
    
    /// Pressed key background color
    let pressedKeyBackgroundColor: UIColor
    
    /// Key text color
    let keyTextColor: UIColor
    
    /// Secondary text color (symbols above numbers)
    let keySecondaryTextColor: UIColor
    
    // MARK: - Shadow Colors
    
    /// Key shadow color (creates depth effect)
    let keyShadowColor: UIColor
    
    // MARK: - Special States
    
    /// Active modifier color (Shift in pressed state)
    let modifierActiveBackgroundColor: UIColor
    
    /// Active modifier text color
    let modifierActiveTextColor: UIColor
    
    // MARK: - Terminal Toolbar Colors
    
    /// Terminal toolbar background color
    let toolbarBackgroundColor: UIColor
    
    /// Separator color between toolbar and keyboard
    let toolbarSeparatorColor: UIColor
    
    // MARK: - Presets
    
    /// Light theme - exact match to native iOS keyboard
    static let light = KeyboardTheme(
        keyboardBackgroundColor: UIColor(red: 0.820, green: 0.831, blue: 0.851, alpha: 1.0), // #D1D4D9
        letterKeyBackgroundColor: .white,
        functionKeyBackgroundColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0), // #ADB3BC
        pressedKeyBackgroundColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0), // #ADB3BC (as functional)
        keyTextColor: .black,
        keySecondaryTextColor: UIColor(red: 0.0, green: 0.0, blue: 0.0, alpha: 0.5),
        keyShadowColor: UIColor(red: 0.533, green: 0.545, blue: 0.569, alpha: 1.0), // #888B91
        modifierActiveBackgroundColor: .white,
        modifierActiveTextColor: .black,
        toolbarBackgroundColor: UIColor(red: 0.820, green: 0.831, blue: 0.851, alpha: 1.0), // Same as keyboard
        toolbarSeparatorColor: UIColor(red: 0.678, green: 0.702, blue: 0.737, alpha: 1.0)
    )
    
    /// Dark theme - exact match to native iOS keyboard
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
    
    /// Get theme based on current interface style
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

/// Keyboard languages
enum KeyboardLanguage: String, CaseIterable {
    case english = "en"
    case russian = "ru"
    case georgian = "ka"

    /// Language name for UI
    var displayName: String {
        switch self {
        case .english: return "English"
        case .russian: return "Russian"
        case .georgian: return "ქართული"
        }
    }

    /// Flag emoji for visual display
    var flag: String {
        switch self {
        case .english: return "🇺🇸"
        case .russian: return "🇷🇺"
        case .georgian: return "🇬🇪"
        }
    }

    /// Get list of available languages (intersection with system languages)
    /// English is always available by default
    static func availableLanguages() -> [KeyboardLanguage] {
        // Get system keyboard language identifiers
        let systemLanguages = UserDefaults.standard.object(forKey: "AppleKeyboards") as? [String] ?? []

        print("🌐 System keyboards raw: \(systemLanguages)")

        let systemLanguageCodes = systemLanguages.compactMap { keyboard -> String? in
            // Extract language code from keyboard identifier
            // Examples:
            //   "en_US@sw=QWERTY;hw=Automatic" -> "en"
            //   "ru_RU@sw=Russian;hw=Automatic" -> "ru"
            //   "ka@sw=Georgian-Phonetic;hw=Automatic" -> "ka" (no underscore!)
            //   "emoji@sw=Emoji" -> "emoji"

            // Split by @ first to get the language part
            let languagePart = keyboard.split(separator: "@").first.map(String.init) ?? keyboard

            // Then split by _ to get just the language code (if locale is present)
            let code = languagePart.split(separator: "_").first.map(String.init) ?? languagePart

            print("   Keyboard '\(keyboard)' -> code: '\(code)'")
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

    /// Next language in cycle (among available only)
    func next(availableLanguages: [KeyboardLanguage]) -> KeyboardLanguage {
        guard let currentIndex = availableLanguages.firstIndex(of: self) else {
            return .english
        }
        let nextIndex = (currentIndex + 1) % availableLanguages.count
        return availableLanguages[nextIndex]
    }

    /// Next language in cycle (legacy - uses all languages)
    var next: KeyboardLanguage {
        return next(availableLanguages: KeyboardLanguage.availableLanguages())
    }
}

// MARK: - Keyboard Layout

/// Keyboard layout types
enum KeyboardLayout {
    case letters      // Letter layout (QWERTY/ЙЦУКЕН/ჯერუპ)
    case numbers      // Numbers and basic symbols
    case symbols      // Additional symbols

    /// Button text to switch to this layout
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

/// Keyboard modifier state
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
    
    /// Quick check - no active modifiers
    var isEmpty: Bool {
        return !shift && !capsLock && !control && !alt
    }
    
    /// Should show capital letters
    var isUppercase: Bool {
        return shift || capsLock
    }
    
    /// Apply modifiers to character
    func apply(to character: Character) -> String {
        var result = String(character)

        // Case conversion
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
                    // Symbols above numbers when Shift
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
        
        // Control combinations
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
