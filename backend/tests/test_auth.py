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

        assert response.status_code == status.HTTP_200_OK  # Backend doesn't enforce strong passwords yet
        # Could add password strength validation in future


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

        response = await client.post("/api/auth/verify-email", json={
            "email": user.email,
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

        response = await client.post("/api/auth/verify-email", json={
            "email": user.email,
            "token": "wrong_token"
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.asyncio
    async def test_resend_verification(self, client, test_user):
        """Test resending verification email"""
        # Mark user as unverified
        test_user.is_verified = False

        response = await client.post("/api/auth/resend-verification", json={
            "email": test_user.email
        })

        assert response.status_code in [status.HTTP_200_OK, status.HTTP_202_ACCEPTED]


class TestPasswordReset:
    """Test password reset functionality"""

    @pytest.mark.asyncio
    async def test_request_password_reset(self, client, test_user):
        """Test requesting password reset"""
        response = await client.post("/api/auth/request-password-reset", json={
            "email": test_user.email
        })

        # Should always return success (security best practice)
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_request_password_reset_nonexistent_user(self, client):
        """Test password reset for non-existent user"""
        response = await client.post("/api/auth/request-password-reset", json={
            "email": "nonexistent@example.com"
        })

        # Should still return success (don't reveal if user exists)
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_reset_password_success(self, client, test_user, db_session):
        """Test successful password reset"""
        test_user.reset_token = "reset_token_123"
        test_user.reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
        await db_session.commit()

        response = await client.post("/api/auth/reset-password", json={
            "token": "reset_token_123",
            "new_password": "NewStrongPass456!"
        })

        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_reset_password_invalid_token(self, client, test_user):
        """Test password reset with invalid token"""
        response = await client.post("/api/auth/reset-password", json={
            "token": "invalid_token",
            "new_password": "NewStrongPass456!"
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.asyncio
    async def test_reset_password_expired_token(self, client, test_user, db_session):
        """Test password reset with expired token"""
        from datetime import datetime, timedelta

        test_user.reset_token = "reset_token_123"
        test_user.reset_token_expiry = datetime.utcnow() - timedelta(hours=1)
        await db_session.commit()

        response = await client.post("/api/auth/reset-password", json={
            "token": "reset_token_123",
            "new_password": "NewStrongPass456!"
        })

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "expired" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_reset_password_weak_password(self, client, test_user, db_session):
        """Test password reset with weak password"""
        test_user.reset_token = "reset_token_123"
        test_user.reset_token_expiry = datetime.utcnow() + timedelta(hours=1)
        await db_session.commit()

        response = await client.post("/api/auth/reset-password", json={
            "token": "reset_token_123",
            "new_password": "weak"
        })

        # Current implementation doesn't enforce password strength
        assert response.status_code == status.HTTP_200_OK


class TestAuthenticatedEndpoints:
    """Test endpoints requiring authentication"""

    @pytest.mark.asyncio
    async def test_get_profile_authenticated(self, authenticated_client, test_user):
        """Test getting profile with authentication"""
        response = await authenticated_client.get("/api/auth/profile")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["name"] == test_user.name

    @pytest.mark.asyncio
    async def test_get_profile_unauthenticated(self, client):
        """Test getting profile without authentication"""
        response = await client.get("/api/auth/profile")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.asyncio
    async def test_update_profile(self, authenticated_client, test_user):
        """Test updating user profile"""
        update_data = {
            "name": "Updated Name",
            "phone_number": "+1234567890"
        }

        response = await authenticated_client.put("/api/auth/profile", json=update_data)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["phone_number"] == "+1234567890"

    @pytest.mark.asyncio
    async def test_change_password(self, authenticated_client, test_user, db_session):
        """Test changing password"""
        change_data = {
            "current_password": "testpass123",
            "new_password": "NewPassword456!"
        }

        response = await authenticated_client.post("/api/auth/change-password", json=change_data)

        assert response.status_code == status.HTTP_200_OK

        # Verify new password works
        login_data = {
            "username": test_user.email,
            "password": "NewPassword456!"
        }
        login_response = await authenticated_client.post("/api/auth/login", data=login_data)
        assert login_response.status_code == status.HTTP_200_OK

    @pytest.mark.asyncio
    async def test_change_password_wrong_current(self, authenticated_client):
        """Test changing password with wrong current password"""
        change_data = {
            "current_password": "wrong_password",
            "new_password": "NewPassword456!"
        }

        response = await authenticated_client.post("/api/auth/change-password", json=change_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
