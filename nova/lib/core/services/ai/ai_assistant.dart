import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

@immutable
class AiSuggestion {
  const AiSuggestion({required this.text, this.confidence = 0});
  final String text;
  final double confidence;
}

/// Порт AI-ассистента. Встраивается во всё приложение (умные слоты, заметки,
/// инсайты, natural-language команды). Реализация подключается позже: вызов
/// собственного бэкенда, который ходит в модель. UI спрашивает [available] и
/// мягко деградирует, если ассистент выключен.
abstract interface class AiAssistant {
  bool get available;
  Future<String> complete(String prompt, {Map<String, Object?>? context});
  Future<List<AiSuggestion>> suggest(String intent,
      {Map<String, Object?>? context});
}

/// DEFAULT: выключен. Замена: BackendAiAssistant (адаптер к API/модели).
class NoopAiAssistant implements AiAssistant {
  @override
  bool get available => false;

  @override
  Future<String> complete(String prompt,
          {Map<String, Object?>? context}) async =>
      '';

  @override
  Future<List<AiSuggestion>> suggest(String intent,
          {Map<String, Object?>? context}) async =>
      const [];
}

final aiAssistantProvider = Provider<AiAssistant>((ref) => NoopAiAssistant());
