//
//  TerminalCustomKeyboardView.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import UIKit

// MARK: - Terminal Keyboard Delegate

/// Делегат для отправки ввода с клавиатуры в терминал
@MainActor
protocol TerminalKeyboardDelegate: AnyObject {
    /// Отправить байты в терминал
    func keyboard(_ keyboard: TerminalCustomKeyboardView, didSendInput data: Data)
    
    /// Запросить закрытие клавиатуры
    func keyboardDidRequestDismiss(_ keyboard: TerminalCustomKeyboardView)
}

// MARK: - Terminal Custom Keyboard View

/// Кастомная клавиатура терминала, визуально идентичная нативной iOS клавиатуре
/// с дополнительной панелью инструментов для терминальных команд
final class TerminalCustomKeyboardView: UIView {
    
    // MARK: - Properties
    
    weak var delegate: TerminalKeyboardDelegate?
    
    private var currentLayout: KeyboardLayout = .letters
    private var modifierState = ModifierState()
    private var theme: KeyboardTheme = .light
    
    private let layoutManager = KeyboardLayoutManager()
    
    // MARK: - UI Components
    
    /// Панель инструментов терминала (Esc, Tab, Ctrl, стрелки)
    private let toolbarView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()
    
    /// Разделитель между тулбаром и клавиатурой
    private let separatorView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()
    
    /// Основной контейнер клавиатуры
    private let keyboardContainer: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()
    
    /// Стеки для рядов кнопок
    private var rowStackViews: [UIStackView] = []
    
    /// Все кнопки клавиатуры
    private var keyViews: [KeyboardKeyView] = []
    
    /// Кнопки тулбара
    private var toolbarButtons: [KeyboardKeyView] = []
    
    /// Haptic feedback
    private let impactGenerator = UIImpactFeedbackGenerator(style: .light)
    
