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
    private var theme: KeyboardTheme = .light  // Will be updated in didMoveToWindow based on system theme

    private let layoutManager = KeyboardLayoutManager()

    /// Время последнего нажатия shift для обнаружения двойного тапа
    private var lastShiftTapTime: TimeInterval = 0
    private let doubleTapInterval: TimeInterval = 0.45  // 1.5x longer for easier Caps Lock activation

    /// Флаг для отслеживания первого layout
    private var hasPerformedInitialLayout = false

    /// Доступные языки (пересечение системных и поддерживаемых приложением)
    private lazy var availableLanguages: [KeyboardLanguage] = {
        let languages = KeyboardLanguage.availableLanguages()
        print("🌐 Available keyboard languages: \(languages.map { $0.displayName })")
        return languages
    }()

    /// Текущий язык клавиатуры (сохраняется в UserDefaults)
    private var currentLanguage: KeyboardLanguage {
        get {
            if let rawValue = UserDefaults.standard.string(forKey: "TerminalKeyboardLanguage"),
               let language = KeyboardLanguage(rawValue: rawValue),
               availableLanguages.contains(language) {
                return language
            }
            // Default to English (always available)
            return .english
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: "TerminalKeyboardLanguage")
            layoutManager.currentLanguage = newValue
        }
    }
    
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

    override func didMoveToWindow() {
        super.didMoveToWindow()

        // Apply correct theme when added to window (has proper trait collection)
        if window != nil {
            print("🎨 Keyboard didMoveToWindow - userInterfaceStyle: \(traitCollection.userInterfaceStyle.rawValue)")
            print("   0=unspecified, 1=light, 2=dark")
            let detectedTheme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
            print("   Detected theme: \(detectedTheme.keyboardBackgroundColor == KeyboardTheme.light.keyboardBackgroundColor ? "LIGHT" : "DARK")")
            if detectedTheme.keyboardBackgroundColor !== theme.keyboardBackgroundColor {
                applyTheme(detectedTheme)
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        // Reload layout once we have valid bounds (fixes key width calculation)
        if !hasPerformedInitialLayout && bounds.width > 0 && !keyViews.isEmpty {
            hasPerformedInitialLayout = true
            loadLayout(currentLayout)
        }
    }
    
    // MARK: - Setup
    
    private func setupUI() {
        backgroundColor = theme.keyboardBackgroundColor

        // Инициализируем язык
        layoutManager.currentLanguage = currentLanguage

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
        
        // Кнопки тулбара: Esc, Tab, Ctrl, /, ~, ← ↓ ↑ →, Dismiss
        let toolbarConfigs: [KeyConfiguration] = [
            KeyConfiguration(type: .special(.escape)),
            KeyConfiguration(type: .special(.tab)),
            KeyConfiguration(type: .modifier(.control)),
            KeyConfiguration(type: .special(.slash)),
            KeyConfiguration(type: .special(.tilde)),
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
        mainStack.distribution = .fill
        mainStack.alignment = .fill

        keyboardContainer.addSubview(mainStack)

        NSLayoutConstraint.activate([
            mainStack.topAnchor.constraint(equalTo: keyboardContainer.topAnchor, constant: KeyboardMetrics.topPadding),
            mainStack.leadingAnchor.constraint(equalTo: keyboardContainer.leadingAnchor, constant: KeyboardMetrics.horizontalEdgePadding),
            mainStack.trailingAnchor.constraint(equalTo: keyboardContainer.trailingAnchor, constant: -KeyboardMetrics.horizontalEdgePadding),
            mainStack.bottomAnchor.constraint(equalTo: keyboardContainer.bottomAnchor, constant: -KeyboardMetrics.bottomPadding)
        ])

        rowStackViews.append(mainStack)

        // Создаём ряды кнопок (all equal height except bottom row)
        for (rowIndex, rowConfigs) in rows.enumerated() {
            let rowStack = createRowStack(for: rowIndex, configs: rowConfigs)
            mainStack.addArrangedSubview(rowStack)
            rowStackViews.append(rowStack)

            // Set equal height for all rows except the last one
            if rowIndex == 0 {
                // Save first row height as reference
                rowStack.heightAnchor.constraint(equalToConstant: 42).isActive = true
            } else if rowIndex < rows.count - 1 {
                // All other rows match first row height
                rowStack.heightAnchor.constraint(equalTo: rowStackViews[1].heightAnchor).isActive = true
            }
        }

        // Add bottom row with globe and microphone buttons (shorter height)
        let bottomRow = createBottomRow()
        mainStack.addArrangedSubview(bottomRow)
        rowStackViews.append(bottomRow)
        bottomRow.heightAnchor.constraint(equalToConstant: 32).isActive = true

        // Add bottom padding spacer
        let bottomPaddingSpacer = UIView()
        bottomPaddingSpacer.translatesAutoresizingMaskIntoConstraints = false
        mainStack.addArrangedSubview(bottomPaddingSpacer)
        bottomPaddingSpacer.heightAnchor.constraint(equalToConstant: 10).isActive = true
        
        // Обновляем отображение букв
        updateLetterDisplay()
    }
    
    private func createRowStack(for rowIndex: Int, configs: [KeyConfiguration]) -> UIStackView {
        let rowStack = UIStackView()
        rowStack.axis = .horizontal
        rowStack.spacing = KeyboardMetrics.horizontalKeySpacing
        rowStack.alignment = .fill
        rowStack.distribution = .fill

        // Calculate standard key width based on top row (10 keys)
        let totalWidth = bounds.width - KeyboardMetrics.horizontalEdgePadding * 2
        let standardKeyWidth = (totalWidth - (9 * KeyboardMetrics.horizontalKeySpacing)) / 10

        // Add spacers for middle row (9 letters instead of 10)
        if rowIndex == 1 && currentLayout == .letters {
            // Calculate offset to center 9 keys
            // Need to account for 10 gaps: 8 between keys + 1 after left spacer + 1 before right spacer
            let nineKeysWidth = standardKeyWidth * 9 + KeyboardMetrics.horizontalKeySpacing * 10
            let spacerWidth = (totalWidth - nineKeysWidth) / 2

            let leftSpacer = UIView()
            leftSpacer.translatesAutoresizingMaskIntoConstraints = false
            let leftSpacerConstraint = leftSpacer.widthAnchor.constraint(equalToConstant: spacerWidth)
            leftSpacerConstraint.priority = .required
            leftSpacerConstraint.isActive = true
            leftSpacer.setContentHuggingPriority(.required, for: .horizontal)
            leftSpacer.setContentCompressionResistancePriority(.required, for: .horizontal)
            rowStack.addArrangedSubview(leftSpacer)
        }

        // For third row (Shift Letters... Backspace) - ALWAYS equal width for both buttons!
        // Logic:
        // 1. Try to use ideal width (1.5x) for buttons
        // 2. If it fits - remaining space goes to spacers
        // 3. If it doesn't fit - remove spacers (= 0) and reduce buttons EQUALLY
        var row3ShiftWidth: CGFloat = 0
        var row3SpacerWidth: CGFloat = 0
        if rowIndex == 2 && currentLayout == .letters {
            let letterCount = configs.count - 2  // Subtract Shift and Backspace

            // Width of letters with gaps between them
            let lettersWidth = standardKeyWidth * CGFloat(letterCount) + KeyboardMetrics.horizontalKeySpacing * CGFloat(letterCount - 1)

            // Ideal width for Shift/Backspace (ALWAYS THE SAME!)
            let idealShiftWidth = standardKeyWidth * 1.5

            // OPTION 1: Try ideal width WITHOUT spacers
            // Structure: Shift | gap | Letters | gap | Backspace
            // Gaps: 2 (after Shift, after letters)
            let gapsNoSpacers = KeyboardMetrics.horizontalKeySpacing * 2
            let requiredWidthNoSpacers = (idealShiftWidth * 2) + lettersWidth + gapsNoSpacers

            if requiredWidthNoSpacers <= totalWidth {
                // Fits with ideal width!
                row3ShiftWidth = idealShiftWidth

                // Check if there's room for spacers
                // Structure with spacers: Shift | gap | Spacer | gap | Letters | gap | Spacer | gap | Backspace
                // Additional gaps: +2 (after left and right spacers)
                let gapsWithSpacers = KeyboardMetrics.horizontalKeySpacing * 4
                let remainingForSpacers = totalWidth - (idealShiftWidth * 2) - lettersWidth - gapsWithSpacers

                print("🔍 Row 3 calculation (\(letterCount) letters):")
                print("   totalWidth: \(totalWidth)")
                print("   lettersWidth: \(lettersWidth)")
                print("   idealShiftWidth: \(idealShiftWidth)")
                print("   gapsWithSpacers: \(gapsWithSpacers)")
                print("   remainingForSpacers: \(remainingForSpacers)")

                if remainingForSpacers >= 0 {
                    // There's room for spacers - distribute remaining space equally
                    row3SpacerWidth = remainingForSpacers / 2
                    print("   ✅ Spacer width: \(row3SpacerWidth)")
                } else {
                    // No room for spacers - go without them
                    row3SpacerWidth = 0
                    print("   ❌ No room for spacers")
                }
            } else {
                // Doesn't fit with ideal width - reduce buttons EQUALLY, spacers = 0
                row3SpacerWidth = 0
                let availableForModifiers = totalWidth - lettersWidth - gapsNoSpacers
                row3ShiftWidth = availableForModifiers / 2  // Divide EQUALLY!
                print("🔍 Row 3: Reducing button width to \(row3ShiftWidth)")
            }
        }

        for (index, config) in configs.enumerated() {
            let keyView = KeyboardKeyView(configuration: config)
            keyView.delegate = self
            keyView.applyTheme(theme)

            // Set width for all keys
            setupKeyWidth(keyView, standardKeyWidth: standardKeyWidth, rowIndex: rowIndex, row3ShiftWidth: row3ShiftWidth)

            rowStack.addArrangedSubview(keyView)
            keyViews.append(keyView)

            // For third row, add spacer after Shift (index 0) ONLY if width > 0
            if rowIndex == 2 && currentLayout == .letters && index == 0 && row3SpacerWidth > 0 {
                print("   🟢 Adding LEFT spacer with width: \(row3SpacerWidth)")
                let leftSpacer = UIView()
                leftSpacer.translatesAutoresizingMaskIntoConstraints = false
                leftSpacer.backgroundColor = .red.withAlphaComponent(0.3)  // DEBUG: make visible
                let leftSpacerConstraint = leftSpacer.widthAnchor.constraint(equalToConstant: row3SpacerWidth)
                leftSpacerConstraint.priority = .required
                leftSpacerConstraint.isActive = true
                leftSpacer.setContentHuggingPriority(.required, for: .horizontal)
                leftSpacer.setContentCompressionResistancePriority(.required, for: .horizontal)
                rowStack.addArrangedSubview(leftSpacer)
            } else if rowIndex == 2 && currentLayout == .letters && index == 0 {
                print("   ⚪ NOT adding left spacer (width = \(row3SpacerWidth))")
            }

            // For third row, add spacer before Backspace (last button) ONLY if width > 0
            if rowIndex == 2 && currentLayout == .letters && index == configs.count - 2 && row3SpacerWidth > 0 {
                print("   🟢 Adding RIGHT spacer with width: \(row3SpacerWidth)")
                let rightSpacer = UIView()
                rightSpacer.translatesAutoresizingMaskIntoConstraints = false
                rightSpacer.backgroundColor = .blue.withAlphaComponent(0.3)  // DEBUG: make visible
                let rightSpacerConstraint = rightSpacer.widthAnchor.constraint(equalToConstant: row3SpacerWidth)
                rightSpacerConstraint.priority = .required
                rightSpacerConstraint.isActive = true
                rightSpacer.setContentHuggingPriority(.required, for: .horizontal)
                rightSpacer.setContentCompressionResistancePriority(.required, for: .horizontal)
                rowStack.addArrangedSubview(rightSpacer)
            } else if rowIndex == 2 && currentLayout == .letters && index == configs.count - 2 {
                print("   ⚪ NOT adding right spacer (width = \(row3SpacerWidth))")
            }
        }

        // Add right spacer for middle row
        if rowIndex == 1 && currentLayout == .letters {
            // Use the same formula for right spacer
            let nineKeysWidth = standardKeyWidth * 9 + KeyboardMetrics.horizontalKeySpacing * 10
            let spacerWidth = (totalWidth - nineKeysWidth) / 2

            let rightSpacer = UIView()
            rightSpacer.translatesAutoresizingMaskIntoConstraints = false
            let rightSpacerConstraint = rightSpacer.widthAnchor.constraint(equalToConstant: spacerWidth)
            rightSpacerConstraint.priority = .required
            rightSpacerConstraint.isActive = true
            rightSpacer.setContentHuggingPriority(.required, for: .horizontal)
            rightSpacer.setContentCompressionResistancePriority(.required, for: .horizontal)
            rowStack.addArrangedSubview(rightSpacer)
        }

        return rowStack
    }
    
    private func createBottomRow() -> UIStackView {
        let rowStack = UIStackView()
        rowStack.axis = .horizontal
        rowStack.spacing = 0
        rowStack.alignment = .fill
        rowStack.distribution = .fill  // Use manual constraints for custom spacing

        // Left spacer (flexible)
        let leftSpacer = UIView()
        leftSpacer.translatesAutoresizingMaskIntoConstraints = false
        leftSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        leftSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        rowStack.addArrangedSubview(leftSpacer)

        // Globe button (language switch) - 60pt (20% larger)
        let globeConfig = KeyConfiguration(type: .special(.languageSwitch))
        let globeButton = KeyboardKeyView(configuration: globeConfig)
        globeButton.delegate = self
        globeButton.isBottomRowButton = true  // Transparent background
        globeButton.applyTheme(theme)
        globeButton.translatesAutoresizingMaskIntoConstraints = false
        let globeWidthConstraint = globeButton.widthAnchor.constraint(equalToConstant: 60)
        globeWidthConstraint.priority = .required
        globeWidthConstraint.isActive = true
        globeButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        rowStack.addArrangedSubview(globeButton)
        keyViews.append(globeButton)

        // Middle spacer (flexible, but wider than side spacers)
        let middleSpacer = UIView()
        middleSpacer.translatesAutoresizingMaskIntoConstraints = false
        middleSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        middleSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        rowStack.addArrangedSubview(middleSpacer)

        // Microphone button (voice input) - 60pt (20% larger)
        let micConfig = KeyConfiguration(type: .special(.microphone))
        let micButton = KeyboardKeyView(configuration: micConfig)
        micButton.delegate = self
        micButton.isBottomRowButton = true  // Transparent background
        micButton.applyTheme(theme)
        micButton.translatesAutoresizingMaskIntoConstraints = false
        micButton.isHidden = true  // Hidden but not removed (for future voice input feature)
        let micWidthConstraint = micButton.widthAnchor.constraint(equalToConstant: 60)
        micWidthConstraint.priority = .required
        micWidthConstraint.isActive = true
        micButton.setContentCompressionResistancePriority(.required, for: .horizontal)
        rowStack.addArrangedSubview(micButton)
        keyViews.append(micButton)

        // Right spacer (flexible)
        let rightSpacer = UIView()
        rightSpacer.translatesAutoresizingMaskIntoConstraints = false
        rightSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        rightSpacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        rowStack.addArrangedSubview(rightSpacer)

        // Make middle spacer 1.5x wider than side spacers
        NSLayoutConstraint.activate([
            middleSpacer.widthAnchor.constraint(equalTo: leftSpacer.widthAnchor, multiplier: 1.5),
            rightSpacer.widthAnchor.constraint(equalTo: leftSpacer.widthAnchor)
        ])

        return rowStack
    }

    private func setupKeyWidth(_ keyView: KeyboardKeyView, standardKeyWidth: CGFloat, rowIndex: Int, row3ShiftWidth: CGFloat) {
        switch keyView.configuration.width {
        case .standard:
            // Standard letter keys - all the same width based on top row
            let constraint = keyView.widthAnchor.constraint(equalToConstant: standardKeyWidth)
            constraint.priority = .required
            constraint.isActive = true
            keyView.setContentCompressionResistancePriority(.required, for: .horizontal)
            keyView.setContentHuggingPriority(.defaultHigh, for: .horizontal)

        case .shift:
            // Shift and Backspace - ALWAYS use calculated width for row 3 letters
            let shiftWidth: CGFloat
            if rowIndex == 2 && currentLayout == .letters {
                // Use EXACTLY calculated width (can be ideal 1.5x or less)
                shiftWidth = row3ShiftWidth
            } else {
                // Fallback for other layouts (numbers, symbols)
                shiftWidth = standardKeyWidth * 1.5
            }
            let constraint = keyView.widthAnchor.constraint(equalToConstant: shiftWidth)
            constraint.priority = .required
            constraint.isActive = true
            keyView.setContentCompressionResistancePriority(.required, for: .horizontal)
            keyView.setContentHuggingPriority(.required, for: .horizontal)

        case .layoutSwitch:
            // Layout switch button - same width as Return key
            let constraint = keyView.widthAnchor.constraint(equalToConstant: 88)
            constraint.priority = .required
            constraint.isActive = true
            keyView.setContentCompressionResistancePriority(.required, for: .horizontal)

        case .space:
            // Space fills remaining space
            // Lower priority so other keys maintain their width
            keyView.setContentHuggingPriority(.defaultLow, for: .horizontal)
            keyView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        case .returnKey:
            // Return - fixed width
            let constraint = keyView.widthAnchor.constraint(equalToConstant: 88)
            constraint.priority = .required
            constraint.isActive = true
            keyView.setContentCompressionResistancePriority(.required, for: .horizontal)

        case .fixed(let width):
            let constraint = keyView.widthAnchor.constraint(equalToConstant: width)
            constraint.priority = .required
            constraint.isActive = true
            keyView.setContentCompressionResistancePriority(.required, for: .horizontal)
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
            print("🎨 Keyboard traitCollectionDidChange")
            print("   Previous: \(previousTraitCollection?.userInterfaceStyle.rawValue ?? -1), Current: \(traitCollection.userInterfaceStyle.rawValue)")
            let newTheme = KeyboardTheme.theme(for: traitCollection.userInterfaceStyle)
            print("   Applying theme: \(newTheme.keyboardBackgroundColor == KeyboardTheme.light.keyboardBackgroundColor ? "LIGHT" : "DARK")")
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

    // MARK: - Language Switching

    /// Переключить язык клавиатуры на следующий
    private func switchToNextLanguage() {
        // Switch to next available language only
        currentLanguage = currentLanguage.next(availableLanguages: availableLanguages)
        print("🌐 Switched to language: \(currentLanguage.displayName)")

        // Перезагружаем раскладку с анимацией
        UIView.transition(with: keyboardContainer, duration: 0.15, options: .transitionCrossDissolve) {
            self.loadLayout(self.currentLayout)
        }
    }
    
    // MARK: - Modifier State
    
    private func toggleModifier(_ type: ModifierKeyType) {
        switch type {
        case .shift:
            let now = Date().timeIntervalSince1970
            print("🔄 toggleModifier(.shift) - current state: shift=\(modifierState.shift), capsLock=\(modifierState.capsLock)")

            // If shift is already on, turn it off
            if modifierState.shift {
                print("   Shift is ON - turning OFF")
                modifierState.shift = false
            } else {
                print("   Shift is OFF - turning ON")
                // Check for double-tap when turning shift ON
                if now - lastShiftTapTime < doubleTapInterval {
                    print("   Double-tap detected - enabling Caps Lock instead")
                    // Double tap detected - enable Caps Lock instead of shift
                    modifierState.capsLock = true
                    modifierState.shift = false
                } else {
                    print("   Single tap - enabling shift")
                    // Single tap - turn on shift
                    modifierState.shift = true
                    modifierState.capsLock = false
                }
            }

            lastShiftTapTime = now
            print("   New state: shift=\(modifierState.shift), capsLock=\(modifierState.capsLock)")
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

        case .special(.languageSwitch):
            switchToNextLanguage()

        case .character, .special:
            sendInput(for: type)
            // Don't auto-reset shift - it stays ON until manually toggled OFF
            // resetShiftAfterKeyPress()
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
