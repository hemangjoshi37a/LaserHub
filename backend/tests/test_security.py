"""
Security tests for LaserHub
"""
import calendar
from datetime import datetime, timedelta
from unittest.mock import patch

import jwt
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)


class TestPasswordHashing:
    """Test password hashing and verification"""

    def test_hash_password(self):
        """Test password hashing"""
        password = "test_password_123"
        hashed = get_password_hash(password)

        assert hashed != password
        assert hashed.startswith("$2b$")  # bcrypt format

    def test_verify_correct_password(self):
        """Test verifying correct password"""
        password = "test_password_123"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True

    def test_verify_incorrect_password(self):
        """Test verifying incorrect password"""
        password = "test_password_123"
        hashed = get_password_hash(password)

        assert verify_password("wrong_password", hashed) is False

    def test_verify_empty_password(self):
        """Test verifying empty password"""
        password = "test_password_123"
        hashed = get_password_hash(password)

        assert verify_password("", hashed) is False

    def test_hash_different_passwords_different_hashes(self):
        """Test that different passwords produce different hashes"""
        password1 = "password1"
        password2 = "password2"

        hash1 = get_password_hash(password1)
        hash2 = get_password_hash(password2)

        assert hash1 != hash2

    def test_same_password_different_hashes(self):
        """Test that same password produces different hashes (different salt)"""
        password = "test_password"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)

        assert hash1 != hash2  # Different salts
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True


class TestTokenCreation:
    """Test JWT token creation"""

    def test_create_access_token(self):
        """Test creating access token"""
        data = {"sub": "test@example.com", "user_id": "123"}
        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 0
        assert "." in token  # JWT format: header.payload.signature

    def test_create_access_token_with_expiry(self):
        """Test creating token with custom expiry"""
        data = {"sub": "test@example.com"}
        expires_delta = timedelta(hours=2)
        token = create_access_token(data, expires_delta)

        decoded = decode_access_token(token)
        assert decoded["sub"] == "test@example.com"

    def test_create_refresh_token(self):
        """Test creating refresh token"""
        data = {"sub": "test@example.com", "type": "refresh"}
        token = create_refresh_token(data)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_contains_all_data(self):
        """Test token contains all provided data"""
        data = {
            "sub": "test@example.com",
            "user_id": "123",
            "role": "admin",
            "permissions": ["read", "write"]
        }
        token = create_access_token(data)
        decoded = decode_access_token(token)

        assert decoded["sub"] == "test@example.com"
        assert decoded["user_id"] == "123"
        assert decoded["role"] == "admin"
        assert decoded["permissions"] == ["read", "write"]


class TestTokenValidation:
    """Test JWT token validation"""

    def test_decode_valid_token(self):
        """Test decoding valid token"""
        data = {"sub": "test@example.com"}
        token = create_access_token(data)
        decoded = decode_access_token(token)

        assert decoded["sub"] == "test@example.com"
        assert "exp" in decoded
        assert "iat" in decoded

    def test_decode_expired_token(self):
        """Test decoding expired token"""
        data = {"sub": "test@example.com"}
        expires_delta = timedelta(seconds=-1)  # Already expired
        token = create_access_token(data, expires_delta)

        with pytest.raises(HTTPException) as exc:
            decode_access_token(token)

        assert exc.value.status_code == 401
        assert "expired" in str(exc.value.detail).lower()

    def test_decode_invalid_token(self):
        """Test decoding invalid token"""
        with pytest.raises(HTTPException) as exc:
            decode_access_token("invalid.token.here")

        assert exc.value.status_code == 401

    def test_decode_token_with_wrong_secret(self):
        """Test decoding token with wrong secret"""
        data = {"sub": "test@example.com"}
        token = create_access_token(data)

        # A raw jwt.decode against a different secret fails signature
        # verification and raises PyJWT's InvalidSignatureError (not the app's
        # HTTPException, which is only raised by decode_access_token).
        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(token, "wrong_secret", algorithms=[settings.ALGORITHM])

    def test_decode_malformed_token(self):
        """Test decoding malformed token"""
        test_cases = [
            "",  # Empty string
            "not.a.token",  # Not JWT format
            "header.payload",  # Missing signature
            "header.payload.signature.extra",  # Too many parts
        ]

        for token in test_cases:
            with pytest.raises(HTTPException):
                decode_access_token(token)

    def test_token_tampering_detection(self):
        """Test that tampered token is rejected"""
        data = {"sub": "test@example.com", "role": "user"}
        token = create_access_token(data)

        # Tamper with the token (change payload)
        parts = token.split(".")
        # In real attack, attacker would modify payload and try to re-sign
        # This should fail verification

        with pytest.raises(HTTPException):
            decode_access_token(token + "tampered")