    // MARK: - Initialization
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupUI()
        setupInputViewProperties()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupUI()
        setupInputViewProperties()
    }
    
    /// Настройка свойств для корректной работы как inputView
    private func setupInputViewProperties() {
        // Важно для inputView: разрешаем автоматическое изменение ширины
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        
        // Устанавливаем translatesAutoresizingMaskIntoConstraints = true
        // чтобы iOS могла правильно разместить inputView
        translatesAutoresizingMaskIntoConstraints = true
    }
    
    override func sizeThatFits(_ size: CGSize) -> CGSize {
        let height = KeyboardMetrics.terminalToolbarHeight + KeyboardMetrics.keyboardHeight
        return CGSize(width: size.width, height: height)
    }
    
    // MARK: - Setup
    
    private func setupUI() {
        backgroundColor = theme.keyboardBackgroundColor
        
        // Добавляем компоненты
        addSubview(toolbarView)
        addSubview(separatorView)
        addSubview(keyboardContainer)
        
        setupConstraints()
        setupToolbar()
        loadLayout(currentLayout)
        
        impactGenerator.prepare()
    }
    
    private func setupConstraints() {
        let toolbarHeight = KeyboardMetrics.terminalToolbarHeight
        
        NSLayoutConstraint.activate([
            // Тулбар сверху
            toolbarView.topAnchor.constraint(equalTo: topAnchor),
            toolbarView.leadingAnchor.constraint(equalTo: leadingAnchor),
            toolbarView.trailingAnchor.constraint(equalTo: trailingAnchor),
            toolbarView.heightAnchor.constraint(equalToConstant: toolbarHeight),
            
            // Разделитель
            separatorView.topAnchor.constraint(equalTo: toolbarView.bottomAnchor),
            separatorView.leadingAnchor.constraint(equalTo: leadingAnchor),
            separatorView.trailingAnchor.constraint(equalTo: trailingAnchor),
            separatorView.heightAnchor.constraint(equalToConstant: 0.5),
            
            // Клавиатура
            keyboardContainer.topAnchor.constraint(equalTo: separatorView.bottomAnchor),
            keyboardContainer.leadingAnchor.constraint(equalTo: leadingAnchor),
            keyboardContainer.trailingAnchor.constraint(equalTo: trailingAnchor),
            keyboardContainer.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }
    
    // MARK: - Toolbar Setup
    
    private func setupToolbar() {
        let toolbarStack = UIStackView()
        toolbarStack.translatesAutoresizingMaskIntoConstraints = false
        toolbarStack.axis = .horizontal
        toolbarStack.distribution = .fillEqually
        toolbarStack.spacing = 6
        toolbarStack.alignment = .fill

        toolbarView.addSubview(toolbarStack)

        NSLayoutConstraint.activate([
            toolbarStack.topAnchor.constraint(equalTo: toolbarView.topAnchor, constant: 4),
            toolbarStack.leadingAnchor.constraint(equalTo: toolbarView.leadingAnchor, constant: 4),
            toolbarStack.trailingAnchor.constraint(equalTo: toolbarView.trailingAnchor, constant: -4),
            toolbarStack.bottomAnchor.constraint(equalTo: toolbarView.bottomAnchor, constant: -4)
        ])
        
        // Кнопки тулбара: Esc, Tab, Ctrl, ← ↓ ↑ → Dismiss
        let toolbarConfigs: [KeyConfiguration] = [
            KeyConfiguration(type: .special(.escape)),
            KeyConfiguration(type: .special(.tab)),
            KeyConfiguration(type: .modifier(.control)),
            KeyConfiguration(type: .special(.arrowLeft)),
            KeyConfiguration(type: .special(.arrowDown)),
            KeyConfiguration(type: .special(.arrowUp)),
            KeyConfiguration(type: .special(.arrowRight)),
            KeyConfiguration(type: .special(.dismiss))
        ]
        
        for config in toolbarConfigs {
            let button = KeyboardKeyView(configuration: config)
            button.delegate = self
            button.applyTheme(theme)
            toolbarStack.addArrangedSubview(button)
            toolbarButtons.append(button)
        }
    }
    
    // MARK: - Layout Loading
    
    private func loadLayout(_ layout: KeyboardLayout) {
        currentLayout = layout
        
        // Удаляем старые кнопки
        for view in rowStackViews {
            view.removeFromSuperview()
        }
        rowStackViews.removeAll()
        keyViews.removeAll()
        
        // Получаем новую раскладку
        let rows = layoutManager.getRows(for: layout, modifiers: modifierState)
        
        // Создаём главный стек для рядов
        let mainStack = UIStackView()
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        mainStack.axis = .vertical
        mainStack.spacing = KeyboardMetrics.verticalRowSpacing
        mainStack.distribution = .fillEqually
        mainStack.alignment = .fill
        
        keyboardContainer.addSubview(mainStack)
        
        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: keyboardContainer.topAnchor, constant: KeyboardMetrics.topPadding),
            mainStack.leadingAnchor.constraint(equalTo: keyboardContainer.leadingAnchor, constant: KeyboardMetrics.horizontalEdgePadding),
            mainStack.trailingAnchor.constraint(equalTo: keyboardContainer.trailingAnchor, constant: -KeyboardMetrics.horizontalEdgePadding),
            mainStack.bottomAnchor.constraint(equalTo: keyboardContainer.bottomAnchor, constant: -KeyboardMetrics.bottomPadding)
        ])
        
        rowStackViews.append(mainStack)
        
        // Создаём ряды кнопок
        for (rowIndex, rowConfigs) in rows.enumerated() {
            let rowStack = createRowStack(for: rowIndex, configs: rowConfigs)
            mainStack.addArrangedSubview(rowStack)
            rowStackViews.append(rowStack)
        }
        
        // Обновляем отображение букв
        updateLetterDisplay()
    }
    
    private func createRowStack(for rowIndex: Int, configs: [KeyConfiguration]) -> UIStackView {
        let rowStack = UIStackView()
        rowStack.axis = .horizontal
        rowStack.spacing = KeyboardMetrics.horizontalKeySpacing
        rowStack.alignment = .fill
        rowStack.distribution = .fill

        // Вычисляем стандартную ширину кнопки на основе верхнего ряда (10 кнопок)
        let totalWidth = bounds.width - KeyboardMetrics.horizontalEdgePadding * 2
        let standardKeyWidth = (totalWidth - (9 * KeyboardMetrics.horizontalKeySpacing)) / 10

        // Добавляем отступы для среднего ряда (9 букв вместо 10)
        if rowIndex == 1 && currentLayout == .letters {
            // Вычисляем отступ для центрирования 9 кнопок
            let nineKeysWidth = standardKeyWidth * 9 + KeyboardMetrics.horizontalKeySpacing * 8
            let spacerWidth = (totalWidth - nineKeysWidth) / 2

            let leftSpacer = UIView()
            leftSpacer.translatesAutoresizingMaskIntoConstraints = false
            leftSpacer.widthAnchor.constraint(equalToConstant: spacerWidth).isActive = true
            rowStack.addArrangedSubview(leftSpacer)
        }

        for config in configs {
            let keyView = KeyboardKeyView(configuration: config)
            keyView.delegate = self
            keyView.applyTheme(theme)

            // Устанавливаем ширину для всех кнопок
            setupKeyWidth(keyView, standardKeyWidth: standardKeyWidth, rowIndex: rowIndex)

            rowStack.addArrangedSubview(keyView)
            keyViews.append(keyView)
        }

        // Добавляем отступ справа для среднего ряда
        if rowIndex == 1 && currentLayout == .letters {
            let nineKeysWidth = standardKeyWidth * 9 + KeyboardMetrics.horizontalKeySpacing * 8
            let spacerWidth = (totalWidth - nineKeysWidth) / 2

            let rightSpacer = UIView()
            rightSpacer.translatesAutoresizingMaskIntoConstraints = false
            rightSpacer.widthAnchor.constraint(equalToConstant: spacerWidth).isActive = true
            rowStack.addArrangedSubview(rightSpacer)
        }

        return rowStack
    }
    
    private func setupKeyWidth(_ keyView: KeyboardKeyView, standardKeyWidth: CGFloat, rowIndex: Int) {
        switch keyView.configuration.width {
        case .standard:
            // Стандартные буквенные кнопки - все одинаковой ширины на основе верхнего ряда
            keyView.widthAnchor.constraint(equalToConstant: standardKeyWidth).isActive = true

        case .shift:
            // Shift и Backspace - фиксированная ширина
            keyView.widthAnchor.constraint(equalToConstant: 42).isActive = true

        case .layoutSwitch:
            // Кнопка переключения раскладки
            keyView.widthAnchor.constraint(equalToConstant: 50).isActive = true

        case .space:
            // Пробел заполняет оставшееся пространство
            // Приоритет ниже, чтобы другие кнопки сохраняли свою ширину
            keyView.setContentHuggingPriority(.defaultLow, for: .horizontal)
            keyView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        case .returnKey:
            // Return - фиксированная ширина
            keyView.widthAnchor.constraint(equalToConstant: 88).isActive = true

        case .fixed(let width):
            keyView.widthAnchor.constraint(equalToConstant: width).isActive = true
        }
    }
    
    // MARK: - Theme
    
    func applyTheme(_ theme: KeyboardTheme) {
        self.theme = theme
        backgroundColor = theme.keyboardBackgroundColor
        toolbarView.backgroundColor = theme.toolbarBackgroundColor
        separatorView.backgroundColor = theme.toolbarSeparatorColor
        
        // Обновляем все кнопки
        for keyView in keyViews {
            keyView.applyTheme(theme)
        }
        for button in toolbarButtons {
            button.applyTheme(theme)
        }
    }
    
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            let newTheme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
            applyTheme(newTheme)
        }
    }
    
    // MARK: - Layout Switching
    
    func switchToLayout(_ layout: KeyboardLayout) {
        guard layout != currentLayout else { return }
        
        UIView.transition(with: keyboardContainer, duration: 0.15, options: .transitionCrossDissolve) {
            self.loadLayout(layout)
        }
    }
    
    // MARK: - Modifier State
    
    private func toggleModifier(_ type: ModifierKeyType) {
        switch type {
        case .shift:
            modifierState.shift.toggle()
            // Сбрасываем Caps Lock при нажатии Shift
            if modifierState.shift {
                modifierState.capsLock = false
            }
        case .capsLock:
            modifierState.capsLock.toggle()
            modifierState.shift = false
        case .control:
            modifierState.control.toggle()
        case .alt:
            modifierState.alt.toggle()
        }
        
        updateModifierButtons()
        updateLetterDisplay()
    }
    
    private func resetShiftAfterKeyPress() {
        // Сбрасываем Shift (но не Caps Lock) после ввода символа
        if modifierState.shift && !modifierState.capsLock {
            modifierState.shift = false
            updateModifierButtons()
            updateLetterDisplay()
        }
    }
    
    private func updateModifierButtons() {
        for keyView in keyViews + toolbarButtons {
            if case .modifier(let type) = keyView.configuration.type {
                switch type {
                case .shift:
                    keyView.setModifierActive(modifierState.shift || modifierState.capsLock)
                case .control:
                    keyView.setModifierActive(modifierState.control)
                case .alt:
                    keyView.setModifierActive(modifierState.alt)
                case .capsLock:
                    keyView.setModifierActive(modifierState.capsLock)
                }
            }
        }
    }
    
    private func updateLetterDisplay() {
        let uppercase = modifierState.isUppercase
        for keyView in keyViews {
            keyView.updateDisplayText(uppercase: uppercase)
        }
    }
    
    // MARK: - Input Processing
    
    private func sendInput(for type: KeyType) {
        let bytes: [UInt8]
        
        switch type {
        case .character(let char):
            let processed = modifierState.apply(to: char.first ?? Character(" "))
            bytes = Array(processed.utf8)
            
        case .special(let specialType):
            bytes = specialType.byteSequence(modifiers: modifierState)
            
        case .modifier:
            // Модификаторы не отправляют байты напрямую
            return
            
        case .layoutSwitch:
            // Переключение раскладки не отправляет байты
            return
        }
        
        if !bytes.isEmpty {
            delegate?.keyboard(self, didSendInput: Data(bytes))
        }
    }
    
    // MARK: - Intrinsic Size
    
    override var intrinsicContentSize: CGSize {
        let height = KeyboardMetrics.terminalToolbarHeight + KeyboardMetrics.keyboardHeight
        return CGSize(width: UIView.noIntrinsicMetric, height: height)
    }
}

