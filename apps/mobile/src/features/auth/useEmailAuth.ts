import { useCallback } from "react";
import { useSignIn, useSignUp } from "@clerk/expo";
import { clerkErrorCode } from "@/lib/errors";

export type AuthMode = "signIn" | "signUp";

/**
 * One email-code flow for new and returning users, on Clerk's custom-flow API.
 * Try sign-in first; if the address has no account, start a sign-up with the same address.
 * Clerk must be configured so email (verified by code) is the only required sign-up field —
 * we collect the name and phone number ourselves (profile-setup). Clerk can't send SMS to
 * Nigerian numbers, which is why sign-in is by email.
 */
export function useEmailAuth() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const sendCode = useCallback(
    async (emailAddress: string): Promise<{ mode: AuthMode } | { error: unknown }> => {
      const attempt = await signIn.emailCode.sendCode({ emailAddress });
      if (!attempt.error) return { mode: "signIn" };

      if (clerkErrorCode(attempt.error) !== "form_identifier_not_found") return { error: attempt.error };

      const created = await signUp.create({ emailAddress });
      if (created.error) return { error: created.error };
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return { error: sent.error };
      return { mode: "signUp" };
    },
    [signIn, signUp],
  );

  const resendCode = useCallback(
    async (mode: AuthMode): Promise<{ error: unknown } | null> => {
      const res = mode === "signIn" ? await signIn.emailCode.sendCode() : await signUp.verifications.sendEmailCode();
      return res.error ? { error: res.error } : null;
    },
    [signIn, signUp],
  );

  const verify = useCallback(
    async (mode: AuthMode, code: string): Promise<{ error: unknown } | null> => {
      if (mode === "signIn") {
        const v = await signIn.emailCode.verifyCode({ code });
        if (v.error) return { error: v.error };
        const f = await signIn.finalize();
        return f.error ? { error: f.error } : null;
      }
      const v = await signUp.verifications.verifyEmailCode({ code });
      if (v.error) return { error: v.error };
      const f = await signUp.finalize();
      return f.error ? { error: f.error } : null;
    },
    [signIn, signUp],
  );

  return { sendCode, resendCode, verify };
}
