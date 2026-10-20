"""
Auth Service REST API views.

This module provides centralized authentication endpoints for the auth service
at auth.techwiki.co.uk. It handles:

- User login (password + passkey)
- User registration
- Email verification
- Password reset
- 2FA management
- Passkey management
- Session management

All endpoints are REST-based using Django Ninja, designed to work with
session cookies on the .techwiki.co.uk domain.
"""

import hashlib
import logging
import secrets
import uuid
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db import transaction
from django.http import HttpRequest
from django.middleware.csrf import get_token
from django.utils import timezone
from ninja import Router, Schema

from authentication.email_service import send_password_reset_email
from authentication.email_service import send_verification_email as send_graph_verification_email
from authentication.passkeys.models import Passkey, PasskeyAuthenticationLog, PasskeyChallenge
from authentication.passkeys.utils import (
    base64url_to_bytes,
    bytes_to_base64url,
    create_authentication_options,
    create_registration_options,
    generate_challenge,
)
from authentication.passkeys.verification import (
    VerificationError,
    verify_authentication,
    verify_registration,
)
from authentication.ratelimit import (
    check_rate_limit_for_request,
    record_failed_attempt,
    reset_rate_limit,
)
from authentication.sessions.utils import create_user_session
from authentication.twofactor.models import RecoveryCode, TwoFactorChallenge, TwoFactorMethod
from authentication.twofactor.totp import verify_totp
from authentication.twofactor.utils import create_2fa_challenge, is_2fa_enabled

logger = logging.getLogger(__name__)

User = get_user_model()

auth_service_router = Router(tags=["auth-service"])


# ============================================================================
# Request/Response Schemas
# ============================================================================


class LoginRequest(Schema):
    """Login request schema."""

    email: str
    password: str


class RegisterRequest(Schema):
    """Registration request schema."""

    email: str
    password: str
    first_name: str
    last_name: str
    referral: str | None = None


class VerifyEmailRequest(Schema):
    """Email verification request schema."""

    token: str


class ResendVerificationRequest(Schema):
    """Resend verification request schema."""

    email: str


class Verify2FARequest(Schema):
    """2FA verification request schema."""

    challenge_token: str
    code: str
    is_recovery_code: bool = False


class ChangePasswordRequest(Schema):
    """Change password request schema."""

    current_password: str
    new_password: str


class ForgotPasswordRequest(Schema):
    """Forgot password request schema."""

    email: str


class ResetPasswordRequest(Schema):
    """Reset password request schema."""

    token: str
    new_password: str


class BeginPasskeyRegistrationRequest(Schema):
    """Begin passkey registration request schema."""

    passkey_name: str


class CompletePasskeyRequest(Schema):
    """Complete passkey registration/authentication request schema."""

    credential: dict[str, Any]


class PasskeyActionRequest(Schema):
    """Passkey action request schema (delete/rename)."""

    passkey_id: str
    new_name: str | None = None


class Begin2FASetupRequest(Schema):
    """Begin 2FA setup request schema."""


class Confirm2FASetupRequest(Schema):
    """Confirm 2FA setup request schema."""

    code: str


class Disable2FARequest(Schema):
    """Disable 2FA request schema."""

    password: str


class RegenerateRecoveryCodesRequest(Schema):
    """Regenerate recovery codes request schema."""

    password: str


# ============================================================================
# Helper Functions
# ============================================================================


def transform_user_response(user: Any) -> dict[str, Any]:
    """Transform a user model to a response dict."""
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email_verified": user.email_verified,
        "has_2fa_enabled": is_2fa_enabled(user),
        "has_passkeys": Passkey.objects.filter(user=user).exists(),
    }


def send_verification_email(user: Any) -> None:
    """Send an email verification message through Microsoft Graph."""
    send_graph_verification_email(user)


# ============================================================================
# Authentication Endpoints
# ============================================================================


