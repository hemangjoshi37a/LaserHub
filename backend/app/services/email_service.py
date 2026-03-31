import os
from datetime import datetime
from email.message import EmailMessage
from typing import Any, Dict, Optional

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

# Setup jinja2 environment for email templates
templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "templates", "email")
env = Environment(
    loader=FileSystemLoader(templates_dir),
    autoescape=select_autoescape(['html', 'xml'])
)

class EmailService:
    @staticmethod
    async def send_email(
        to_email: str,
        subject: str,
        template_name: str,
        template_data: Dict[str, Any]
    ) -> bool:
        """
        Generic method to send an email using a template.
        """
        try:
            # Add common data to templates
            template_data["year"] = datetime.now().year

            # Render template
            template = env.get_template(template_name)
            html_content = template.render(**template_data)

            # Create message
            message = EmailMessage()
            message["From"] = settings.SMTP_FROM_EMAIL
            message["To"] = to_email
            message["Subject"] = subject
            message.set_content("Please use an HTML compatible email client to view this message.")
            message.add_alternative(html_content, subtype="html")

            # Send email
            if settings.SMTP_SERVER == "mock" or not settings.SMTP_SERVER:
                print(f"MOCK EMAIL SENT to {to_email}: {subject}")
                # In a real app, you might log this to a file or a mock service
                return True

            await aiosmtplib.send(
                message,
                hostname=settings.SMTP_SERVER,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=settings.SMTP_TLS,
            )
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False

    @classmethod
    async def send_verification_email(
        cls,
        to_email: str,
        name: str,
        token: str
    ) -> bool:
        verification_url = f"{settings.FRONTEND_URL}/verify?token={token}"
        return await cls.send_email(
            to_email=to_email,
            subject="Verify your LaserHub email",
            template_name="verification.html",
            template_data={
                "name": name,
                "verification_url": verification_url
            }
        )

    @classmethod
    async def send_password_reset(
        cls,
        to_email: str,
        token: str
    ) -> bool:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        return await cls.send_email(
            to_email=to_email,
            subject="Reset your LaserHub password",
            template_name="password_reset.html",
            template_data={
                "reset_url": reset_url
            }
        )

    @classmethod
    async def send_order_confirmation(
        cls,
        to_email: str,
        name: str,
        order_id: str,
        amount: float
    ) -> bool:
        return await cls.send_email(
            to_email=to_email,
            subject=f"Order Confirmation - LaserHub #{order_id}",
            template_name="order_confirmation.html",
            template_data={
                "name": name,
                "order_id": order_id,
                "amount": amount
            }
        )

    @classmethod
    async def send_production_update(
        cls,
        to_email: str,
        name: str,
        order_id: str,
        status: str
    ) -> bool:
        return await cls.send_email(
            to_email=to_email,
            subject=f"Order Update - LaserHub #{order_id}",
            template_name="production_update.html",
            template_data={
                "name": name,
                "order_id": order_id,
                "status": status
            }
        )

    @classmethod
    async def send_shipping_notification(
        cls,
        to_email: str,
        name: str,
        order_id: str,
        carrier: str = "Standard Shipping",
        tracking_number: Optional[str] = None
    ) -> bool:
        return await cls.send_email(
            to_email=to_email,
            subject=f"Your Order Has Shipped! - LaserHub #{order_id}",
            template_name="shipping_notification.html",
            template_data={
                "name": name,
                "order_id": order_id,
                "carrier": carrier,
                "tracking_number": tracking_number
            }
        )
