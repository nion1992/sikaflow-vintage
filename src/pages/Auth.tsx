import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { authLinkError } from "@/lib/supabase";
import { useSupabaseAuthContext } from "@/providers/supabase-auth-provider";
import logo from "@/assets/logo.svg";
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  User,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

export default function AuthPage(props: AuthProps = {}) {
  // We read auth methods from the Supabase context directly so the login forms
  // can call signInWithOtp / verifyOtp / signInWithPassword without going
  // through the Convex-Auth-shaped signIn() wrapper.
  const supabaseAuth = useSupabaseAuthContext();
  const { isAuthenticated, isPasswordRecovery } = supabaseAuth;
  // Supabase sends used/expired links back with `#error_code=...` instead of a
  // session; ask for a fresh link rather than showing a dead sign-in form.
  const [linkExpired] = useState(authLinkError);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    props.redirectAfterAuth,
  );
  const [mode, setMode] = useState<
    "credentials" | "otp" | "signup" | "confirm" | "forgot" | "reset"
  >(isPasswordRecovery ? "reset" : linkExpired ? "forgot" : "credentials");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [emailForOtp, setEmailForOtp] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [notice, setNotice] = useState<string | null>(
    linkExpired
      ? "That link has expired or was already used. Send yourself a fresh one below."
      : null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigate only once the session is confirmed.
  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(redirect);
  }, [isAuthenticated, navigate, redirect]);

  const handleCredentialsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      if (password) {
        // Password sign-in.
        const { error } = await supabaseAuth.signInWithPassword(loginId, password);
        if (error) throw new Error(error);
      } else {
        // Send an OTP to the email/username.
        const { error } = await supabaseAuth.signInWithOtp(loginId);
        if (error) throw new Error(error);
        setEmailForOtp(loginId);
        setMode("otp");
        setIsLoading(false);
        return;
      }
      navigate(redirect);
    } catch (err) {
      console.error("Credentials sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sign in. Check your login ID and try again.",
      );
      setIsLoading(false);
    }
  };

  const handleSignUpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (signupPassword.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    if (signupPassword !== confirmPassword) {
      setError("Those two passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const { error, needsEmailConfirmation } = await supabaseAuth.signUp(
        signupEmail.trim(),
        signupPassword,
        { name: signupName.trim() || undefined },
      );
      if (error) throw new Error(error);
      if (needsEmailConfirmation) {
        setEmailForOtp(signupEmail.trim());
        setMode("confirm");
        setIsLoading(false);
        return;
      }
      navigate(redirect);
    } catch (err) {
      console.error("Sign-up error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not create your account. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const { error } = await supabaseAuth.resendConfirmation(emailForOtp);
      if (error) throw new Error(error);
      setNotice(`A fresh confirmation link is on its way to ${emailForOtp}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not resend the confirmation email.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const { error } = await supabaseAuth.resetPasswordForEmail(forgotEmail.trim());
      if (error) throw new Error(error);
      setForgotSent(true);
      setNotice(
        `If ${forgotEmail.trim()} has a SikaFlow account, a link to choose a new password is on its way.`,
      );
    } catch (err) {
      console.error("Password reset request error:", err);
      setError(
        err instanceof Error ? err.message : "Could not send the reset link. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Use at least 6 characters for your password.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabaseAuth.updatePassword(newPassword);
      if (error) throw new Error(error);
      // Saved — this session is a normal sign-in again, so let the redirect run.
      supabaseAuth.finishPasswordRecovery();
      setNewPassword("");
      setNewPasswordConfirm("");
      navigate(redirect, { replace: true });
    } catch (err) {
      console.error("Password update error:", err);
      setError(
        err instanceof Error ? err.message : "Could not save your new password.",
      );
      setIsLoading(false);
    }
  };

  const handleCancelReset = async () => {
    setError(null);
    setNotice(null);
    setNewPassword("");
    setNewPasswordConfirm("");
    setIsLoading(true);
    try {
      // Clears the recovery session (and the recovery flag) so nobody inherits it.
      await supabaseAuth.signOut();
      setMode("credentials");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabaseAuth.verifyOtp(emailForOtp, otp);
      if (error) throw new Error(error);

      navigate(redirect);
    } catch (err) {
      console.error("OTP verification error:", err);

      setError("The verification code you entered is incorrect.");
      setIsLoading(false);

      setOtp("");
    }
  };

  return (
    <div className="paper-texture flex min-h-screen flex-col">
      <div className="flex items-center justify-center px-4 pt-10">
        <Link to="/" className="flex flex-col items-center gap-2">
          <img
            src={logo}
            alt="SikaFlow seal"
            width={64}
            height={64}
            className="size-16 rounded-xl"
          />
          <span className="font-serif text-xl font-bold tracking-wide">SikaFlow</span>
          <span className="ledger-label text-muted-foreground">
            Quotes · Invoices · Payments
          </span>
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="glass glass-card paper-card parchment-edge min-w-[340px] max-w-sm border border-border/60 bg-glass/70 p-8 shadow-xl backdrop-blur-md">
          {mode === "credentials" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Open your ledger</CardTitle>
                <CardDescription>
                  Enter your username or email and password
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleCredentialsSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="loginId"
                        placeholder="username or email"
                        type="text"
                        className="pl-9"
                        disabled={isLoading}
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="password"
                        placeholder="Password"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <div className="mt-5">
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border/60" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card/60 px-2 text-muted-foreground">
                          Or
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-5 w-full justify-start gap-2 text-sm"
                      onClick={() => setMode("otp")}
                    >
                      <ArrowRight className="h-4 w-4" />
                      Sign in with email code
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Sign in
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-start gap-2 text-xs"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setForgotSent(false);
                      setForgotEmail(loginId.includes("@") ? loginId.trim() : "");
                      setMode("forgot");
                    }}
                    disabled={isLoading}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Forgot your password?
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-center gap-2 text-sm"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setSignupEmail(loginId.includes("@") ? loginId.trim() : "");
                      setMode("signup");
                    }}
                    disabled={isLoading}
                  >
                    <UserPlus className="h-4 w-4" />
                    Create an account
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : mode === "signup" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Open your ledger</CardTitle>
                <CardDescription>
                  Create your SikaFlow account — it takes a moment.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleSignUpSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="name"
                        placeholder="your name (optional)"
                        type="text"
                        className="pl-9"
                        disabled={isLoading}
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        autoComplete="name"
                        maxLength={80}
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="email"
                        placeholder="you@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading}
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="new-password"
                        placeholder="Password (6+ characters)"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="confirm-password"
                        placeholder="Repeat your password"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    We email you a link to confirm the address before your ledger opens.
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating your account…
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Create account
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setMode("credentials");
                    }}
                    disabled={isLoading}
                  >
                    I already have an account
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : mode === "confirm" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Confirm your email</CardTitle>
                <CardDescription>
                  We sent a confirmation link to {emailForOtp}. Open it to unlock your
                  ledger.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {notice && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {notice}
                  </p>
                )}
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="button"
                  className="w-full gap-2"
                  onClick={handleResendConfirmation}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <MailCheck className="h-4 w-4" />
                      Resend the link
                    </>
                  )}
                </Button>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start gap-2 text-sm"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setPassword("");
                    setMode("credentials");
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </CardFooter>
            </>
          ) : mode === "forgot" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Reset your password</CardTitle>
                <CardDescription>
                  Enter the email you signed up with and we&rsquo;ll send a link to
                  choose a new one.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleForgotSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="reset-email"
                        placeholder="you@example.com"
                        type="email"
                        className="pl-9"
                        disabled={isLoading || forgotSent}
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                  {notice && (
                    <p className="text-sm text-muted-foreground" role="status">
                      {notice}
                    </p>
                  )}
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The link is valid once and expires after an hour.
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button
                    type="submit"
                    className="w-full gap-2"
                    disabled={isLoading || forgotSent}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <MailCheck className="h-4 w-4" />
                        {forgotSent ? "Link sent" : "Send reset link"}
                      </>
                    )}
                  </Button>

                  {forgotSent && (
                    <Button
                      type="button"
                      variant="link"
                      className="w-full justify-center text-xs"
                      onClick={() => {
                        setNotice(null);
                        setForgotSent(false);
                      }}
                      disabled={isLoading}
                    >
                      Send it again
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setMode("credentials");
                    }}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : mode === "reset" ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Choose a new password</CardTitle>
                <CardDescription>
                  Pick something you&rsquo;ll remember — 6 characters or more.
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleResetSubmit}>
                <CardContent className="space-y-4">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="new-password"
                        placeholder="New password"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        name="confirm-new-password"
                        placeholder="Repeat the new password"
                        type="password"
                        className="pl-9"
                        disabled={isLoading}
                        value={newPasswordConfirm}
                        onChange={(e) => setNewPasswordConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Saving it signs you in and takes you back to your ledger.
                  </p>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        Save password
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={handleCancelReset}
                    disabled={isLoading}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Cancel and sign out
                  </Button>
                </CardFooter>
              </form>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-serif text-2xl">Enter your code</CardTitle>
                <CardDescription>
                  We sent a one-time code to {emailForOtp}
                </CardDescription>
              </CardHeader>
              <form onSubmit={handleOtpSubmit}>
                <CardContent className="space-y-4">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
                    disabled={isLoading}
                  >
                    <InputOTPGroup>
                      {[...Array(6)].map((_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>

                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start gap-2 text-sm"
                      onClick={() => setMode("credentials")}
                      disabled={isLoading}
                    >
                      <ArrowRight className="h-4 w-4" />
                      Use password instead
                    </Button>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying…
                      </>
                    ) : (
                      "Verify code"
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setEmailForOtp("");
                      setMode("credentials");
                    }}
                    disabled={isLoading}
                  >
                    Use different login
                  </Button>
                </CardFooter>
              </form>
            </>
          )}

          <div className="rule-double px-6 py-4 text-center text-xs text-muted-foreground">
            Your records stay yours — kept safe &amp; private.
          </div>
        </Card>
      </div>

      <p className="pb-8 text-center text-xs text-muted-foreground">
        <Link
          to="/"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to sikaflow.com
        </Link>
      </p>
    </div>
  );
}