def _get_client_ip(request: HttpRequest) -> str:
    """Extract client IP from request for rate limiting."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


@auth_service_router.post("/login", response={200: dict, 429: dict})
def auth_login(request: HttpRequest, data: LoginRequest) -> tuple[int, dict[str, Any]]:
    """
    Login with email and password.

    Returns success with user data, or requires_2fa if 2FA is enabled.
    Rate limited to prevent brute force attacks.
    """
    logger.info("Login attempt for %s", data.email)
    client_ip = _get_client_ip(request)

    # Check rate limits
    ip_allowed, ip_msg, ip_retry = check_rate_limit_for_request(request, "login_ip", client_ip)
    if not ip_allowed:
        return 429, {
            "success": False,
            "message": ip_msg,
            "retry_after": ip_retry,
            "code": "rate_limit_exceeded",
        }

    account_allowed, account_msg, account_retry = check_rate_limit_for_request(
        request, "login_account", data.email.lower()
    )
    if not account_allowed:
        return 429, {
            "success": False,
            "message": account_msg,
            "retry_after": account_retry,
            "code": "rate_limit_exceeded",
        }

    try:
        user = authenticate(request, username=data.email, password=data.password)

        if user is None:
            candidate = User.objects.filter(email__iexact=data.email.strip()).first()
            if candidate and candidate.check_password(data.password):
                if not candidate.is_active:
                    return 200, {
                        "success": False,
                        "message": "This account has been deactivated.",
                    }
                if not candidate.email_verified:
                    return 200, {
                        "success": False,
                        "code": "email_not_verified",
                        "message": "Verify your email address before signing in.",
                    }

            # Record only genuinely invalid credentials as failed attempts
            record_failed_attempt("login_ip", client_ip)
            record_failed_attempt("login_account", data.email.lower())
            return 200, {
                "success": False,
                "message": "The username and password entered are incorrect.",
            }

        if not user.is_active:
            return 200, {
                "success": False,
                "message": "This account has been deactivated.",
            }

        # Check if 2FA is enabled
        if is_2fa_enabled(user):
            token = create_2fa_challenge(user, request)
            return 200, {
                "success": True,
                "requires2fa": True,
                "challengeToken": token,
                "message": "Two-factor authentication is required",
            }

        # Log the user in
        logger.info("[LOGIN] About to call Django login function")
        login(request, user)
        logger.info("[LOGIN] Django login function completed")
        logger.info("[LOGIN] About to get/set CSRF token")
        get_token(request)
        logger.info("[LOGIN] CSRF token obtained")

        # Create session record for device tracking
        logger.info("[LOGIN] About to create user session")
        create_user_session(user, request, auth_method="password")
        logger.info("[LOGIN] User session created")

        # Reset rate limits on successful login
        logger.info("[LOGIN] Resetting rate limits")
        reset_rate_limit("login_ip", client_ip)
        reset_rate_limit("login_account", data.email.lower())
        logger.info("[LOGIN] Rate limits reset")

        logger.info("[LOGIN] Preparing response")
        return 200, {
            "success": True,
            "user": transform_user_response(user),
            "message": "Login successful",
        }

    except Exception as e:
        logger.error("Login error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during login.",
        }


@auth_service_router.post("/logout", response={200: dict})
def auth_logout(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Logout and clear session."""
    try:
        # Delete the session record
        session_key = request.session.session_key
        if session_key and request.user.is_authenticated:
            from authentication.sessions.models import UserSession

            UserSession.objects.filter(session_key=session_key).delete()

        logout(request)
        return 200, {
            "success": True,
            "message": "Logout successful",
        }
    except Exception as e:
        logger.error("Logout error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during logout.",
        }


