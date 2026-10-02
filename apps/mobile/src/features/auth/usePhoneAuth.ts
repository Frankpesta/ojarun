import { useCallback } from "react";
import { useSignIn, useSignUp } from "@clerk/expo";
import { clerkErrorCode } from "@/lib/errors";

export type AuthMode = "signIn" | "signUp";

/**
 * One phone-number flow for new and returning customers, on Clerk's custom-flow API.
 * Try sign-in first; if the number has no account, start a sign-up with the same number.
 * Clerk must be configured so a phone number is the only required sign-up field —
 * we collect the name ourselves (profile-setup).
 */
export function usePhoneAuth() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const sendCode = useCallback(
    async (phoneNumber: string): Promise<{ mode: AuthMode } | { error: unknown }> => {
      const attempt = await signIn.phoneCode.sendCode({ phoneNumber });
      if (!attempt.error) return { mode: "signIn" };

      if (clerkErrorCode(attempt.error) !== "form_identifier_not_found") return { error: attempt.error };

      const created = await signUp.create({ phoneNumber });
      if (created.error) return { error: created.error };
      const sent = await signUp.verifications.sendPhoneCode();
      if (sent.error) return { error: sent.error };
      return { mode: "signUp" };
    },
    [signIn, signUp],
  );

  const resendCode = useCallback(
    async (mode: AuthMode): Promise<{ error: unknown } | null> => {
      const res = mode === "signIn" ? await signIn.phoneCode.sendCode() : await signUp.verifications.sendPhoneCode();
      return res.error ? { error: res.error } : null;
    },
    [signIn, signUp],
  );

  const verify = useCallback(
    async (mode: AuthMode, code: string): Promise<{ error: unknown } | null> => {
      if (mode === "signIn") {
        const v = await signIn.phoneCode.verifyCode({ code });
        if (v.error) return { error: v.error };
        const f = await signIn.finalize();
        return f.error ? { error: f.error } : null;
      }
      const v = await signUp.verifications.verifyPhoneCode({ code });
      if (v.error) return { error: v.error };
      const f = await signUp.finalize();
      return f.error ? { error: f.error } : null;
    },
    [signIn, signUp],
  );

  return { sendCode, resendCode, verify };
}
