//
//  KeyboardKey.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import UIKit

// MARK: - Key Type

/// Тип кнопки клавиатуры
enum KeyType: Equatable {
    /// Буквенная/символьная кнопка
    case character(String)
    
    /// Специальная кнопка (Backspace, Enter, Space, etc.)
    case special(SpecialKeyType)
    
    /// Модификатор (Shift, Ctrl, Alt)
    case modifier(ModifierKeyType)
    
    /// Переключатель раскладки
    case layoutSwitch(KeyboardLayout)
    
    /// Получить отображаемый текст
    var displayText: String {
        switch self {
        case .character(let char):
            return char
        case .special(let type):
            return type.displayText
        case .modifier(let type):
            return type.displayText
        case .layoutSwitch(let layout):
            return layout.switchButtonTitle
        }
    }
    
    /// Это функциональная кнопка (не буква)?
    var isFunctional: Bool {
        switch self {
        case .character:
            return false
        case .special, .modifier, .layoutSwitch:
            return true
        }
    }
}

/// Типы специальных клавиш
enum SpecialKeyType: Equatable {
    case backspace
    case enter
    case space
    case tab
    case escape
    case delete
    case arrowUp
    case arrowDown
    case arrowLeft
    case arrowRight
    case home
    case end
    case pageUp
    case pageDown
    case dismiss
    case languageSwitch
    case slash
    case tilde

    var displayText: String {
        switch self {
        case .backspace: return ""  // Uses SF Symbol
        case .enter: return ""  // Uses SF Symbol
        case .space: return ""  // Uses SF Symbol
        case .tab: return ""  // Uses SF Symbol
        case .escape: return "esc"
        case .delete: return "⌦"
        case .arrowUp: return ""  // Uses SF Symbol
        case .arrowDown: return ""  // Uses SF Symbol
        case .arrowLeft: return ""  // Uses SF Symbol
        case .arrowRight: return ""  // Uses SF Symbol
        case .home: return "Home"
        case .end: return "End"
        case .pageUp: return "PgUp"
        case .pageDown: return "PgDn"
        case .dismiss: return ""  // Uses SF Symbol
        case .languageSwitch: return ""  // Uses SF Symbol
        case .slash: return "/"
        case .tilde: return "~"
        }
    }

    /// SF Symbol name for keys that use symbols
    var sfSymbolName: String? {
        switch self {
        case .backspace: return "delete.backward"
        case .enter: return "return.left"
        case .space: return "space"
        case .tab: return "arrow.right.to.line.compact"
        case .arrowUp: return "arrow.up"
        case .arrowDown: return "arrow.down"
        case .arrowLeft: return "arrow.left"
        case .arrowRight: return "arrow.right"
        case .dismiss: return "keyboard.chevron.compact.down"
        case .languageSwitch: return "globe"
        default: return nil
        }
    }
    
    /// Байтовая последовательность для терминала
    func byteSequence(modifiers: ModifierState = ModifierState()) -> [UInt8] {
        switch self {
        case .backspace: return [0x08]
        case .enter: return [0x0D]
        case .space: return [0x20]
        case .tab: return [0x09]
        case .escape: return [0x1B]
        case .delete: return [0x7F]
        case .arrowUp: return [0x1B, 0x5B, 0x41]
        case .arrowDown: return [0x1B, 0x5B, 0x42]
        case .arrowRight: return [0x1B, 0x5B, 0x43]
        case .arrowLeft: return [0x1B, 0x5B, 0x44]
        case .home: return [0x1B, 0x5B, 0x48]
        case .end: return [0x1B, 0x5B, 0x46]
        case .pageUp: return [0x1B, 0x5B, 0x35, 0x7E]
        case .pageDown: return [0x1B, 0x5B, 0x36, 0x7E]
        case .dismiss: return []
        case .languageSwitch: return []
        case .slash: return [0x2F]  // ASCII /
        case .tilde: return [0x7E]  // ASCII ~
        }
    }

    /// Поддерживает авто-повтор
    var supportsAutoRepeat: Bool {
        switch self {
        case .backspace, .delete, .arrowUp, .arrowDown, .arrowLeft, .arrowRight, .space:
            return true
        default:
            return false
        }
    }
}

/// Типы модификаторов
enum ModifierKeyType: Equatable {
    case shift
    case capsLock
    case control
    case alt

