/**
 * OTP delivery — Phase 2 dev scaffold.
 *
 * This is the seam a real SMS / WhatsApp gateway plugs into. For now there is no
 * provider wired up, so the code is logged to the server console and (in dev, or
 * when `OTP_DEV_ECHO=1`) echoed back to the client by the route so the flow is
 * testable end-to-end without sending a single message.
 *
 * To go live: implement the provider branch below (WhatsApp Cloud API creds are
 * already in `.env`) and the rest of the login flow is unchanged.
 */

export type OtpChannel = 'console' | 'whatsapp' | 'sms';

export interface OtpSendResult {
  delivered: boolean;
  channel: OtpChannel;
}

/** Should the OTP code be returned to the client (dev convenience, never in prod by default). */
export function otpDevEcho(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.OTP_DEV_ECHO === '1';
}

export async function sendOtp(phone: string, code: string): Promise<OtpSendResult> {
  // --- Production providers go here -----------------------------------------
  // if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
  //   await sendWhatsApp(phone, code);
  //   return { delivered: true, channel: 'whatsapp' };
  // }

  // --- Dev scaffold: log so a developer can read the code -------------------
  // (Masked in the log for shoulder-surfing; the route echoes the real code in dev.)
  console.log(`[otp] code for ${maskPhone(phone)} → ${code}`);
  return { delivered: process.env.NODE_ENV !== 'production', channel: 'console' };
}

function maskPhone(phone: string): string {
  return phone.length <= 4 ? phone : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}
