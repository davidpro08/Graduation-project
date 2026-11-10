"""모델을 로드하지 않고 실제 API의 선택지·확률 계약을 검증한다."""
import copy
import unittest
from jev_server import prepare_row, present_result, LABELS, COORDINATES, OPTION_IDS


class JevContractTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"version": "persona-opinion-v1", "persona": {"id": "a" * 32, "persona": "합성 페르소나"}, "topic": {"proposition": "증빙이 있는 지각은 면제한다"}}
        self.manifest = {"engine_revision": "a" * 40, "brain_revision": "b" * 40}

    def test_each_winning_label_has_canonical_position_and_conditional_score(self):
        row = prepare_row(self.payload)
        for winner in range(5):
            probabilities = [0.1] * 5
            probabilities[winner] = 0.6
            value = present_result(row, {"option_ids": OPTION_IDS, "probabilities": probabilities, "input_tokens": 100, "forward_seconds": 0.25}, self.manifest)
            self.assertEqual(value["personaId"], "a" * 32)
            self.assertEqual(value["opinion"]["agreement"], COORDINATES[winner])
            self.assertEqual(value["opinion"]["opinion"], LABELS[winner])
            self.assertEqual(value["opinion"]["confidence"], 0.6)
            self.assertEqual(value["opinion"]["scoreKind"], "conditional_option_probability")
            self.assertNotIn("answer", value["opinion"])

    def test_invalid_probability_vectors_or_reordered_slots_rejected(self):
        row = prepare_row(self.payload)
        for probabilities in [[0.2] * 4, [0.3] * 5, [float("nan")] * 5, [-0.1, 0.1, 0.2, 0.3, 0.5], [True, 0, 0, 0, 0]]:
            with self.assertRaises(ValueError):
                present_result(row, {"option_ids": OPTION_IDS, "probabilities": probabilities}, self.manifest)
        with self.assertRaises(ValueError):
            present_result(row, {"option_ids": list(reversed(OPTION_IDS)), "probabilities": [0.2] * 5}, self.manifest)

    def test_dynamic_numeric_options(self):
        payload = copy.deepcopy(self.payload)
        payload["version"] = "persona-opinion-v2"
        payload["topic"]["answerSchema"] = {"kind": "numeric", "options": [{"id": "o1", "label": "만원 미만", "min": 0, "max": 10000}, {"id": "o2", "label": "만원 이상", "min": 10000, "max": None}, {"id": "o0", "label": "보류"}]}
        row = prepare_row(payload)
        value = present_result(row, {"option_ids": ["o1", "o2", "o0"], "probabilities": [0.1, 0.8, 0.1], "input_tokens": 100, "forward_seconds": 0.1}, self.manifest)
        self.assertEqual(value["version"], "persona-opinion-v2")
        self.assertEqual(value["opinion"]["optionId"], "o2")
        self.assertNotIn("numericValue", value["opinion"])

    def test_missing_source_and_invalid_requests_rejected(self):
        for field in ["version", "persona", "topic"]:
            payload = copy.deepcopy(self.payload)
            del payload[field]
            with self.assertRaises(ValueError):
                prepare_row(payload)
        for persona in [{"id": "../x", "persona": "합성"}, {"id": "a" * 32, "persona": ""}]:
            with self.assertRaises(ValueError):
                prepare_row({**self.payload, "persona": persona})


if __name__ == "__main__":
    unittest.main()
