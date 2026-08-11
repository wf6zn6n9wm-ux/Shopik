// Холодильник+ · design tokens 1.0.0
// Згенеровано з tokens.json — не правити руками.
import SwiftUI

public enum AppTheme { case light, dark }

public extension Color {
    init(hex: String) {
        let s = hex.dropFirst()
        let v = UInt32(s, radix: 16) ?? 0
        self.init(.sRGB,
                  red:   Double((v >> 16) & 0xFF) / 255,
                  green: Double((v >>  8) & 0xFF) / 255,
                  blue:  Double( v        & 0xFF) / 255,
                  opacity: 1)
    }
}

public struct Tokens {
    public let theme: AppTheme
    public init(_ theme: AppTheme) { self.theme = theme }
    private func c(_ l: String, _ d: String) -> Color {
        Color(hex: theme == .dark ? d : l)
    }

    /// тло екрана
    public var bg: Color { c("#F3E5E5", "#080D13") }
    /// друге тло: шапка, панель навігації
    public var bg2: Color { c("#F7EBEB", "#0B1118") }
    /// картка
    public var surface: Color { c("#F9EEEE", "#0E171E") }
    /// піднята картка, поле вводу
    public var surface2: Color { c("#FCEFF0", "#122027") }
    /// волосяна межа картки
    public var border: Color { c("#E8D5D7", "#1C343B") }
    /// помітніша межа: контурні кнопки, вимкнений перемикач
    public var border2: Color { c("#DFC8CB", "#24424A") }
    /// заголовки й назви
    public var text: Color { c("#242126", "#F4F7F7") }
    /// підписи під назвою
    public var text2: Color { c("#6F6870", "#AAB8BB") }
    /// мітки секцій
    public var text3: Color { c("#726C70", "#718185") }
    /// плейсхолдер поля
    public var textPlaceholder: Color { c("#91898D", "#617074") }
    /// кнопки, активна вкладка, FAB, вибране
    public var accent: Color { c("#E83D72", "#39D0C0") }
    /// натиснутий стан акценту
    public var accentPressed: Color { c("#D83265", "#249E95") }
    /// смуги графіків, посилання на темному
    public var accentLight: Color { c("#F5A6BD", "#45E1D0") }
    /// тло під акцентом: бейдж іконки, підсвітка фокуса
    public var accentSoft: Color { c("#F9DCE5", "#123A3B") }
    /// текст і знаки поверх акценту
    public var onAccent: Color { c("#FFFFFF", "#04211F") }
    /// свіжий продукт
    public var ok: Color { c("#2C7A50", "#5FE0B4") }
    /// тло статусу «свіжий»
    public var okBg: Color { c("#DCEEE2", "#0F2E2A") }
    /// скоро закінчиться
    public var warn: Color { c("#9A560E", "#F0B44E") }
    /// тло статусу «скоро»
    public var warnBg: Color { c("#FBE6CC", "#31250F") }
    /// прострочено
    public var crit: Color { c("#B22334", "#FF7A85") }
    /// тло статусу «прострочено»
    public var critBg: Color { c("#FBDBDD", "#33161A") }
    /// неактивна вкладка
    public var navOff: Color { c("#6E666A", "#718185") }

    // геометрія — однакова в обох темах
    public let rXS: CGFloat = 10
    public let rSM: CGFloat = 14
    public let rMD: CGFloat = 18
    public let rLG: CGFloat = 22
    public let rXL: CGFloat = 28
    public let gutter: CGFloat = 20
    public let gap: CGFloat = 8
    public let iconStroke: CGFloat = 2
    public let minHit: CGFloat = 44
    public let fabSize: CGFloat = 54
}