class TestSecurityEdgeCases:
    """Test security edge cases"""

    def test_empty_payload_token(self):
        """Test token with empty payload"""
        token = create_access_token({})
        decoded = decode_access_token(token)

        assert isinstance(decoded, dict)
        assert "exp" in decoded
        assert "iat" in decoded

    def test_token_with_special_characters(self):
        """Test token with special characters in data"""
        data = {
            "sub": "test+special@example.com",
            "name": "Test User with émojis 🎉",
            "description": "Special chars: <>&\"'"
        }
        token = create_access_token(data)
        decoded = decode_access_token(token)

        assert decoded["sub"] == data["sub"]
        assert decoded["name"] == data["name"]
        assert decoded["description"] == data["description"]

    def test_very_long_token_payload(self):
        """Test token with very large payload"""
        data = {
            "sub": "test@example.com",
            "permissions": ["perm_" + str(i) for i in range(1000)]
        }
        token = create_access_token(data)
        decoded = decode_access_token(token)

        assert len(decoded["permissions"]) == 1000

    @patch("app.core.security.datetime")
    def test_token_with_mocked_time(self, mock_datetime):
        """Test token creation with mocked datetime"""
        # create_access_token only calls datetime.utcnow() on the patched
        # module; the timedelta it adds comes from the real top-level import,
        # so only utcnow needs mocking here. (The previous
        # ``mock_datetime.timedelta = datetime.timedelta`` line was a bug:
        # ``datetime`` is the class, which has no ``timedelta`` attribute.)
        mock_datetime.utcnow.return_value = datetime(2024, 1, 1, 0, 0, 0)

        data = {"sub": "test@example.com"}
        token = create_access_token(data, expires_delta=timedelta(hours=1))

        # Decode without expiry verification: with the clock mocked to 2024 the
        # token's exp is in the past relative to the real wall clock, so
        # decode_access_token would (correctly) raise "Token has expired". Here
        # we are asserting that creation honored the mocked clock, not expiry
        # enforcement, so we skip exp verification and check the iat/exp claims.
        decoded = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer="laserhub-api",
            options={"verify_exp": False},
        )

        assert decoded["sub"] == "test@example.com"
        # iat reflects the mocked creation time (2024-01-01 00:00:00 UTC). The
        # app uses datetime.utcnow(), and PyJWT encodes naive datetimes as UTC,
        # so compare against the UTC epoch (calendar.timegm) rather than
        # datetime.timestamp(), which would assume the local timezone.
        assert decoded["iat"] == calendar.timegm(datetime(2024, 1, 1, 0, 0, 0).timetuple())
        # exp is one hour after the mocked creation time
        assert decoded["exp"] == calendar.timegm(datetime(2024, 1, 1, 1, 0, 0).timetuple())

    def test_none_values_in_payload(self):
        """Test handling None values in payload"""
        data = {
            "sub": "test@example.com",
            "optional_field": None
        }
        token = create_access_token(data)
        decoded = decode_access_token(token)

        assert decoded["sub"] == "test@example.com"
        # None values might be dropped by JWT encoding

    def test_numeric_overflow_in_expiry(self):
        """Test very large expiry times"""
        data = {"sub": "test@example.com"}
        expires_delta = timedelta(days=365 * 10)  # 10 years
        token = create_access_token(data, expires_delta)
        decoded = decode_access_token(token)

        assert decoded["sub"] == "test@example.com"
        assert "exp" in decoded