@auth_service_router.get("/me", response={200: dict})
def get_current_user(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get current authenticated user info."""
    if not request.user.is_authenticated:
        return 200, {
            "success": False,
            "message": "Not authenticated",
        }

    return 200, {
        "success": True,
        "user": transform_user_response(request.user),
    }


# ============================================================================
# Registration & Email Verification
# ============================================================================


@auth_service_router.post("/register", response={200: dict, 429: dict})
def auth_register(request: HttpRequest, data: RegisterRequest) -> tuple[int, dict[str, Any]]:
    """Register a new user account. Rate limited to prevent abuse."""
    # Check rate limit
    client_ip = _get_client_ip(request)
    allowed, msg, retry = check_rate_limit_for_request(request, "register", client_ip)
    if not allowed:
        return 429, {
            "success": False,
            "message": msg,
            "retry_after": retry,
            "code": "rate_limit_exceeded",
        }

    try:
        # Validate email doesn't already exist
        if User.objects.filter(email__iexact=data.email.strip()).exists():
            return 200, {
                "success": False,
                "message": "An account with this email already exists.",
            }

        # Validate password strength
        if len(data.password) < 12:
            return 200, {
                "success": False,
                "message": "Password must be at least 12 characters.",
            }

        # Create user
        with transaction.atomic():
            user = User.objects.create_user(
                email=data.email.strip().lower(),
                password=data.password,
                first_name=data.first_name.strip(),
                last_name=data.last_name.strip(),
            )
            user.verification_token = uuid.uuid4()
            user.last_verification_email_sent = timezone.now()
            user.save(update_fields=["verification_token", "last_verification_email_sent"])

            # Log referral if provided (will be added to Stripe customer metadata later)
            if data.referral:
                logger.info("User %s signed up with referral: %s", user.email, data.referral)

            # Send verification email
            try:
                send_verification_email(user)
            except Exception as e:
                logger.error("Failed to send verification email: %s", str(e))
                # Continue - user can request a new email later

        return 200, {
            "success": True,
            "message": "Account created. Please check your email to verify your account.",
        }

    except Exception as e:
        logger.error("Registration error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during registration.",
        }


@auth_service_router.post("/verify-email", response={200: dict})
def verify_email(request: HttpRequest, data: VerifyEmailRequest) -> tuple[int, dict[str, Any]]:
    """Verify email with token."""
    try:
        user = User.objects.get(verification_token=data.token)

        if user.email_verified:
            return 200, {
                "success": True,
                "message": "Email already verified.",
            }

        user.email_verified = True
        user.save()

        # Log the user in after verification
        login(request, user)
        get_token(request)

        return 200, {
            "success": True,
            "message": "Email verified successfully.",
            "user": transform_user_response(user),
        }

    except User.DoesNotExist:
        return 200, {
            "success": False,
            "message": "Invalid verification link.",
        }
    except Exception as e:
        logger.error("Email verification error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during verification.",
        }


@auth_service_router.post("/resend-verification", response={200: dict, 429: dict})
def resend_verification_email(
    request: HttpRequest,
    data: ResendVerificationRequest,
) -> tuple[int, dict[str, Any]]:
    """Issue a fresh token and resend verification without revealing account existence."""
    client_ip = _get_client_ip(request)
    ip_allowed, ip_message, ip_retry = check_rate_limit_for_request(
        request, "resend_verification", client_ip
    )
    email_allowed, email_message, email_retry = check_rate_limit_for_request(
        request, "resend_verification", data.email.strip().lower()
    )
    if not ip_allowed or not email_allowed:
        return 429, {
            "success": False,
            "message": ip_message if not ip_allowed else email_message,
            "retry_after": ip_retry if not ip_allowed else email_retry,
            "code": "rate_limit_exceeded",
        }

    user = User.objects.filter(email__iexact=data.email.strip()).first()
    if user and not user.email_verified:
        user.verification_token = uuid.uuid4()
        user.last_verification_email_sent = timezone.now()
        user.save(update_fields=["verification_token", "last_verification_email_sent"])
        try:
            send_verification_email(user)
        except Exception:
            logger.exception("Failed to resend verification email for user %s", user.id)

    return 200, {
        "success": True,
        "message": "If an unverified account exists, a verification email has been sent.",
    }


# ============================================================================
# 2FA Endpoints
# ============================================================================


@auth_service_router.post("/2fa/verify", response={200: dict, 429: dict})
def verify_2fa(request: HttpRequest, data: Verify2FARequest) -> tuple[int, dict[str, Any]]:
    """Verify 2FA code during login. Rate limited to prevent brute force."""
    # Check rate limit
    client_ip = _get_client_ip(request)
    allowed, msg, retry = check_rate_limit_for_request(request, "2fa_verify", client_ip)
    if not allowed:
        return 429, {
            "success": False,
            "message": msg,
            "retry_after": retry,
            "code": "rate_limit_exceeded",
        }

    try:
        # Find the challenge
        challenge = TwoFactorChallenge.objects.filter(
            challenge_token=data.challenge_token,
            created_at__gt=timezone.now() - timedelta(minutes=10),
        ).first()

        if not challenge:
            return 200, {
                "success": False,
                "message": "Challenge expired. Please try again.",
            }

        user = challenge.user

        if not user.email_verified:
            challenge.delete()
            return 200, {
                "success": False,
                "code": "email_not_verified",
                "message": "Verify your email address before signing in.",
            }

        if data.is_recovery_code:
            # Verify recovery code
            code_hash = hashlib.sha256(data.code.upper().replace("-", "").encode()).hexdigest()
            recovery_code = RecoveryCode.objects.filter(
                user=user,
                code_hash=code_hash,
                is_used=False,
            ).first()

            if not recovery_code:
                record_failed_attempt("2fa_verify", client_ip)
                return 200, {
                    "success": False,
                    "message": "Invalid recovery code.",
                }

            # Mark as used
            recovery_code.is_used = True
            recovery_code.used_at = timezone.now()
            recovery_code.save()
        else:
            # Verify TOTP code
            totp_method = TwoFactorMethod.objects.filter(
                user=user,
                method_type="totp",
                is_verified=True,
            ).first()

            if not totp_method:
                return 200, {
                    "success": False,
                    "message": "2FA is not configured.",
                }

            if not verify_totp(totp_method.secret, data.code):
                record_failed_attempt("2fa_verify", client_ip)
                return 200, {
                    "success": False,
                    "message": "Invalid verification code.",
                }

            # Update last used
            totp_method.last_used_at = timezone.now()
            totp_method.save()

        # Delete the challenge
        challenge.delete()

        # Log the user in
        login(request, user)
        get_token(request)

        # Create session record for device tracking
        create_user_session(user, request, auth_method="2fa")

        # Reset rate limit on success
        reset_rate_limit("2fa_verify", client_ip)

        return 200, {
            "success": True,
            "user": transform_user_response(user),
            "message": "Verification successful.",
        }

    except Exception as e:
        logger.error("2FA verification error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during verification.",
        }


@auth_service_router.get("/2fa/status", response={200: dict})
def get_2fa_status(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get 2FA status for current user."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    enabled = is_2fa_enabled(request.user)
    recovery_remaining = (
        RecoveryCode.objects.filter(
            user=request.user,
            is_used=False,
        ).count()
        if enabled
        else 0
    )

    return 200, {
        "success": True,
        "enabled": enabled,
        "recoveryCodesRemaining": recovery_remaining,
    }


@auth_service_router.post("/2fa/setup", response={200: dict})
def begin_2fa_setup(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Begin 2FA setup - generate secret and QR code."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        import base64

        # Generate a new secret
        secret = base64.b32encode(secrets.token_bytes(20)).decode("utf-8")

        # Create or update TOTP method (unverified)
        _totp_method, _ = TwoFactorMethod.objects.update_or_create(
            user=request.user,
            method_type="totp",
            defaults={
                "secret": secret,
                "is_verified": False,
                "name": "Authenticator App",
            },
        )

        # Generate otpauth URI for QR code
        issuer = "TechWiki"
        account_name = request.user.email
        qr_uri = f"otpauth://totp/{issuer}:{account_name}?secret={secret}&issuer={issuer}"

        return 200, {
            "success": True,
            "secret": secret,
            "qrCodeUri": qr_uri,
        }

    except Exception as e:
        logger.error("2FA setup error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during setup.",
        }


@auth_service_router.post("/2fa/confirm", response={200: dict})
def confirm_2fa_setup(
    request: HttpRequest, data: Confirm2FASetupRequest
) -> tuple[int, dict[str, Any]]:
    """Confirm 2FA setup with verification code."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        totp_method = TwoFactorMethod.objects.filter(
            user=request.user,
            method_type="totp",
            is_verified=False,
        ).first()

        if not totp_method:
            return 200, {
                "success": False,
                "message": "No pending 2FA setup found.",
            }

        # Verify the code
        if not verify_totp(totp_method.secret, data.code):
            return 200, {
                "success": False,
                "message": "Invalid verification code.",
            }

        # Mark as verified
        totp_method.is_verified = True
        totp_method.is_primary = True
        totp_method.save()

        # Generate recovery codes
        recovery_codes = []
        for _ in range(10):
            code = RecoveryCode.generate_code()
            code_hash = hashlib.sha256(code.replace("-", "").encode()).hexdigest()
            RecoveryCode.objects.create(
                user=request.user,
                code_hash=code_hash,
            )
            recovery_codes.append(code)

        return 200, {
            "success": True,
            "message": "2FA enabled successfully.",
            "recoveryCodes": recovery_codes,
        }

    except Exception as e:
        logger.error("2FA confirmation error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred during confirmation.",
        }