// MARK: - KeyboardKeyDelegate

extension TerminalCustomKeyboardView: KeyboardKeyDelegate {
    
    func keyDidPress(_ key: KeyboardKeyView, type: KeyType) {
        impactGenerator.impactOccurred()
        
        switch type {
        case .modifier(let modType):
            toggleModifier(modType)
            
        case .layoutSwitch(let layout):
            switchToLayout(layout)
            
        case .special(.dismiss):
            delegate?.keyboardDidRequestDismiss(self)
            
        case .character, .special:
            sendInput(for: type)
            resetShiftAfterKeyPress()
        }
    }
    
    func keyDidRelease(_ key: KeyboardKeyView, type: KeyType) {
        // Для большинства кнопок ничего не делаем при отпускании
        // Ctrl может сбрасываться при отпускании в будущем
    }
    
    func keyDidLongPress(_ key: KeyboardKeyView, type: KeyType) {
        switch type {
        case .modifier(.shift):
            // Долгое нажатие на Shift включает Caps Lock
            modifierState.capsLock = true
            modifierState.shift = false
            updateModifierButtons()
            updateLetterDisplay()
            
        case .special(.backspace):
            // Долгое нажатие на Backspace - удалить слово (Ctrl+W)
            delegate?.keyboard(self, didSendInput: Data([0x17]))
            
        case .special(.escape):
            // Долгое нажатие на Esc - прервать (Ctrl+C)
            delegate?.keyboard(self, didSendInput: Data([0x03]))
            
        default:
            break
        }
    }
}