    var displayText: String {
        switch self {
        case .shift: return ""  // Uses SF Symbol
        case .capsLock: return "⇪"
        case .control: return ""  // Uses SF Symbol
        case .alt: return "⌥"
        }
    }

    /// Иконка для активного состояния
    var activeDisplayText: String {
        switch self {
        case .shift: return ""  // Uses SF Symbol (shift.fill)
        case .capsLock: return "⇪"
        case .control: return ""  // Uses SF Symbol
        case .alt: return "⌥"
        }
    }

    /// SF Symbol name for modifier keys
    var sfSymbolName: String? {
        switch self {
        case .shift: return "shift"
        case .control: return "control"
        default: return nil
        }
    }

    /// SF Symbol name for active state
    var activeSfSymbolName: String? {
        switch self {
        case .shift: return "shift.fill"
        case .control: return "control"
        default: return nil
        }
    }
}

// MARK: - Key Width

/// Ширина кнопки относительно стандартной буквенной кнопки
enum KeyWidth {
    /// Стандартная ширина буквенной кнопки (рассчитывается динамически)
    case standard
    
    /// Кнопка Shift/Backspace (в 1.0 раз от стандартной, но фиксированная)
    case shift
    
    /// Кнопка переключения раскладки (123/ABC)
    case layoutSwitch
    
    /// Пробел (заполняет оставшееся пространство)
    case space
    
    /// Кнопка Return
    case returnKey
    
    /// Кастомная ширина в поинтах
    case fixed(CGFloat)
}

// MARK: - Key Configuration

/// Конфигурация кнопки клавиатуры
struct KeyConfiguration {
    let type: KeyType
    let width: KeyWidth
    let secondaryText: String?
    
    init(type: KeyType, width: KeyWidth = .standard, secondaryText: String? = nil) {
        self.type = type
        self.width = width
        self.secondaryText = secondaryText
    }
    
    /// Быстрое создание буквенной кнопки
    static func letter(_ char: String) -> KeyConfiguration {
        return KeyConfiguration(type: .character(char.lowercased()))
    }
    
    /// Быстрое создание символьной кнопки
    static func symbol(_ char: String, secondary: String? = nil) -> KeyConfiguration {
        return KeyConfiguration(type: .character(char), secondaryText: secondary)
    }
}

// MARK: - Keyboard Key Delegate

/// Делегат для обработки событий клавиатуры
@MainActor
protocol KeyboardKeyDelegate: AnyObject {
    func keyDidPress(_ key: KeyboardKeyView, type: KeyType)
    func keyDidRelease(_ key: KeyboardKeyView, type: KeyType)
    func keyDidLongPress(_ key: KeyboardKeyView, type: KeyType)
}

// MARK: - Keyboard Key View

/// Кнопка клавиатуры, точно соответствующая нативной iOS
final class KeyboardKeyView: UIView {
    
    // MARK: - Properties
    
    weak var delegate: KeyboardKeyDelegate?
    
    let configuration: KeyConfiguration
    private var theme: KeyboardTheme = .light
    private var isPressed = false
    private var isModifierActive = false
    
    // MARK: - UI Components
    
