"""Shape and completeness rules for `StorePolicy.content`.

Pure functions, no database: the write service normalises with them and the
public selector re-checks completeness on read, so a row edited outside the
service (shell, migration) still cannot surface as a half-written policy.
"""

from __future__ import annotations

from apps.common.exceptions import BusinessRuleViolationError

# The storefront renders every policy in both languages, so a policy is only
# complete when each piece of text exists in each locale.
POLICY_LOCALES = ("en", "bn")

MAX_TITLE_LENGTH = 200
MAX_INTRO_LENGTH = 5000
MAX_HEADING_LENGTH = 200
MAX_BODY_LENGTH = 10000
MAX_SECTIONS = 30


def _invalid(path: str, message: str) -> BusinessRuleViolationError:
    return BusinessRuleViolationError(f"{path}: {message}", code="invalid_policy_content")


def _localized(value, path: str, max_length: int) -> dict[str, str]:
    if value is None:
        return dict.fromkeys(POLICY_LOCALES, "")
    if not isinstance(value, dict):
        raise _invalid(path, "must be an object keyed by locale.")
    unknown = sorted(set(value) - set(POLICY_LOCALES))
    if unknown:
        raise _invalid(path, f"unsupported locale {unknown[0]!r}; use {', '.join(POLICY_LOCALES)}.")
    result = {}
    for locale in POLICY_LOCALES:
        text = value.get(locale, "")
        if text is None:
            text = ""
        if not isinstance(text, str):
            raise _invalid(f"{path}.{locale}", "must be text.")
        text = text.strip()
        if len(text) > max_length:
            raise _invalid(f"{path}.{locale}", f"must be at most {max_length} characters.")
        result[locale] = text
    return result


def normalize_policy_content(content) -> dict:
    """Validate the shape and return a canonical copy: every localized field
    carries every locale, text is stripped, unknown keys are refused rather
    than stored where nothing would ever render them."""
    if not isinstance(content, dict):
        raise _invalid("content", "must be an object.")
    unknown = sorted(set(content) - {"title", "intro", "sections"})
    if unknown:
        raise _invalid("content", f"unknown field {unknown[0]!r}.")
    sections = content.get("sections") or []
    if not isinstance(sections, list):
        raise _invalid("content.sections", "must be a list.")
    if len(sections) > MAX_SECTIONS:
        raise _invalid("content.sections", f"at most {MAX_SECTIONS} sections.")
    normalized_sections = []
    for index, section in enumerate(sections):
        path = f"content.sections[{index}]"
        if not isinstance(section, dict):
            raise _invalid(path, "must be an object.")
        extra = sorted(set(section) - {"heading", "body"})
        if extra:
            raise _invalid(path, f"unknown field {extra[0]!r}.")
        normalized_sections.append(
            {
                "heading": _localized(
                    section.get("heading"), f"{path}.heading", MAX_HEADING_LENGTH
                ),
                "body": _localized(section.get("body"), f"{path}.body", MAX_BODY_LENGTH),
            }
        )
    return {
        "title": _localized(content.get("title"), "content.title", MAX_TITLE_LENGTH),
        "intro": _localized(content.get("intro"), "content.intro", MAX_INTRO_LENGTH),
        "sections": normalized_sections,
    }


def _blank_locales(value, path: str) -> list[str]:
    value = value if isinstance(value, dict) else {}
    return [
        f"{path}.{locale}"
        for locale in POLICY_LOCALES
        if not isinstance(value.get(locale), str) or not value[locale].strip()
    ]


def missing_policy_fields(content) -> list[str]:
    """Paths that must be filled before the policy may be published. The intro
    is optional, but if written in one language it must exist in the other —
    otherwise one audience reads terms the other never sees."""
    content = content if isinstance(content, dict) else {}
    missing = _blank_locales(content.get("title"), "content.title")
    intro = content.get("intro") if isinstance(content.get("intro"), dict) else {}
    if any(isinstance(text, str) and text.strip() for text in intro.values()):
        missing += _blank_locales(intro, "content.intro")
    sections = content.get("sections")
    if not isinstance(sections, list) or not sections:
        missing.append("content.sections")
        return missing
    for index, section in enumerate(sections):
        section = section if isinstance(section, dict) else {}
        missing += _blank_locales(section.get("heading"), f"content.sections[{index}].heading")
        missing += _blank_locales(section.get("body"), f"content.sections[{index}].body")
    return missing
