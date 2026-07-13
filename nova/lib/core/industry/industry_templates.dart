import 'package:flutter/material.dart';

/// Система отраслевых шаблонов. Каждая индустрия — готовое рабочее пространство:
/// категории, типовые услуги (рекомендованная длительность и цена, редактируемые),
/// цвет календаря, иконка, дефолты уведомлений. Пользователь выбирает сферу и за
/// ~30 секунд получает настроенный продукт (Time to First Value).
///
/// Платформа универсальна: сущности нейтральны (Business/Service/Client/
/// Appointment/Resource), а специфику даёт ДАННЫЙ каталог, а не код.

class ServiceTemplate {
  const ServiceTemplate(this.name, this.durationMinutes, this.price);
  final String name;
  final int durationMinutes;

  /// Рекомендованная цена в минорных единицах (×100), редактируется.
  final int price;
}

class ServiceCategoryTemplate {
  const ServiceCategoryTemplate(this.name, this.services);
  final String name;
  final List<ServiceTemplate> services;
}

class IndustryNotificationDefaults {
  const IndustryNotificationDefaults({
    this.remind24h = true,
    this.remind2h = true,
    this.thanks = true,
  });
  final bool remind24h;
  final bool remind2h;
  final bool thanks;
}

class IndustryTemplate {
  const IndustryTemplate({
    required this.id,
    required this.title,
    required this.icon,
    required this.color,
    required this.categories,
    this.notifications = const IndustryNotificationDefaults(),
  });

  final String id;
  final String title;
  final IconData icon;

  /// Цвет календаря/акцента для этой сферы.
  final Color color;
  final List<ServiceCategoryTemplate> categories;
  final IndustryNotificationDefaults notifications;

  /// Плоский список услуг (для сидирования).
  List<({String category, ServiceTemplate service})> get flatServices => [
        for (final c in categories)
          for (final s in c.services) (category: c.name, service: s),
      ];
}

