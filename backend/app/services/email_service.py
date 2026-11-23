"""
Email Dispatch Service (`backend/app/services/email_service.py`).
Handles sending 2FA verification codes to administrators and notifications.
Supports standard SMTP (TLS/SSL) with async thread dispatch and local development fallback.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("placement_intelligence.email")


def _build_otp_html(code: str, expires_in_minutes: int) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Admin Login Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FFF9F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFF9F6; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="520" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #FFFFFF; border: 1px solid #FFE4D6; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(232, 97, 68, 0.08);">
          <tr>
            <td style="padding: 32px 32px 20px 32px; text-align: center;">
              <div style="display: inline-block; background: linear-gradient(135deg, #FF7A59 0%, #E86144 100%); color: #FFFFFF; padding: 8px 18px; border-radius: 9999px; font-weight: 800; font-size: 13px; letter-spacing: 0.5px;">
                PLACEMENT INTELLIGENCE SECURITY
              </div>
              <h1 style="color: #0F172A; font-size: 22px; font-weight: 900; margin: 20px 0 8px 0; letter-spacing: -0.5px;">
                Administrator Two-Factor Verification
              </h1>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">
                A sign-in request was initiated for your institutional administrator account. Please use the verification code below to authorize access.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 10px 32px 24px 32px;">
              <div style="background-color: #FFF5EE; border: 2px dashed #FF7A59; border-radius: 16px; padding: 22px 20px; text-align: center;">
                <span style="font-family: 'SF Mono', Monaco, Inconsolata, 'Fira Mono', monospace; font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #E86144; text-indent: 10px; display: inline-block;">
                  {code}
                </span>
                <p style="color: #94A3B8; font-size: 12px; margin: 10px 0 0 0; font-weight: 600;">
                  Valid for {expires_in_minutes} minutes • Single-use only
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px; color: #64748B; font-size: 12px; line-height: 1.6; border-top: 1px solid #F1F5F9; text-align: center;">
              <p style="margin: 16px 0 0 0;">
                If you did not request this verification code, someone may be attempting to access your account. Please notify the security team and change your credentials immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_smtp_sync(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """Synchronous SMTP email delivery."""
    from_addr = (
        settings.SMTP_USER.strip()
        if (settings.SMTP_USER and "@gmail.com" in settings.SMTP_USER.lower() and "placementintelligence.com" in settings.EMAILS_FROM_EMAIL)
        else settings.EMAILS_FROM_EMAIL
    )
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{from_addr}>"
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    smtp_pwd = (settings.SMTP_PASSWORD or "").replace(" ", "").strip()

    if not settings.SMTP_HOST or not settings.SMTP_USER or not smtp_pwd:
        logger.warning(
            "\n" + "=" * 70 + "\n"
            f"[ADMIN 2FA EMAIL DISPATCH (DEV MODE)]\n"
            f"To: {to_email}\n"
            f"Subject: {subject}\n"
            f"Content: {text_content}\n"
            f"Notice: Set SMTP_USER & SMTP_PASSWORD in backend/.env for live inbox delivery.\n"
            + "=" * 70
        )
        return True

    try:
        if settings.SMTP_SSL:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
            if settings.SMTP_TLS:
                server.starttls()

        server.login(settings.SMTP_USER.strip(), smtp_pwd)
        server.sendmail(from_addr, [to_email], msg.as_string())
        server.quit()
        logger.info("Successfully sent 2FA verification email to %s via SMTP (%s)", to_email, from_addr)
        return True
    except Exception as exc:
        logger.error("Failed to send 2FA email via SMTP to %s: %s", to_email, exc)
        # Even if SMTP fails, log the code locally so admin is never locked out in dev
        logger.warning(
            "\n" + "=" * 70 + "\n"
            f"[FALLBACK LOG] Verification code for {to_email}:\n"
            f"{text_content}\n"
            + "=" * 70
        )
        return False


async def send_admin_login_otp(to_email: str, code: str, expires_in_minutes: int = 10) -> bool:
    """Asynchronously dispatches a 6-digit MFA OTP code to an administrator's email."""
    subject = f"{code} is your Placement Admin verification code"
    text_content = (
        f"Your Placement Intelligence administrator verification code is: {code}\n\n"
        f"This code will expire in {expires_in_minutes} minutes.\n"
        "If you did not initiate this login request, please contact your systems administrator."
    )
    html_content = _build_otp_html(code, expires_in_minutes)

    return await asyncio.to_thread(
        _send_smtp_sync,
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )


def _build_password_reset_html(code: str, user_name: str, expires_in_minutes: int) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FFF9F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FFF9F6; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #FFFFFF; border: 1px solid #FFE4D6; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 25px rgba(232, 97, 68, 0.08);">
          <tr>
            <td style="padding: 32px 32px 20px 32px; text-align: center;">
              <div style="display: inline-block; background: linear-gradient(135deg, #FF7A59 0%, #E86144 100%); color: #FFFFFF; padding: 8px 18px; border-radius: 9999px; font-weight: 800; font-size: 13px; letter-spacing: 0.5px;">
                PLACEMENT INTELLIGENCE SECURITY
              </div>
              <h1 style="color: #0F172A; font-size: 22px; font-weight: 900; margin: 20px 0 8px 0; letter-spacing: -0.5px;">
                Password Reset Verification
              </h1>
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0;">
                Hello {user_name},<br>
                We received a request to reset your password. Use the single-use 6-digit code below to set your new password.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 10px 32px 24px 32px;">
              <div style="background-color: #FFF5EE; border: 2px dashed #FF7A59; border-radius: 16px; padding: 22px 20px; text-align: center;">
                <span style="font-family: 'SF Mono', Monaco, Inconsolata, 'Fira Mono', monospace; font-size: 38px; font-weight: 900; letter-spacing: 10px; color: #E86144; text-indent: 10px; display: inline-block;">
                  {code}
                </span>
                <p style="color: #94A3B8; font-size: 12px; margin: 10px 0 0 0; font-weight: 600;">
                  Valid for {expires_in_minutes} minutes • Single-use only
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 32px 32px 32px; color: #64748B; font-size: 12px; line-height: 1.6; border-top: 1px solid #F1F5F9; text-align: center;">
              <p style="margin: 16px 0 0 0;">
                If you did not request a password change, please ignore this email. Your current password will remain unchanged and secure.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_password_reset_code(
    to_email: str,
    code: str,
    user_name: str = "User",
    expires_in_minutes: int = 15,
) -> bool:
    """Asynchronously dispatches a 6-digit password reset verification code to a user's dedicated email."""
    subject = f"{code} is your Placement Intelligence password reset code"
    text_content = (
        f"Hello {user_name},\n\n"
        f"Your verification code to reset your password is: {code}\n\n"
        f"This code will expire in {expires_in_minutes} minutes.\n"
        "If you did not request this, please ignore this email. Your password will remain unchanged."
    )
    html_content = _build_password_reset_html(code, user_name, expires_in_minutes)

    return await asyncio.to_thread(
        _send_smtp_sync,
        to_email=to_email,
        subject=subject,
        html_content=html_content,
        text_content=text_content,
    )