@auth_service_router.post("/2fa/disable", response={200: dict})
def disable_2fa(request: HttpRequest, data: Disable2FARequest) -> tuple[int, dict[str, Any]]:
    """Disable 2FA (requires password confirmation)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        # Verify password
        if not request.user.check_password(data.password):
            return 200, {
                "success": False,
                "message": "Incorrect password.",
            }

        # Delete 2FA methods and recovery codes
        TwoFactorMethod.objects.filter(user=request.user).delete()
        RecoveryCode.objects.filter(user=request.user).delete()

        return 200, {
            "success": True,
            "message": "2FA disabled successfully.",
        }

    except Exception as e:
        logger.error("2FA disable error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.post("/2fa/recovery-codes", response={200: dict})
def regenerate_recovery_codes(
    request: HttpRequest, data: RegenerateRecoveryCodesRequest
) -> tuple[int, dict[str, Any]]:
    """Regenerate recovery codes (requires password confirmation)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        # Verify password
        if not request.user.check_password(data.password):
            return 200, {
                "success": False,
                "message": "Incorrect password.",
            }

        # Delete existing recovery codes
        RecoveryCode.objects.filter(user=request.user).delete()

        # Generate new recovery codes
        recovery_codes = []
        for _ in range(10):
            code = RecoveryCode.generate_code()
            code_hash = hashlib.sha256(code.replace("-", "").encode()).hexdigest()
            RecoveryCode.objects.create(
                user=request.user,
                code_hash=code_hash,
            )
            recovery_codes.append(code)

        return 200, {
            "success": True,
            "message": "Recovery codes regenerated.",
            "recoveryCodes": recovery_codes,
        }

    except Exception as e:
        logger.error("Recovery codes regeneration error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


# ============================================================================
# Password Management
# ============================================================================


@auth_service_router.post("/change-password", response={200: dict})
def change_password(
    request: HttpRequest, data: ChangePasswordRequest
) -> tuple[int, dict[str, Any]]:
    """Change password for authenticated user."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        # Verify current password
        if not request.user.check_password(data.current_password):
            return 200, {
                "success": False,
                "message": "Current password is incorrect.",
            }

        # Validate new password
        if len(data.new_password) < 12:
            return 200, {
                "success": False,
                "message": "Password must be at least 12 characters.",
            }

        # Set new password
        request.user.set_password(data.new_password)
        request.user.save()

        # Re-login to refresh session
        login(request, request.user)

        return 200, {
            "success": True,
            "message": "Password changed successfully.",
        }

    except Exception as e:
        logger.error("Change password error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.post("/forgot-password", response={200: dict, 429: dict})
def forgot_password(
    request: HttpRequest, data: ForgotPasswordRequest
) -> tuple[int, dict[str, Any]]:
    """Request password reset email. Rate limited to prevent abuse."""
    # Check rate limits (both IP and email)
    client_ip = _get_client_ip(request)
    ip_allowed, ip_msg, ip_retry = check_rate_limit_for_request(
        request, "password_reset_ip", client_ip
    )
    if not ip_allowed:
        return 429, {
            "success": False,
            "message": ip_msg,
            "retry_after": ip_retry,
            "code": "rate_limit_exceeded",
        }

    email_allowed, email_msg, email_retry = check_rate_limit_for_request(
        request, "password_reset_email", data.email.lower()
    )
    if not email_allowed:
        return 429, {
            "success": False,
            "message": email_msg,
            "retry_after": email_retry,
            "code": "rate_limit_exceeded",
        }

    try:
        user = User.objects.filter(email__iexact=data.email.strip()).first()

        if user:
            # Generate reset token (separate from email verification token)
            reset_token = uuid.uuid4()
            user.password_reset_token = reset_token
            user.password_reset_token_created = timezone.now()
            user.save()

            # Send reset email
            auth_frontend_url = getattr(settings, "AUTH_FRONTEND_URL", settings.FRONTEND_URL)
            reset_url = f"{auth_frontend_url}/reset-password/{reset_token}"

            send_password_reset_email(user, reset_url)

        # Always return success to prevent email enumeration
        return 200, {
            "success": True,
            "message": "If an account exists, a reset link has been sent.",
        }

    except Exception as e:
        logger.error("Forgot password error: %s", str(e))
        return 200, {
            "success": True,
            "message": "If an account exists, a reset link has been sent.",
        }


@auth_service_router.post("/reset-password", response={200: dict})
def reset_password(request: HttpRequest, data: ResetPasswordRequest) -> tuple[int, dict[str, Any]]:
    """Reset password with token."""
    try:
        user = User.objects.filter(password_reset_token=data.token).first()

        if not user or not user.password_reset_token_created:
            return 200, {
                "success": False,
                "message": "Invalid or expired reset link.",
            }

        # Check if token has expired (1 hour)
        token_age = timezone.now() - user.password_reset_token_created
        if token_age > timedelta(hours=1):
            return 200, {
                "success": False,
                "message": "Invalid or expired reset link.",
            }

        # Validate new password
        if len(data.new_password) < 12:
            return 200, {
                "success": False,
                "message": "Password must be at least 12 characters.",
            }

        # Set new password
        user.set_password(data.new_password)
        # Invalidate the reset token
        user.password_reset_token = None
        user.password_reset_token_created = None
        user.save()

        return 200, {
            "success": True,
            "message": "Password reset successfully.",
        }

    except Exception as e:
        logger.error("Reset password error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


# ============================================================================
# Passkey Endpoints - Discoverable Credentials
# ============================================================================


@auth_service_router.post("/webauthn/discover-auth", response={200: dict, 429: dict})
def begin_discoverable_auth(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """
    Begin discoverable credential authentication.

    This allows login without entering an email - the authenticator
    provides the user identity via the userHandle.

    SECURITY: Instead of creating unscoped challenges (which could be stolen),
    we scope challenges to the session. The session key is stored with the
    challenge and must match on completion.

    Rate limited to prevent abuse.
    """
    # Check rate limit
    client_ip = _get_client_ip(request)
    allowed, msg, retry = check_rate_limit_for_request(request, "passkey_discover", client_ip)
    if not allowed:
        return 429, {
            "success": False,
            "message": msg,
            "retry_after": retry,
            "code": "rate_limit_exceeded",
        }

    try:
        # Clean up old challenges
        PasskeyChallenge.objects.filter(
            created_at__lt=timezone.now() - timedelta(minutes=5),
        ).delete()

        # Generate challenge
        challenge = generate_challenge()

        # Get or create session key for scoping
        if not request.session.session_key:
            request.session.create()

        session_key = request.session.session_key

        # Create session-scoped challenge (no user, no email, but tied to session)
        # We store session_key in the email field as a scope identifier
        # This prevents challenge theft between different sessions
        PasskeyChallenge.objects.create(
            user=None,
            email=f"__session__{session_key}",  # Session scope marker
            challenge=challenge,
            challenge_type="authentication",
        )

        # Create authentication options without allowCredentials
        # This triggers the browser to show discoverable credentials
        options = create_authentication_options(
            challenge=challenge,
            allow_credentials=None,  # Empty = discoverable
        )

        return 200, {
            "success": True,
            "options": options,
        }

    except Exception as e:
        logger.error("Discoverable auth begin error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.post("/webauthn/complete-discover-auth", response={200: dict})
def complete_discoverable_auth(
    request: HttpRequest, data: CompletePasskeyRequest
) -> tuple[int, dict[str, Any]]:
    """
    Complete discoverable credential authentication.

    The credential response includes the userHandle, which we use
    to identify the user without them entering an email.

    SECURITY: Challenge must match the session that initiated the ceremony.
    """
    try:
        credential = data.credential

        # Get credential ID
        raw_id = credential.get("rawId") or credential.get("id")
        if not raw_id:
            return 200, {
                "success": False,
                "message": "Invalid credential response.",
            }

        credential_id = base64url_to_bytes(raw_id)

        # Find the passkey
        try:
            passkey = Passkey.objects.select_related("user").get(credential_id=credential_id)
        except Passkey.DoesNotExist:
            PasskeyAuthenticationLog.objects.create(
                user=None,
                event_type="passkey_not_found",
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return 200, {
                "success": False,
                "message": "Passkey not found.",
            }

        user = passkey.user

        if not user.is_active or not user.email_verified:
            return 200, {
                "success": False,
                "code": "email_not_verified" if not user.email_verified else "account_inactive",
                "message": (
                    "Verify your email address before signing in."
                    if not user.email_verified
                    else "This account has been deactivated."
                ),
            }

        # Get session key for challenge lookup
        session_key = request.session.session_key

        # Get the challenge - for discoverable auth, use session-scoped challenge
        # SECURITY FIX: Challenge must be scoped to this session
        challenge_obj = (
            PasskeyChallenge.objects.filter(
                challenge_type="authentication",
                created_at__gt=timezone.now() - timedelta(minutes=5),
                email=f"__session__{session_key}",  # Session scope marker
            )
            .order_by("-created_at")
            .first()
        )

        if not challenge_obj:
            PasskeyAuthenticationLog.objects.create(
                user=user,
                email=user.email,
                event_type="challenge_expired",
                passkey=passkey,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return 200, {
                "success": False,
                "message": "Challenge expired. Please try again.",
            }

        # Verify the authentication
        try:
            verified = verify_authentication(
                credential=credential,
                expected_challenge=bytes(challenge_obj.challenge),
                stored_public_key=bytes(passkey.public_key),
                stored_sign_count=passkey.sign_count,
            )
        except VerificationError as e:
            PasskeyAuthenticationLog.objects.create(
                user=user,
                email=user.email,
                event_type="verification_failed",
                passkey=passkey,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
                error_message=str(e),
            )
            return 200, {
                "success": False,
                "message": "Authentication failed.",
            }

        # Update passkey
        passkey.sign_count = verified["new_sign_count"]
        passkey.last_used_at = timezone.now()
        passkey.save()

        # Clean up challenge
        challenge_obj.delete()

        # Log the user in
        login(request, user)
        get_token(request)

        # Create session record for device tracking
        create_user_session(user, request, auth_method="passkey")

        PasskeyAuthenticationLog.objects.create(
            user=user,
            email=user.email,
            event_type="auth_success",
            passkey=passkey,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )

        return 200, {
            "success": True,
            "user": transform_user_response(user),
            "message": "Authentication successful.",
        }

    except Exception as e:
        logger.error("Discoverable auth complete error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.post("/webauthn/begin-register", response={200: dict})
def begin_passkey_registration(
    request: HttpRequest, data: BeginPasskeyRegistrationRequest
) -> tuple[int, dict[str, Any]]:
    """Begin passkey registration for authenticated user."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        user = request.user

        # Generate challenge
        challenge = generate_challenge()

        # Clean up old challenges
        PasskeyChallenge.objects.filter(
            user=user,
            created_at__lt=timezone.now() - timedelta(minutes=5),
        ).delete()

        # Store challenge
        PasskeyChallenge.objects.create(
            user=user,
            challenge=challenge,
            challenge_type="registration",
        )

        # Get existing credentials to exclude
        existing_passkeys = Passkey.objects.filter(user=user)
        exclude_credentials = [
            {
                "type": "public-key",
                "id": bytes_to_base64url(bytes(pk.credential_id)),
                "transports": pk.transports or [],
            }
            for pk in existing_passkeys
        ]

        # Create registration options with discoverable credentials enabled
        options = create_registration_options(
            user_id=str(user.id),
            user_email=user.email,
            user_name=f"{user.first_name} {user.last_name}",
            challenge=challenge,
            exclude_credentials=exclude_credentials or None,
        )

        # Ensure resident key is required for discoverable credentials
        if "authenticatorSelection" in options:
            options["authenticatorSelection"]["residentKey"] = "required"
            options["authenticatorSelection"]["requireResidentKey"] = True

        # Store passkey name in session
        request.session["pending_passkey_name"] = data.passkey_name

        return 200, {
            "success": True,
            "options": options,
        }

    except Exception as e:
        logger.error("Passkey registration begin error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.post("/webauthn/complete-register", response={200: dict})
def complete_passkey_registration(
    request: HttpRequest, data: CompletePasskeyRequest
) -> tuple[int, dict[str, Any]]:
    """Complete passkey registration."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        user = request.user
        credential = data.credential

        # Get challenge
        challenge_obj = (
            PasskeyChallenge.objects.filter(
                user=user,
                challenge_type="registration",
                created_at__gt=timezone.now() - timedelta(minutes=5),
            )
            .order_by("-created_at")
            .first()
        )

        if not challenge_obj:
            return 200, {
                "success": False,
                "message": "Registration expired. Please try again.",
            }

        # Verify registration
        try:
            verified = verify_registration(
                credential=credential,
                expected_challenge=bytes(challenge_obj.challenge),
            )
        except VerificationError as e:
            logger.error("Passkey registration verification failed: %s", str(e))
            return 200, {
                "success": False,
                "message": "Registration failed.",
            }

        # Get passkey name from session
        passkey_name = request.session.pop("pending_passkey_name", "My Passkey")

        # Create passkey
        passkey = Passkey.objects.create(
            user=user,
            credential_id=verified["credential_id"],
            public_key=verified["public_key"],
            sign_count=verified["sign_count"],
            name=passkey_name,
            device_type=verified.get("device_type", ""),
            backed_up=verified.get("backed_up", False),
            transports=verified.get("transports", []),
        )

        # Clean up challenge
        challenge_obj.delete()

        return 200, {
            "success": True,
            "message": "Passkey registered successfully.",
            "passkey": {
                "id": str(passkey.id),
                "name": passkey.name,
                "deviceType": passkey.device_type,
                "createdAt": passkey.created_at.isoformat(),
                "backedUp": passkey.backed_up,
            },
        }

    except Exception as e:
        logger.error("Passkey registration complete error: %s", str(e))
        return 200, {
            "success": False,
            "message": "An error occurred.",
        }


@auth_service_router.get("/webauthn/passkeys", response={200: dict})
def get_passkeys(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get list of passkeys for authenticated user."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    passkeys = Passkey.objects.filter(user=request.user).order_by("-created_at")

    return 200, {
        "success": True,
        "passkeys": [
            {
                "id": str(pk.id),
                "name": pk.name,
                "deviceType": pk.device_type,
                "createdAt": pk.created_at.isoformat(),
                "lastUsedAt": pk.last_used_at.isoformat() if pk.last_used_at else None,
                "backedUp": pk.backed_up,
            }
            for pk in passkeys
        ],
    }


@auth_service_router.post("/webauthn/delete", response={200: dict})
def delete_passkey(request: HttpRequest, data: PasskeyActionRequest) -> tuple[int, dict[str, Any]]:
    """Delete a passkey."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    try:
        passkey = Passkey.objects.get(id=data.passkey_id, user=request.user)
        passkey.delete()
        return 200, {
            "success": True,
            "message": "Passkey deleted.",
        }
    except Passkey.DoesNotExist:
        return 200, {
            "success": False,
            "message": "Passkey not found.",
        }


@auth_service_router.post("/webauthn/rename", response={200: dict})
def rename_passkey(request: HttpRequest, data: PasskeyActionRequest) -> tuple[int, dict[str, Any]]:
    """Rename a passkey."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    if not data.new_name:
        return 200, {
            "success": False,
            "message": "New name is required.",
        }

    try:
        passkey = Passkey.objects.get(id=data.passkey_id, user=request.user)
        passkey.name = data.new_name
        passkey.save()
        return 200, {
            "success": True,
            "message": "Passkey renamed.",
            "passkey": {
                "id": str(passkey.id),
                "name": passkey.name,
            },
        }
    except Passkey.DoesNotExist:
        return 200, {
            "success": False,
            "message": "Passkey not found.",
        }
