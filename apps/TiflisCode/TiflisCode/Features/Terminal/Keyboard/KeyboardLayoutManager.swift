//
//  KeyboardLayoutManager.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// Менеджер раскладок клавиатуры
/// Возвращает конфигурации кнопок для каждой раскладки в формате, идентичном нативной iOS клавиатуре
final class KeyboardLayoutManager {
    
    // MARK: - Layout Generation
    
    /// Получить ряды кнопок для указанной раскладки
    func getRows(for layout: KeyboardLayout, modifiers: ModifierState = ModifierState()) -> [[KeyConfiguration]] {
        switch layout {
        case .letters:
            return getLettersLayout()
        case .numbers:
            return getNumbersLayout()
        case .symbols:
            return getSymbolsLayout()
        }
    }
    
    // MARK: - Letters Layout (QWERTY)
    
    /// Буквенная QWERTY раскладка - точная копия нативной iOS
    private func getLettersLayout() -> [[KeyConfiguration]] {
        return [
            // Ряд 1: Q W E R T Y U I O P (10 кнопок)
            [
                .letter("q"), .letter("w"), .letter("e"), .letter("r"), .letter("t"),
                .letter("y"), .letter("u"), .letter("i"), .letter("o"), .letter("p")
            ],
            
            // Ряд 2: A S D F G H J K L (9 кнопок, центрированы с отступами)
            [
                .letter("a"), .letter("s"), .letter("d"), .letter("f"), .letter("g"),
                .letter("h"), .letter("j"), .letter("k"), .letter("l")
            ],
            
            // Ряд 3: Shift Z X C V B N M Backspace (7 букв + 2 функциональные)
            [
                KeyConfiguration(type: .modifier(.shift), width: .shift),
                .letter("z"), .letter("x"), .letter("c"), .letter("v"),
                .letter("b"), .letter("n"), .letter("m"),
                KeyConfiguration(type: .special(.backspace), width: .shift)
            ],
            
            // Ряд 4: 123 Space Return
            [
                KeyConfiguration(type: .layoutSwitch(.numbers), width: .layoutSwitch),
                KeyConfiguration(type: .special(.space), width: .space),
                KeyConfiguration(type: .special(.enter), width: .returnKey)
            ]
        ]
    }
    
    // MARK: - Numbers Layout
    
    /// Цифровая раскладка - точная копия нативной iOS
    private func getNumbersLayout() -> [[KeyConfiguration]] {
        return [
            // Ряд 1: 1 2 3 4 5 6 7 8 9 0
            [
                .symbol("1"), .symbol("2"), .symbol("3"), .symbol("4"), .symbol("5"),
                .symbol("6"), .symbol("7"), .symbol("8"), .symbol("9"), .symbol("0")
            ],
            
            // Ряд 2: - / : ; ( ) $ & @ "
            [
                .symbol("-"), .symbol("/"), .symbol(":"), .symbol(";"), .symbol("("),
                .symbol(")"), .symbol("$"), .symbol("&"), .symbol("@"), .symbol("\"")
            ],
            
            // Ряд 3: #+= . , ? ! ' Backspace
            [
                KeyConfiguration(type: .layoutSwitch(.symbols), width: .shift),
                .symbol("."), .symbol(","), .symbol("?"), .symbol("!"), .symbol("'"),
                KeyConfiguration(type: .special(.backspace), width: .shift)
            ],
            
            // Ряд 4: ABC Space Return
            [
                KeyConfiguration(type: .layoutSwitch(.letters), width: .layoutSwitch),
                KeyConfiguration(type: .special(.space), width: .space),
                KeyConfiguration(type: .special(.enter), width: .returnKey)
            ]
        ]
    }
    
    // MARK: - Symbols Layout
    
    /// Символьная раскладка - точная копия нативной iOS
    private func getSymbolsLayout() -> [[KeyConfiguration]] {
        return [
            // Ряд 1: [ ] { } # % ^ * + =
            [
                .symbol("["), .symbol("]"), .symbol("{"), .symbol("}"), .symbol("#"),
                .symbol("%"), .symbol("^"), .symbol("*"), .symbol("+"), .symbol("=")
            ],
            
            // Ряд 2: _ \ | ~ < > € £ ¥ •
            [
                .symbol("_"), .symbol("\\"), .symbol("|"), .symbol("~"), .symbol("<"),
                .symbol(">"), .symbol("€"), .symbol("£"), .symbol("¥"), .symbol("•")
            ],
            
            // Ряд 3: 123 . , ? ! ' Backspace
            [
                KeyConfiguration(type: .layoutSwitch(.numbers), width: .shift),
                .symbol("."), .symbol(","), .symbol("?"), .symbol("!"), .symbol("'"),
                KeyConfiguration(type: .special(.backspace), width: .shift)
            ],
            
            // Ряд 4: ABC Space Return
            [
                KeyConfiguration(type: .layoutSwitch(.letters), width: .layoutSwitch),
                KeyConfiguration(type: .special(.space), width: .space),
                KeyConfiguration(type: .special(.enter), width: .returnKey)
            ]
        ]
    }
}
