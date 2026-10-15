import { Resend } from "resend";
import nodemailer from "nodemailer";

export interface SendTeamPassEmailParams {
  to: string;
  captainName: string;
  teamName: string;
  eventName: string;
  venue?: string;
  date?: string;
  qrDataUrl?: string;
  qrToken?: string;
  customSubject?: string;
  customBody?: string;
  includeAttachment?: boolean;
}

export interface SendVenueOtpEmailParams {
  to: string;
  captainName: string;
  teamName: string;
  eventName: string;
  otpCode: string;
}

export class EmailService {
  private static getSmtpTransporter() {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass || user.trim() === "" || pass.trim() === "") {
      return null;
    }

    const port = Number(process.env.SMTP_PORT) || 465;
    const isSecure = port === 465 || process.env.SMTP_SECURE === "true";

    return nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user: user.trim(),
        pass: pass.trim().replace(/\s+/g, ""),
      },
    });
  }

  private static getResendClient(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey.includes("placeholder")) {
      return null;
    }
    return new Resend(apiKey);
  }

  private static getFromAddress(): string {
    return (
      process.env.SMTP_FROM ||
      (process.env.SMTP_USER ? `HKBK Event Portal <${process.env.SMTP_USER.trim()}>` : undefined) ||
      process.env.RESEND_FROM_EMAIL ||
      "Event Portal <onboarding@resend.dev>"
    );
  }

  /**
   * Compatibility helper for team object
   */
  static async sendQrPassEmail(team: any, recipientOverride?: string): Promise<{
    success: boolean;
    message: string;
    record?: any;
  }> {
    const leader = team.participants?.find((p: any) => p.is_leader) || team.participants?.[0];
    const to = recipientOverride || leader?.email;
    if (!to) {
      return { success: false, message: "No recipient email found" };
    }

    const res = await this.sendTeamPassEmail({
      to,
      captainName: leader?.full_name || team.name,
      teamName: team.name,
      eventName: "Tournament Championship",
      qrDataUrl: team.qr_data_url || "",
      qrToken: team.qr_token || "",
      includeAttachment: true,
    });

    return {
      success: res.success,
      message: res.message,
      record: {
        to,
        status: res.success ? "SENT" : "FAILED",
        timestamp: new Date().toISOString(),
        emailId: res.emailId,
      },
    };
  }

  /**
   * Dispatches the official Team QR Entry Pass with custom subject, body, and attachment.
   */
  static async sendTeamPassEmail(params: SendTeamPassEmailParams): Promise<{
    success: boolean;
    emailId?: string;
    isSimulated: boolean;
    message: string;
  }> {
    const {
      to,
      captainName,
      teamName,
      eventName,
      venue = "Main Convention Arena",
      date = "Tournament Day",
      qrDataUrl = "",
      qrToken = "",
      customSubject,
      customBody,
      includeAttachment = true,
    } = params;

    const subject =
      customSubject && customSubject.trim().length > 0
        ? customSubject.trim()
        : `🎟️ Official Entry Pass & QR Token - ${teamName} [${eventName}]`;

    // Build default or custom HTML body
    const formattedBody =
      customBody && customBody.trim().length > 0
        ? customBody.replace(/\n/g, "<br/>")
        : `
          <p>Dear <strong>${captainName}</strong>,</p>
          <p>Congratulations! Your team <strong>${teamName}</strong> has been approved for admission to <strong>${eventName}</strong>.</p>
          <p>Below is your official single-use cryptographic QR pass. Please present this digital QR code at the venue entry gate along with valid ID cards for all team members.</p>
        `;

    const smtpTransporter = this.getSmtpTransporter();
    
    // QuickChart Cloudflare CDN endpoint: ultra-compatible with Google Image Proxy & mobile mail clients
    const encodedToken = encodeURIComponent(qrToken);
    const qrImgSrc = qrToken
      ? `https://quickchart.io/qr?size=250&text=${encodedToken}`
      : qrDataUrl || "https://quickchart.io/qr?size=250&text=PASS";
    const downloadPassUrl = qrToken
      ? `https://quickchart.io/qr?size=600&text=${encodedToken}`
      : "#";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
            .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background: #0f172a; padding: 28px 24px; text-align: center; color: #ffffff; }
            .content { padding: 28px 24px; line-height: 1.6; }
            .badge { display: inline-block; background: #3b82f6; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 9999px; letter-spacing: 0.05em; margin-bottom: 12px; }
            .qr-box { text-align: center; background: #f8fafc; padding: 24px; border-radius: 12px; margin: 20px 0; border: 1px solid #e2e8f0; }
            .qr-img { width: 220px; height: 220px; border-radius: 10px; background: #ffffff; padding: 10px; border: 1px solid #cbd5e1; display: block; margin: 0 auto; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; margin: 16px 0; font-size: 13px; }
            .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; }
            .token { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #475569; word-break: break-all; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <span class="badge">Official Entry Credentials</span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">${eventName}</h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #94a3b8;">Single-Use Gate Admission Pass</p>
            </div>
            <div class="content">
              <div style="font-size: 14px;">
                ${formattedBody}
              </div>

              <div class="qr-box">
                <img src="${qrImgSrc}" alt="Entry QR Pass" width="220" height="220" class="qr-img" style="width: 220px; height: 220px; border-radius: 10px; background: #ffffff; padding: 10px; border: 1px solid #cbd5e1; display: block; margin: 0 auto;" />
                <div style="margin-top: 14px;">
                  <a href="${downloadPassUrl}" target="_blank" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 8px;">
                    📱 View &amp; Save QR Pass
                  </a>
                </div>
                <div class="token"><strong>Token:</strong> ${qrToken || "CRYPTOGRAPHIC-PASS"}</div>
              </div>

              <div class="meta-box">
                <div><strong>Team:</strong> ${teamName}</div>
                <div><strong>Team Captain:</strong> ${captainName}</div>
                <div><strong>Venue:</strong> ${venue}</div>
                <div><strong>Date / Schedule:</strong> ${date}</div>
              </div>

              <p style="font-size: 12px; color: #dc2626; margin-top: 18px;">
                ⚠️ <strong>Important Notice:</strong> This QR code is strictly <em>single-use</em>. Once scanned at the entry terminal, it is permanently consumed and invalidated. Double entry is prohibited.
              </p>
            </div>
            <div class="footer">
              Dispatched via Apex Event Management System • Verified by Event Authority
            </div>
          </div>
        </body>
      </html>
    `;

    // High-resolution attached PNG pass file
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }> = [];

    if (qrDataUrl && qrDataUrl.startsWith("data:image/")) {
      try {
        const base64Data = qrDataUrl.split(";base64,").pop();
        if (base64Data) {
          const buffer = Buffer.from(base64Data, "base64");
          const safeName = teamName.replace(/[^a-zA-Z0-9-_]/g, "_");
          attachments.push({
            filename: `${safeName}_Entry_Pass.png`,
            content: buffer,
            contentType: "image/png",
          });
        }
      } catch (err) {
        console.warn("Could not generate attachment buffer from QR data URL:", err);
      }
    }

    // 1. Prioritize Gmail SMTP if configured
    if (smtpTransporter) {
      try {
        const fromAddress = this.getFromAddress();
        const info: any = await smtpTransporter.sendMail({
          from: fromAddress,
          to,
          subject,
          html: htmlContent,
          attachments: (attachments.length > 0 ? (attachments as any) : undefined),
        });

        console.log(`[SMTP SUCCESS] QR Pass delivered to ${to} via Gmail SMTP (Message ID: ${info?.messageId || "ok"})`);
        return {
          success: true,
          emailId: info?.messageId,
          isSimulated: false,
          message: `Official QR pass delivered to ${to} via Gmail.`,
        };
      } catch (smtpErr: any) {
        console.error("Gmail SMTP delivery error:", smtpErr);
        if (!this.getResendClient()) {
          return {
            success: false,
            isSimulated: false,
            message: `Gmail SMTP error: ${smtpErr.message || "Failed to dispatch email via Gmail"}`,
          };
        }
      }
    }

    const resend = this.getResendClient();

    if (!resend) {
      console.log(`[RESEND SIMULATION] Email to ${to} for team '${teamName}'`);
      console.log(`Subject: ${subject}`);
      console.log(`Attachments: ${attachments.length > 0 ? "Attached QR PNG" : "None"}`);
      return {
        success: true,
        isSimulated: true,
        message: `Pass dispatched to ${to} (Simulated mode: set SMTP credentials or RESEND_API_KEY in .env.local).`,
      };
    }

    try {
      const resendAttachments =
        attachments.length > 0
          ? attachments.map((att, i) => ({
              filename: typeof att.filename === "string" ? att.filename : `qr-pass-${i + 1}.png`,
              content: att.content,
            }))
          : undefined;

      const response = await resend.emails.send({
        from: this.getFromAddress(),
        to: [to],
        subject,
        html: htmlContent,
        attachments: resendAttachments,
      });

      if (response.error) {
        console.error("Resend delivery error:", response.error);
        return {
          success: false,
          isSimulated: false,
          message: `Resend error: ${response.error.message}`,
        };
      }

      return {
        success: true,
        emailId: response.data?.id,
        isSimulated: false,
        message: `Official QR pass delivered to ${to} via Resend (ID: ${response.data?.id}).`,
      };
    } catch (err: any) {
      console.error("Resend execution error:", err);
      return {
        success: false,
        isSimulated: false,
        message: `Resend exception: ${err.message || "Failed to dispatch email"}`,
      };
    }
  }

  /**
   * Dispatches the on-spot 6-digit Venue Check-In Verification OTP Code to the Team Captain.
   */
  static async sendVenueOtpEmail(params: SendVenueOtpEmailParams): Promise<{
    success: boolean;
    emailId?: string;
    isSimulated: boolean;
    message: string;
  }> {
    const { to, captainName, teamName, eventName, otpCode } = params;

    const subject = `🔐 Venue Gate Verification Code: ${otpCode} [${teamName}]`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc; }
            .card { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }
            .header { background: #090d16; padding: 24px; text-align: center; border-bottom: 1px solid #334155; }
            .content { padding: 28px 24px; text-align: center; }
            .otp-container { background: #0f172a; border: 2px dashed #3b82f6; border-radius: 12px; padding: 20px; margin: 24px 0; }
            .otp-code { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #60a5fa; margin: 0; }
            .warning { font-size: 12px; color: #fbbf24; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 12px; border-radius: 8px; margin-top: 20px; text-align: left; }
            .footer { background: #090d16; padding: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #334155; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <span style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 10px; border-radius: 9999px; letter-spacing: 0.05em; margin-bottom: 8px;">Venue Gate Checkpoint</span>
              <h2 style="margin: 0; font-size: 20px; color: #ffffff;">${eventName}</h2>
            </div>
            <div class="content">
              <p style="margin: 0; font-size: 15px; color: #cbd5e1;">Hello <strong>${captainName}</strong>,</p>
              <p style="font-size: 13px; color: #94a3b8; margin: 6px 0 0;">
                Your team <strong>${teamName}</strong> is standing at the gate checkpoint. Provide this verification code to the venue marshal to confirm your physical entry:
              </p>

              <div class="otp-container">
                <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 6px;">On-Spot Verification Code</div>
                <div class="otp-code">${otpCode}</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 6px;">Valid for 15 minutes • Single use</div>
              </div>

              <div class="warning">
                🔒 <strong>Security Checklist:</strong> Only read this code out loud directly in the presence of the authorized venue volunteer. Do not forward or share this code over the internet.
              </div>
            </div>
            <div class="footer">
              Apex Security Gate Verification • Instant Two-Factor Check-In
            </div>
          </div>
        </body>
      </html>
    `;

    // 1. Prioritize Gmail SMTP if configured
    const smtp = this.getSmtpTransporter();
    if (smtp) {
      try {
        const fromAddress = this.getFromAddress();
        const info = await smtp.sendMail({
          from: fromAddress,
          to,
          subject,
          html: htmlContent,
        });

        console.log(`[SMTP SUCCESS] Venue OTP delivered to ${to} via Gmail SMTP (Message ID: ${info.messageId})`);
        return {
          success: true,
          emailId: info.messageId,
          isSimulated: false,
          message: `Verification code dispatched to ${to} via Gmail.`,
        };
      } catch (smtpErr: any) {
        console.error("Gmail SMTP OTP error:", smtpErr);
        if (!this.getResendClient()) {
          return {
            success: false,
            isSimulated: false,
            message: `Gmail SMTP OTP error: ${smtpErr.message || "Failed to dispatch OTP via Gmail"}`,
          };
        }
      }
    }

    const resend = this.getResendClient();

    if (!resend) {
      console.log(`[RESEND SIMULATION] Venue OTP for team '${teamName}' sent to ${to}: ${otpCode}`);
      return {
        success: true,
        isSimulated: true,
        message: `OTP [${otpCode}] generated for ${to} (Simulated mode: check console or enter code on screen).`,
      };
    }

    try {
      const response = await resend.emails.send({
        from: this.getFromAddress(),
        to: [to],
        subject,
        html: htmlContent,
      });

      if (response.error) {
        console.error("Resend OTP error:", response.error);
        return {
          success: false,
          isSimulated: false,
          message: `Resend error: ${response.error.message}`,
        };
      }

      return {
        success: true,
        emailId: response.data?.id,
        isSimulated: false,
        message: `Verification code dispatched to ${to} via Resend.`,
      };
    } catch (err: any) {
      console.error("Resend OTP error:", err);
      return {
        success: false,
        isSimulated: false,
        message: `Resend exception: ${err.message || "Failed to dispatch OTP"}`,
      };
    }
  }
}
