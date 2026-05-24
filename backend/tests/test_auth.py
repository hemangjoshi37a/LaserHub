"""
Comprehensive tests for Authentication API endpoints
"""

import pytest
from fastapi import status


class TestUserRegistration:
    """Test user registration endpoint"""

    @pytest.mark.asyncio
    async def test_register_success(self, client, db_session):
        """Test successful user registration"""
        register_data = {
            "email": "newuser@example.com",
            "password": "StrongPass123!",
            "name": "New User"
        }

        response = await client.post("/api/auth/register", json=register_data)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == register_data["email"]
        assert data["name"] == register_data["name"]
        assert "hashed_password" not in data  # Password should not be returned

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client, test_user):
        """Test registration with duplicate email"""
        register_data = {
            "email": test_user.email,  # Already exists
            "password": "StrongPass123!",
            "name": "Another User"
        }

        response = await client.post("/api/auth/register", json=register_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "email already registered" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client):
        """Test registration with invalid email"""
        register_data = {
            "email": "not-an-email",
            "password": "StrongPass123!",
            "name": "Test User"
        }

        response = await client.post("/api/auth/register", json=register_data)

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    @pytest.mark.asyncio
    async def test_register_weak_password(self, client):
        """Test registration with weak password"""
        register_data = {
            "email": "test@example.com",
            "password": "weak",
            "name": "Test User"
        }

        response = await client.post("/api/auth/register", json=register_data)

        # UserCreate.password now enforces an 8-character minimum, so a 4-char
        # password ("weak") is rejected at validation time with 422.
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUserLogin:
    """Test user login endpoint"""

    @pytest.mark.asyncio
    async def test_login_success(self, client, test_user):
        """Test successful login"""
        login_data = {
            "username": test_user.email,
            "password": "testpass123"
        }

        response = await client.post("/api/auth/login", data=login_data)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, client, test_user):
        """Test login with invalid credentials"""
        login_data = {
            "username": test_user.email,
            "password": "wrongpassword"
        }

        response = await client.post("/api/auth/login", data=login_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client):
        """Test login with non-existent user"""
        login_data = {
            "username": "nonexistent@example.com",
            "password": "anypassword"
        }

        response = await client.post("/api/auth/login", data=login_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_login_unverified_user(self, client, db_session):
        """Test login with unverified user"""
        # Create unverified user
        from app.core.security import get_password_hash
        from app.models import User

        unverified_user = User(
            email="unverified@example.com",
            name="Unverified User",
            hashed_password=get_password_hash("testpass123"),
            is_verified=False
        )
        db_session.add(unverified_user)
        await db_session.commit()

        login_data = {
            "username": "unverified@example.com",
            "password": "testpass123"
        }

        response = await client.post("/api/auth/login", data=login_data)

        # Should still allow login, verification is separate concern
        assert response.status_code == status.HTTP_200_OK


class TestEmailVerification:
    """Test email verification endpoints"""

    @pytest.mark.asyncio
    async def test_verify_email_success(self, client, db_session):
        """Test successful email verification"""
        # Create unverified user
        from app.core.security import get_password_hash
        from app.models import User

        user = User(
            email="verify@example.com",
            name="Verify User",
            hashed_password=get_password_hash("testpass123"),
            is_verified=False,
            verification_token="test_token_123"
        )
        db_session.add(user)
        await db_session.commit()

        response = await client.post("/api/auth/verify", json={
            "token": "test_token_123"
        })

        assert response.status_code == status.HTTP_200_OK

        # Verify user is now verified
        await db_session.refresh(user)
        assert user.is_verified is True
        assert user.verification_token is None

    @pytest.mark.asyncio
    async def test_verify_email_invalid_token(self, client, db_session):
        """Test email verification with invalid token"""
        # Create unverified user
        from app.core.security import get_password_hash
        from app.models import User

        user = User(
            email="verify@example.com",
            name="Verify User",
            hashed_password=get_password_hash("testpass123"),
            is_verified=False,
            verification_token="test_token_123"
        )
        db_session.add(user)
        await db_session.commit()

        response = await client.post("/api/auth/verify", json={
            "token": "wrong_token"
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # NOTE: test_resend_verification was removed. The current auth API exposes
    # no "/resend-verification" endpoint (or any analogue), so there is no
    # equivalent behavior to exercise. See agent report.


class TestPasswordReset:
    """Test password reset functionality"""

    @pytest.mark.asyncio
    async def test_request_password_reset(self, client, test_user):
        """Test requesting password reset"""
        response = await client.post("/api/auth/password-reset-request", json={
            "email": test_user.email
        })

        # Should always return success (security best practice)
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_request_password_reset_nonexistent_user(self, client):
        """Test password reset for non-existent user"""
        response = await client.post("/api/auth/password-reset-request", json={
            "email": "nonexistent@example.com"
        })

        # Should still return success (don't reveal if user exists)
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_reset_password_success(self, client, test_user, db_session):
        """Test successful password reset"""
        # The current User model tracks only ``reset_token`` (no expiry column),
        # and the confirm route is ``/password-reset-confirm``.
        test_user.reset_token = "reset_token_123"
        await db_session.commit()

        response = await client.post("/api/auth/password-reset-confirm", json={
            "token": "reset_token_123",
            "new_password": "NewStrongPass456!"
        })

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_reset_password_invalid_token(self, client, test_user):
        """Test password reset with invalid token"""
        response = await client.post("/api/auth/password-reset-confirm", json={
            "token": "invalid_token",
            "new_password": "NewStrongPass456!"
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    # NOTE: test_reset_password_expired_token was removed. The current User
    # model has no ``reset_token_expiry`` column and confirm_password_reset
    # performs no expiry check, so reset-token expiration is not implemented
    # and there is no equivalent behavior to assert. See agent report.

    @pytest.mark.asyncio
    async def test_reset_password_weak_password(self, client, test_user, db_session):
        """Test password reset rejects a weak (too-short) password"""
        test_user.reset_token = "reset_token_123"
        await db_session.commit()

        response = await client.post("/api/auth/password-reset-confirm", json={
            "token": "reset_token_123",
            "new_password": "weak"
        })

        # PasswordResetConfirm.new_password enforces an 8-character minimum,
        # so a short password is rejected with 422.
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestAuthenticatedEndpoints:
    """Test endpoints requiring authentication"""

    @pytest.mark.asyncio
    async def test_get_profile_authenticated(self, authenticated_client, test_user):
        """Test getting profile with authentication"""
        # Current route for the authenticated user's profile is ``/me``.
        response = await authenticated_client.get("/api/auth/me")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["name"] == test_user.name

    @pytest.mark.asyncio
    async def test_get_profile_unauthenticated(self, client):
        """Test getting profile without authentication"""
        response = await client.get("/api/auth/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    # NOTE: test_update_profile and test_change_password / _wrong_current were
    # removed. The current auth API exposes no profile-update (PUT /me) and no
    # change-password endpoint, and there is no equivalent route to exercise.
    # See agent report.
