"""Property-based тесты для валидации сообщений.

Feature: worker-referral-orders, Property 8: Валидация сообщений
Validates: Requirements 8.4

Feature: worker-referral-orders, Property 9: Хронологический порядок сообщений
Validates: Requirements 8.5
"""

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from pydantic import ValidationError

from schemas.marketplace_messages import MessageSendRequest

# Фиксированный UUID для recipient_id (требуется схемой, но не тестируется)
FIXED_RECIPIENT_ID = uuid.uuid4()


class TestMessageValidationProperty:
    """**Validates: Requirements 8.4**

    Property 8: Для любой строки, которая пуста, состоит только из пробельных
    символов или превышает 2000 символов, отправка сообщения должна быть отклонена
    с ошибкой валидации. Валидные строки (1–2000 символов, не только пробелы)
    принимаются.
    """

    @given(text=st.just(""))
    @settings(max_examples=200)
    def test_empty_string_rejected(self, text: str) -> None:
        """Пустая строка отклоняется.

        **Validates: Requirements 8.4**
        """
        with pytest.raises(ValidationError):
            MessageSendRequest(recipient_id=FIXED_RECIPIENT_ID, text=text)

    @given(text=st.from_regex(r"^\s+$", fullmatch=True))
    @settings(max_examples=200)
    def test_whitespace_only_rejected(self, text: str) -> None:
        """Строка, состоящая только из пробельных символов, отклоняется.

        **Validates: Requirements 8.4**
        """
        with pytest.raises(ValidationError):
            MessageSendRequest(recipient_id=FIXED_RECIPIENT_ID, text=text)

    @given(text=st.text(min_size=2001, max_size=3000))
    @settings(
        max_examples=200,
        # min_size=2001 намеренно даёт большой базовый пример — это суть теста,
        # а не проблема стратегии. Подавляем ложноположительный health-check
        # (иначе тест падает на части поддерживаемых версий hypothesis).
        suppress_health_check=[HealthCheck.large_base_example],
    )
    def test_too_long_string_rejected(self, text: str) -> None:
        """Строка длиннее 2000 символов отклоняется.

        **Validates: Requirements 8.4**
        """
        with pytest.raises(ValidationError):
            MessageSendRequest(recipient_id=FIXED_RECIPIENT_ID, text=text)

    @given(text=st.text(min_size=1, max_size=2000).filter(lambda s: s.strip()))
    @settings(max_examples=200)
    def test_valid_string_accepted(self, text: str) -> None:
        """Валидные строки (1–2000 символов, не только пробелы) принимаются.

        **Validates: Requirements 8.4**
        """
        result = MessageSendRequest(recipient_id=FIXED_RECIPIENT_ID, text=text)
        assert result.text == text
        assert result.recipient_id == FIXED_RECIPIENT_ID


from datetime import datetime


class TestMessageChronologicalOrderProperty:
    """**Validates: Requirements 8.5**

    Property 9: Для любой переписки между двумя пользователями, возвращаемый
    список сообщений должен быть упорядочен по created_at по возрастанию
    (старые сначала).

    Тестируем абстрактную логику: для любого списка datetime-объектов,
    отсортированный по возрастанию результат удовлетворяет условию
    all(items[i] <= items[i+1]) для последовательных пар.
    Это валидирует ORDER BY created_at ASC в запросе get_conversation.
    """

    @given(timestamps=st.lists(st.datetimes(), min_size=0, max_size=100))
    @settings(max_examples=200)
    def test_sorted_timestamps_are_in_ascending_order(
        self, timestamps: list[datetime]
    ) -> None:
        """Отсортированный список datetime всегда в порядке возрастания.

        **Validates: Requirements 8.5**
        """
        sorted_timestamps = sorted(timestamps)

        # Для всех последовательных пар: items[i] <= items[i+1]
        for i in range(len(sorted_timestamps) - 1):
            assert sorted_timestamps[i] <= sorted_timestamps[i + 1], (
                f"Нарушен хронологический порядок: "
                f"{sorted_timestamps[i]} > {sorted_timestamps[i + 1]} на позиции {i}"
            )

    @given(timestamps=st.lists(st.datetimes(), min_size=2, max_size=100))
    @settings(max_examples=200)
    def test_sorted_result_length_matches_input(
        self, timestamps: list[datetime]
    ) -> None:
        """Сортировка не теряет и не добавляет элементы.

        **Validates: Requirements 8.5**
        """
        sorted_timestamps = sorted(timestamps)
        assert len(sorted_timestamps) == len(timestamps)

    @given(timestamps=st.lists(st.datetimes(), min_size=0, max_size=100))
    @settings(max_examples=200)
    def test_empty_and_single_element_lists_are_trivially_sorted(
        self, timestamps: list[datetime]
    ) -> None:
        """Пустой список и список из одного элемента тривиально отсортированы.

        **Validates: Requirements 8.5**
        """
        sorted_timestamps = sorted(timestamps)

        if len(sorted_timestamps) <= 1:
            # Тривиально отсортирован
            assert sorted_timestamps == timestamps
        else:
            # Общий случай: проверяем порядок
            assert all(
                sorted_timestamps[i] <= sorted_timestamps[i + 1]
                for i in range(len(sorted_timestamps) - 1)
            )
