import QRCode from "qrcode";

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export class QRService {
  /**
   * Generates a Data URL (base64 PNG) for a team QR token
   */
  static async generateDataUrl(
    token: string,
    options: QRCodeOptions = {}
  ): Promise<string> {
    const defaultOptions: QRCode.QRCodeToDataURLOptions = {
      width: options.width || 450,
      margin: options.margin || 2,
      color: {
        dark: options.color?.dark || "#0F172A",
        light: options.color?.light || "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    };

    try {
      return await QRCode.toDataURL(token, defaultOptions);
    } catch (err: any) {
      console.error("QRService Error: Failed to generate QR data URL", err);
      throw new Error(`QR generation failed: ${err.message}`);
    }
  }

  /**
   * Generates a binary PNG Buffer (useful for file saving and email attachments)
   */
  static async generateBuffer(token: string, width = 500): Promise<Buffer> {
    try {
      return await QRCode.toBuffer(token, {
        width,
        margin: 2,
        errorCorrectionLevel: "H",
      });
    } catch (err: any) {
      console.error("QRService Error: Failed to generate QR buffer", err);
      throw new Error(`QR buffer generation failed: ${err.message}`);
    }
  }

  /**
   * Generates a secure, cryptographically random team QR token
   */
  static generateToken(prefix = "qr"): string {
    return `${prefix}-${crypto.randomUUID()}`;
  }
}
