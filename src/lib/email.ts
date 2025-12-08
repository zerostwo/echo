import nodemailer from 'nodemailer';
import { getBaseUrl, siteConfig } from '@/config/site';
import { headers } from 'next/headers';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_SENDER_NAME || siteConfig.name}" <${process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log('[Email] Message sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
    return { success: false, error };
  }
}

// Helper to get dynamic base URL from headers
async function getDynamicBaseUrl() {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    if (host) {
      return `${protocol}://${host}`;
    }
  } catch (error) {
    // Fallback if headers() is not available (e.g. background job)
  }
  return getBaseUrl();
}

// Shared email wrapper template
function emailWrapper(content: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Echo</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto;">
          <!-- Logo Header -->
          <tr>
            <td style="text-align: center; padding-bottom: 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: #18181b; border-radius: 12px; padding: 12px 20px;">
                    <span style="color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Echo</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Content Card -->
          <tr>
            <td>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 36px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="text-align: center; padding-top: 24px;">
              <p style="margin: 0; font-size: 13px; color: #71717a;">
                © ${new Date().getFullYear()} Echo. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #a1a1aa;">
                Deep listening, precision learning.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const baseUrl = await getDynamicBaseUrl();
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
  
  const content = `
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
            <tr>
              <td style="background-color: #dcfce7; border-radius: 50%; width: 64px; height: 64px; text-align: center; vertical-align: middle;">
                <span style="font-size: 28px;">✉️</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Title -->
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
      Verify Your Email
    </h1>
    <p style="margin: 0 0 32px 0; font-size: 15px; color: #71717a; text-align: center;">
      Welcome to Echo, ${name}!
    </p>
    
    <!-- Message -->
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
      Thanks for signing up! Please verify your email address by clicking the button below to get started with Echo.
    </p>
    
    <!-- Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding: 8px 0 32px 0;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verificationUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" stroke="f" fillcolor="#18181b">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:600;">Verify Email</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${verificationUrl}" target="_blank" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; mso-hide: all;">
            Verify Email Address
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    
    <!-- Divider -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="border-top: 1px solid #e4e4e7; padding-top: 24px;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #71717a;">
            If the button doesn't work, copy and paste this link:
          </p>
          <p style="margin: 0; font-size: 13px; color: #3b82f6; word-break: break-all;">
            <a href="${verificationUrl}" style="color: #3b82f6; text-decoration: underline;">${verificationUrl}</a>
          </p>
        </td>
      </tr>
    </table>
    
    <!-- Note -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px;">
      <tr>
        <td style="background-color: #fafafa; border-radius: 8px; padding: 16px;">
          <p style="margin: 0; font-size: 13px; color: #71717a; text-align: center;">
            If you didn't create an account with Echo, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify your email address - Echo',
    html: emailWrapper(content),
  });
}

export async function sendEmailChangeVerification(newEmail: string, name: string, token: string, pendingEmail: string) {
  const baseUrl = await getDynamicBaseUrl();
  const verificationUrl = `${baseUrl}/verify-email?token=${token}&email=${encodeURIComponent(pendingEmail)}&type=change`;
  
  const content = `
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
            <tr>
              <td style="background-color: #dbeafe; border-radius: 50%; width: 64px; height: 64px; text-align: center; vertical-align: middle;">
                <span style="font-size: 28px;">📧</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Title -->
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
      Verify Your New Email
    </h1>
    <p style="margin: 0 0 32px 0; font-size: 15px; color: #71717a; text-align: center;">
      Hi ${name}, you requested to change your email.
    </p>
    
    <!-- Message -->
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
      Click the button below to verify this email address and complete the change. This link will expire in 24 hours.
    </p>
    
    <!-- Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding: 8px 0 32px 0;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${verificationUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" stroke="f" fillcolor="#18181b">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:600;">Verify Email</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${verificationUrl}" target="_blank" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; mso-hide: all;">
            Verify New Email
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    
    <!-- Divider -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="border-top: 1px solid #e4e4e7; padding-top: 24px;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #71717a;">
            If the button doesn't work, copy and paste this link:
          </p>
          <p style="margin: 0; font-size: 13px; color: #3b82f6; word-break: break-all;">
            <a href="${verificationUrl}" style="color: #3b82f6; text-decoration: underline;">${verificationUrl}</a>
          </p>
        </td>
      </tr>
    </table>
    
    <!-- Note -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px;">
      <tr>
        <td style="background-color: #fef3c7; border-radius: 8px; padding: 16px;">
          <p style="margin: 0; font-size: 13px; color: #71717a; text-align: center;">
            If you didn't request this email change, you can safely ignore this email. Your account email will remain unchanged.
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendEmail({
    to: newEmail,
    subject: 'Verify your new email address - Echo',
    html: emailWrapper(content),
  });
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const baseUrl = await getDynamicBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  
  const content = `
    <!-- Icon -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding-bottom: 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
            <tr>
              <td style="background-color: #fef3c7; border-radius: 50%; width: 64px; height: 64px; text-align: center; vertical-align: middle;">
                <span style="font-size: 28px;">🔐</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Title -->
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #18181b; text-align: center;">
      Reset Your Password
    </h1>
    <p style="margin: 0 0 32px 0; font-size: 15px; color: #71717a; text-align: center;">
      Hi ${name}, we received a password reset request.
    </p>
    
    <!-- Message -->
    <p style="margin: 0 0 24px 0; font-size: 15px; color: #3f3f46; line-height: 1.6;">
      Click the button below to reset your password. This link will expire in 1 hour.
    </p>
    
    <!-- Button -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="text-align: center; padding: 8px 0 32px 0;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" stroke="f" fillcolor="#18181b">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:600;">Reset Password</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; mso-hide: all;">
            Reset Password
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
    
    <!-- Divider -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="border-top: 1px solid #e4e4e7; padding-top: 24px;">
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #71717a;">
            If the button doesn't work, copy and paste this link:
          </p>
          <p style="margin: 0; font-size: 13px; color: #3b82f6; word-break: break-all;">
            <a href="${resetUrl}" style="color: #3b82f6; text-decoration: underline;">${resetUrl}</a>
          </p>
        </td>
      </tr>
    </table>
    
    <!-- Note -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px;">
      <tr>
        <td style="background-color: #fef2f2; border-radius: 8px; padding: 16px;">
          <p style="margin: 0; font-size: 13px; color: #71717a; text-align: center;">
            If you didn't request a password reset, please ignore this email or contact support if you have concerns.
          </p>
        </td>
      </tr>
    </table>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset your password - Echo',
    html: emailWrapper(content),
  });
}
