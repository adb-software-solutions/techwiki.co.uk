"""Article status workflow shared by the editor, moderation queue and authoring API."""

from __future__ import annotations

from dataclasses import dataclass

from django.utils import timezone

from apps.wiki.models import Article, ArticleStatus, ModerationLog, WikiUserProfile
from authentication.models import User

PUBLISHABLE_FROM = frozenset(
    {
        ArticleStatus.DRAFT,
        ArticleStatus.PENDING_REVIEW,
        ArticleStatus.CHANGES_REQUESTED,
        ArticleStatus.APPROVED,
    }
)


class WorkflowError(Exception):
    """A transition is not allowed for this article or user."""


@dataclass(frozen=True)
class Transition:
    sources: frozenset[str]
    target: str
    moderator_only: bool = False
    needs_publish_rights: bool = False
    needs_notes: bool = False


TRANSITIONS: dict[str, Transition] = {
    "submit": Transition(
        frozenset({ArticleStatus.DRAFT, ArticleStatus.CHANGES_REQUESTED}),
        ArticleStatus.PENDING_REVIEW,
    ),
    "withdraw": Transition(frozenset({ArticleStatus.PENDING_REVIEW}), ArticleStatus.DRAFT),
    "publish": Transition(PUBLISHABLE_FROM, ArticleStatus.PUBLISHED, needs_publish_rights=True),
    "request_changes": Transition(
        frozenset({ArticleStatus.PENDING_REVIEW}),
        ArticleStatus.CHANGES_REQUESTED,
        moderator_only=True,
        needs_notes=True,
    ),
    "reject": Transition(
        frozenset({ArticleStatus.PENDING_REVIEW}),
        ArticleStatus.DRAFT,
        moderator_only=True,
        needs_notes=True,
    ),
    "unpublish": Transition(
        frozenset({ArticleStatus.PUBLISHED}), ArticleStatus.DRAFT, needs_publish_rights=True
    ),
    "archive": Transition(
        frozenset(ArticleStatus.values) - {ArticleStatus.ARCHIVED}, ArticleStatus.ARCHIVED
    ),
    "restore": Transition(frozenset({ArticleStatus.ARCHIVED}), ArticleStatus.DRAFT),
}
# Approving used to set a separate "approved" status that nothing ever published.
ACTION_ALIASES = {"approve": "publish"}

# Actions that record a moderation decision on the article itself.
MODERATION_DECISIONS = frozenset({"publish", "request_changes", "reject", "unpublish"})


def _profile(user: User) -> WikiUserProfile | None:
    return WikiUserProfile.objects.filter(user=user).first()


def is_moderator(user: User) -> bool:
    if user.is_staff or user.is_superuser:
        return True
    profile = _profile(user)
    return bool(profile and profile.can_moderate)


def can_publish(user: User) -> bool:
    if is_moderator(user):
        return True
    profile = _profile(user)
    return bool(profile and profile.can_publish_directly)


def available_actions(article: Article, user: User) -> list[str]:
    """Actions this user may take on the article now, ignoring note requirements."""
    actions = []
    for action in TRANSITIONS:
        try:
            check_transition(article, action, user, notes="-")
        except WorkflowError:
            continue
        actions.append(action)
    return actions


def check_transition(article: Article, action: str, user: User, notes: str = "") -> str:
    """Return the status the action leads to, or raise WorkflowError."""
    action = ACTION_ALIASES.get(action, action)
    transition = TRANSITIONS.get(action)
    if transition is None:
        raise WorkflowError("Invalid action")

    moderator = is_moderator(user)
    if not moderator and (transition.moderator_only or article.author_id != user.id):
        raise WorkflowError("Permission denied")
    if transition.needs_publish_rights and not can_publish(user):
        raise WorkflowError("Permission denied")
    if article.status not in transition.sources:
        raise WorkflowError(
            f"Cannot {action.replace('_', ' ')} an article that is "
            f"{ArticleStatus(article.status).label.lower()}"
        )
    if transition.needs_notes and not notes.strip():
        raise WorkflowError("A note for the author is required")
    return transition.target


def apply_transition(article: Article, action: str, user: User, notes: str = "") -> str:
    """Move the article to its new status, save it and log the change."""
    new_status = check_transition(article, action, user, notes)
    action = ACTION_ALIASES.get(action, action)
    old_status = article.status
    now = timezone.now()

    article.status = new_status
    update_fields = ["status", "updated_at"]
    if new_status == ArticleStatus.PUBLISHED and not article.published_at:
        article.published_at = now
        update_fields.append("published_at")
    if action in MODERATION_DECISIONS:
        article.moderation_notes = notes.strip()
        article.moderator = user
        article.moderated_at = now
        update_fields += ["moderation_notes", "moderator", "moderated_at"]
    article.save(update_fields=update_fields)

    ModerationLog.objects.create(
        article=article,
        moderator=user,
        action=action,
        old_status=old_status,
        new_status=new_status,
        notes=notes.strip(),
    )
    return new_status
