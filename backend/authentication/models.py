import uuid
from typing import Any

from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import AbstractBaseUser, Group, PermissionsMixin
from django.contrib.auth.models import UserManager as DefaultUserManager
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import models
from django.db.models.functions import Lower
from django.utils.translation import gettext_lazy as _


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    @classmethod
    def normalize_email(cls, email: str | None) -> str:
        """
        Normalize the email address by stripping whitespace and lowercasing the entire address.
        """
        if not email:
            return ""
        email = email.strip()
        # If it's malformed (no "@"), just lowercase what we have
        try:
            local, domain = email.rsplit("@", 1)
        except ValueError:
            return email.lower()
        return f"{local.lower()}@{domain.lower()}"

    def _create_user(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        **extra_fields: dict[str, Any],
    ) -> "User":
        if not email:
            raise ValueError(_("The Email must be set"))
        if not first_name:
            raise ValueError(_("The First Name must be set"))
        if not last_name:
            raise ValueError(_("The Last Name must be set"))

        email = self.normalize_email(email)

        user = self.model(
            email=email,
            first_name=first_name,
            last_name=last_name,
            **extra_fields,
        )
        user.password = make_password(password)
        user.save(using=self._db)
        return user

    def create_user(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        **extra_fields: Any,
    ) -> "User":
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, first_name, last_name, **extra_fields)

    def create_superuser(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        **extra_fields: Any,
    ) -> "User":
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("email_verified", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError(_("Superuser must have is_staff=True."))
        if extra_fields.get("is_superuser") is not True:
            raise ValueError(_("Superuser must have is_superuser=True."))

        return self._create_user(email, password, first_name, last_name, **extra_fields)

    with_perm = DefaultUserManager.with_perm


class User(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(
        verbose_name=_("email address"),
        error_messages={
            "unique": _("A user with that email already exists."),
        },
        unique=True,
        help_text=_("Required. 150 characters or fewer. Please enter a valid email address."),
        validators=[validate_email],
    )
    first_name = models.CharField(verbose_name=_("first name"), max_length=150, blank=False)
    last_name = models.CharField(verbose_name=_("last name"), max_length=150, blank=False)
    is_staff = models.BooleanField(
        verbose_name=_("staff status"),
        default=False,
        help_text=_("Designates whether the user can log into this admin site."),
    )
    is_active = models.BooleanField(
        verbose_name=_("active"),
        default=True,
        help_text=_(
            "Designates whether this user should be treated as active. "
            "Unselect this instead of deleting accounts."
        ),
    )
    date_joined = models.DateTimeField(verbose_name=_("date joined"), auto_now_add=True)
    email_verified = models.BooleanField(
        verbose_name=_("email verified"),
        default=False,
        help_text=_("Designates whether the user has verified their email address."),
    )
    verification_token = models.UUIDField(
        verbose_name=_("verification token"),
        default=uuid.uuid4,
        editable=False,
    )
    last_verification_email_sent = models.DateTimeField(
        verbose_name=_("last verification email sent"),
        null=True,
        blank=True,
    )
    password_reset_token = models.UUIDField(
        verbose_name=_("password reset token"),
        null=True,
        blank=True,
        editable=False,
    )
    password_reset_token_created = models.DateTimeField(
        verbose_name=_("password reset token created"),
        null=True,
        blank=True,
    )
    ebay_account_not_yet_linked_email_sent = models.BooleanField(
        default=False, verbose_name="Ebay Account Not Yet Linked Email Sent"
    )

    objects = UserManager()

    EMAIL_FIELD: str = "email"
    USERNAME_FIELD: str = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                name="user_unique_email_ci",
            ),
        ]

    def clean(self) -> None:
        super().clean()
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email)

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name

    def email_user(
        self, subject: str, message: str, from_email: str | None = None, **kwargs: Any
    ) -> None:
        send_mail(subject, message, from_email, [self.email], **kwargs)

    def generate_verification_token(self) -> uuid.UUID:
        verification_token = uuid.uuid4()
        return verification_token


class CustomGroup(Group):
    class Meta:
        proxy = True
        app_label = "authentication"
        verbose_name = _("group")
        verbose_name_plural = _("groups")


# Import passkey models so they are registered with Django
from authentication.passkeys.models import Passkey, PasskeyChallenge  # noqa: F401

# Import session models so they are registered with Django
from authentication.sessions.models import UserSession  # noqa: F401

# Import 2FA models so they are registered with Django
from authentication.twofactor.models import RecoveryCode, TwoFactorChallenge, TwoFactorMethod  # noqa: F401