/// Каталог отраслей — покрывает 10+ вертикалей. Расширяется данными, не кодом.
abstract final class IndustryCatalog {
  static const List<IndustryTemplate> all = [
    // — Красота —
    IndustryTemplate(
      id: 'barber',
      title: 'Барбершоп',
      icon: Icons.content_cut,
      color: Color(0xFF5B5BD6),
      categories: [
        ServiceCategoryTemplate('Стрижка', [
          ServiceTemplate('Мужская стрижка', 45, 500000),
          ServiceTemplate('Стрижка + борода', 60, 700000),
          ServiceTemplate('Оформление бороды', 30, 350000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'hair',
      title: 'Салон красоты',
      icon: Icons.face_retouching_natural,
      color: Color(0xFFD6558B),
      categories: [
        ServiceCategoryTemplate('Волосы', [
          ServiceTemplate('Стрижка + укладка', 60, 900000),
          ServiceTemplate('Окрашивание', 120, 2500000),
          ServiceTemplate('Уход', 45, 700000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'nails',
      title: 'Ногтевая студия',
      icon: Icons.back_hand_outlined,
      color: Color(0xFFCC5DE8),
      categories: [
        ServiceCategoryTemplate('Ногти', [
          ServiceTemplate('Маникюр', 75, 700000),
          ServiceTemplate('Педикюр', 90, 900000),
          ServiceTemplate('Наращивание', 120, 1200000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'spa',
      title: 'Массаж и СПА',
      icon: Icons.spa_outlined,
      color: Color(0xFF2E9E6B),
      categories: [
        ServiceCategoryTemplate('Массаж', [
          ServiceTemplate('Классический массаж', 60, 800000),
          ServiceTemplate('Спортивный массаж', 90, 1200000),
        ]),
      ],
    ),
    // — Медицина —
    IndustryTemplate(
      id: 'dental',
      title: 'Стоматология',
      icon: Icons.medical_services_outlined,
      color: Color(0xFF2F9BDC),
      categories: [
        ServiceCategoryTemplate('Приёмы', [
          ServiceTemplate('Консультация', 30, 500000),
          ServiceTemplate('Лечение кариеса', 60, 2500000),
          ServiceTemplate('Профгигиена', 45, 1500000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'clinic',
      title: 'Медицинский приём',
      icon: Icons.health_and_safety_outlined,
      color: Color(0xFF3BA0A0),
      categories: [
        ServiceCategoryTemplate('Приёмы', [
          ServiceTemplate('Первичный приём', 40, 1000000),
          ServiceTemplate('Повторный приём', 25, 700000),
        ]),
      ],
    ),
    // — Образование —
    IndustryTemplate(
      id: 'tutor',
      title: 'Репетитор',
      icon: Icons.school_outlined,
      color: Color(0xFFE0A020),
      categories: [
        ServiceCategoryTemplate('Занятия', [
          ServiceTemplate('Индивидуальное занятие', 60, 600000),
          ServiceTemplate('Пробный урок', 30, 0),
        ]),
      ],
    ),
    // — Спорт —
    IndustryTemplate(
      id: 'trainer',
      title: 'Тренер / фитнес',
      icon: Icons.fitness_center_outlined,
      color: Color(0xFFEF6C3B),
      categories: [
        ServiceCategoryTemplate('Тренировки', [
          ServiceTemplate('Персональная тренировка', 60, 700000),
          ServiceTemplate('Сплит-тренировка', 90, 1000000),
        ]),
      ],
    ),
    // — Авто —
    IndustryTemplate(
      id: 'auto',
      title: 'Автосервис',
      icon: Icons.build_outlined,
      color: Color(0xFF4B5563),
      categories: [
        ServiceCategoryTemplate('Работы', [
          ServiceTemplate('Диагностика', 45, 500000),
          ServiceTemplate('Замена масла', 40, 800000),
          ServiceTemplate('Шиномонтаж', 60, 1000000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'carwash',
      title: 'Автомойка',
      icon: Icons.local_car_wash_outlined,
      color: Color(0xFF2F80DC),
      categories: [
        ServiceCategoryTemplate('Мойка', [
          ServiceTemplate('Комплексная мойка', 40, 400000),
          ServiceTemplate('Химчистка салона', 180, 2500000),
        ]),
      ],
    ),
    // — Домашние услуги —
    IndustryTemplate(
      id: 'cleaning',
      title: 'Клининг',
      icon: Icons.cleaning_services_outlined,
      color: Color(0xFF20B2AA),
      categories: [
        ServiceCategoryTemplate('Уборка', [
          ServiceTemplate('Поддерживающая уборка', 120, 1500000),
          ServiceTemplate('Генеральная уборка', 240, 3500000),
        ]),
      ],
    ),
    IndustryTemplate(
      id: 'handyman',
      title: 'Мастер на час',
      icon: Icons.handyman_outlined,
      color: Color(0xFF8B6D3B),
      categories: [
        ServiceCategoryTemplate('Работы', [
          ServiceTemplate('Выезд мастера', 60, 500000),
          ServiceTemplate('Мелкий ремонт', 120, 1000000),
        ]),
      ],
    ),
    // — Консультации —
    IndustryTemplate(
      id: 'consult',
      title: 'Консультации',
      icon: Icons.record_voice_over_outlined,
      color: Color(0xFF6E56CF),
      categories: [
        ServiceCategoryTemplate('Приём', [
          ServiceTemplate('Консультация', 60, 1500000),
          ServiceTemplate('Экспресс-консультация', 30, 800000),
        ]),
      ],
    ),
    // — Творчество —
    IndustryTemplate(
      id: 'photo',
      title: 'Фотограф',
      icon: Icons.photo_camera_outlined,
      color: Color(0xFFB5179E),
      categories: [
        ServiceCategoryTemplate('Съёмки', [
          ServiceTemplate('Индивидуальная съёмка', 90, 2500000),
          ServiceTemplate('Семейная съёмка', 120, 3500000),
        ]),
      ],
    ),
    // — Еда —
    IndustryTemplate(
      id: 'bakery',
      title: 'Пекарня / кондитер',
      icon: Icons.bakery_dining_outlined,
      color: Color(0xFFD98324),
      categories: [
        ServiceCategoryTemplate('Заказы', [
          ServiceTemplate('Торт на заказ', 30, 1500000),
          ServiceTemplate('Капкейки (набор)', 20, 700000),
          ServiceTemplate('Дегустация', 45, 0),
        ]),
      ],
    ),
    // — Универсальное —
    IndustryTemplate(
      id: 'other',
      title: 'Другое',
      icon: Icons.more_horiz,
      color: Color(0xFF6A6A76),
      categories: [
        ServiceCategoryTemplate('Услуги', [
          ServiceTemplate('Услуга', 60, 500000),
          ServiceTemplate('Консультация', 30, 0),
        ]),
      ],
    ),
  ];

  static IndustryTemplate byId(String id) {
    for (final i in all) {
      if (i.id == id) return i;
    }
    return all.last; // 'other'
  }
}