    /// Основная кнопка с фоном и тенью
    private let backgroundView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.layer.cornerRadius = KeyboardMetrics.keyCornerRadius
        return view
    }()
    
    /// Основной текст кнопки
    private let primaryLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.adjustsFontSizeToFitWidth = true
        label.minimumScaleFactor = 0.7
        return label
    }()

    /// SF Symbol для кнопки (используется вместо текста для некоторых кнопок)
    private let primaryImageView: UIImageView = {
        let imageView = UIImageView()
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFit
        imageView.isHidden = true
        return imageView
    }()

    /// Вторичный текст (символ над цифрой)
    private let secondaryLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 10)
        label.isHidden = true
        return label
    }()
    
    // MARK: - Auto-Repeat
    
    private var autoRepeatTimer: Timer?
    private var autoRepeatStartTime: CFTimeInterval = 0
    
    // MARK: - Initialization
    
    init(configuration: KeyConfiguration) {
        self.configuration = configuration
        super.init(frame: .zero)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Setup
    
    private func setupView() {
        translatesAutoresizingMaskIntoConstraints = false

        // Добавляем фоновый вид
        addSubview(backgroundView)
        backgroundView.addSubview(primaryLabel)
        backgroundView.addSubview(primaryImageView)
        backgroundView.addSubview(secondaryLabel)
        
        // Констрейнты для фона
        NSLayoutConstraint.activate([
            backgroundView.topAnchor.constraint(equalTo: topAnchor),
            backgroundView.leadingAnchor.constraint(equalTo: leadingAnchor),
            backgroundView.trailingAnchor.constraint(equalTo: trailingAnchor),
            backgroundView.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -KeyboardMetrics.keyShadowOffsetY)
        ])
        
        // Констрейнты для основного текста
        NSLayoutConstraint.activate([
            primaryLabel.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            primaryLabel.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor),
            primaryLabel.leadingAnchor.constraint(greaterThanOrEqualTo: backgroundView.leadingAnchor, constant: 4),
            primaryLabel.trailingAnchor.constraint(lessThanOrEqualTo: backgroundView.trailingAnchor, constant: -4)
        ])

        // Констрейнты для SF Symbol (та же позиция что и текст)
        NSLayoutConstraint.activate([
            primaryImageView.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            primaryImageView.centerYAnchor.constraint(equalTo: backgroundView.centerYAnchor),
            primaryImageView.widthAnchor.constraint(equalToConstant: 20),
            primaryImageView.heightAnchor.constraint(equalToConstant: 20)
        ])

        // Констрейнты для вторичного текста
        NSLayoutConstraint.activate([
            secondaryLabel.centerXAnchor.constraint(equalTo: backgroundView.centerXAnchor),
            secondaryLabel.topAnchor.constraint(equalTo: backgroundView.topAnchor, constant: 2)
        ])
        
        // Настройка вида в зависимости от типа кнопки
        setupAppearance()
        setupGestures()
    }
    
    private func setupAppearance() {
        // Шрифт зависит от типа кнопки
        switch configuration.type {
        case .character:
            primaryLabel.font = UIFont.systemFont(ofSize: 22, weight: .regular)
        case .special(let type):
            switch type {
            case .enter:
                primaryLabel.font = UIFont.systemFont(ofSize: 16, weight: .regular)
            case .backspace, .delete:
                primaryLabel.font = UIFont.systemFont(ofSize: 22, weight: .light)
            case .escape, .tab:
                // Toolbar buttons - consistent font size
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            default:
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            }
        case .modifier(let type):
            // Ctrl in toolbar should match Esc/Tab size
            switch type {
            case .control:
                primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
            default:
                primaryLabel.font = UIFont.systemFont(ofSize: 20, weight: .regular)
            }
        case .layoutSwitch:
            primaryLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        }
        
        // Обновляем текст
        updateDisplayText()
        
        // Показываем вторичный текст если есть
        if let secondary = configuration.secondaryText, !secondary.isEmpty {
            secondaryLabel.text = secondary
            secondaryLabel.isHidden = false
        }
    }
    
    private func setupGestures() {
        // Tap gesture
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        addGestureRecognizer(tap)
        
        // Long press для авто-повтора и специальных действий
        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress(_:)))
        longPress.minimumPressDuration = 0.4
        addGestureRecognizer(longPress)
        
        // Touch tracking для визуального feedback
        isUserInteractionEnabled = true
    }
    
    // MARK: - Touch Handling
    
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        setPressed(true)
        
        // Отправляем событие нажатия (для модификаторов)
        delegate?.keyDidPress(self, type: configuration.type)
        
        // Запускаем авто-повтор для поддерживающих клавиш
        if case .special(let type) = configuration.type, type.supportsAutoRepeat {
            startAutoRepeat()
        }
    }
    
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesEnded(touches, with: event)
        setPressed(false)
        stopAutoRepeat()
        
        delegate?.keyDidRelease(self, type: configuration.type)
    }
    
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesCancelled(touches, with: event)
        setPressed(false)
        stopAutoRepeat()
    }
    
    // MARK: - Actions
    
    @objc private func handleTap() {
        // Уже обработано в touchesBegan/Ended
    }
    
    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        if gesture.state == .began {
            delegate?.keyDidLongPress(self, type: configuration.type)
        }
    }
    
    // MARK: - Auto-Repeat
    
    private func startAutoRepeat() {
        autoRepeatStartTime = CACurrentMediaTime()
        autoRepeatTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.checkAutoRepeat()
        }
    }
    
    private func stopAutoRepeat() {
        autoRepeatTimer?.invalidate()
        autoRepeatTimer = nil
    }
    
    private func checkAutoRepeat() {
        let elapsed = CACurrentMediaTime() - autoRepeatStartTime
        
        // Начинаем повтор после 500ms, затем каждые 50ms
        if elapsed > 0.5 {
            delegate?.keyDidPress(self, type: configuration.type)
        }
    }
    
    // MARK: - Visual State
    
    private func setPressed(_ pressed: Bool) {
        guard pressed != isPressed else { return }
        isPressed = pressed
        
        UIView.animate(withDuration: 0.05) {
            self.updateBackgroundColor()
        }
    }
    
    /// Установить состояние модификатора (для Shift, Ctrl, etc.)
    func setModifierActive(_ active: Bool) {
        isModifierActive = active
        updateBackgroundColor()

        // Update icon for modifier button when active
        if case .modifier(let type) = configuration.type {
            if let symbolName = active ? type.activeSfSymbolName : type.sfSymbolName {
                // Используем SF Symbol
                primaryLabel.isHidden = true
                primaryImageView.isHidden = false
                let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
                primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
            } else {
                // Используем текст
                primaryLabel.isHidden = false
                primaryImageView.isHidden = true
                primaryLabel.text = active ? type.activeDisplayText : type.displayText
            }
        }
    }
    
    /// Обновить отображаемый текст (при изменении Shift)
    func updateDisplayText(uppercase: Bool = false) {
        // Проверяем, есть ли SF Symbol для специальной кнопки
        if case .special(let type) = configuration.type, let symbolName = type.sfSymbolName {
            // Используем SF Symbol
            primaryLabel.isHidden = true
            primaryImageView.isHidden = false
            let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
            primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
        }
        // Проверяем, есть ли SF Symbol для модификатора
        else if case .modifier(let type) = configuration.type, let symbolName = type.sfSymbolName {
            // Используем SF Symbol (учитываем активное состояние через setModifierActive)
            primaryLabel.isHidden = true
            primaryImageView.isHidden = false
            let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
            primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
        }
        // Проверяем, есть ли SF Symbol для переключателя раскладки
        else if case .layoutSwitch(let layout) = configuration.type, let symbolName = layout.sfSymbolName {
            // Используем SF Symbol
            primaryLabel.isHidden = true
            primaryImageView.isHidden = false
            let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
            primaryImageView.image = UIImage(systemName: symbolName, withConfiguration: config)
        }
        // Используем текст
        else {
            primaryLabel.isHidden = false
            primaryImageView.isHidden = true

            let text: String
            switch configuration.type {
            case .character(let char):
                text = uppercase ? char.uppercased() : char.lowercased()
            default:
                text = configuration.type.displayText
            }

            primaryLabel.text = text
        }
    }
    
    // MARK: - Theme
    
    func applyTheme(_ theme: KeyboardTheme) {
        self.theme = theme
        updateBackgroundColor()

        // Текст
        primaryLabel.textColor = theme.keyTextColor
        secondaryLabel.textColor = theme.keySecondaryTextColor

        // SF Symbol цвет
        primaryImageView.tintColor = theme.keyTextColor

        // Тень
        layer.shadowColor = theme.keyShadowColor.cgColor
        layer.shadowOffset = CGSize(width: 0, height: KeyboardMetrics.keyShadowOffsetY)
        layer.shadowRadius = KeyboardMetrics.keyShadowRadius
        layer.shadowOpacity = KeyboardMetrics.keyShadowOpacity
    }
    
    private func updateBackgroundColor() {
        if isPressed {
            backgroundView.backgroundColor = theme.pressedKeyBackgroundColor
        } else if isModifierActive {
            backgroundView.backgroundColor = theme.modifierActiveBackgroundColor
            primaryLabel.textColor = theme.modifierActiveTextColor
        } else if configuration.type.isFunctional {
            backgroundView.backgroundColor = theme.functionKeyBackgroundColor
            primaryLabel.textColor = theme.keyTextColor
        } else {
            backgroundView.backgroundColor = theme.letterKeyBackgroundColor
            primaryLabel.textColor = theme.keyTextColor
        }
    }
    
    // MARK: - Cleanup
    
    deinit {
        stopAutoRepeat()
    }
}
