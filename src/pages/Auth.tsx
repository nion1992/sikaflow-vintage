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

import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { ArrowRight, Loader2, Lock, User } from "lucide-react";
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
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    props.redirectAfterAuth,
  );
  const [mode, setMode] = useState<"credentials" | "otp">("credentials");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [emailForOtp, setEmailForOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleCredentialsSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", {
        email: loginId,
        code: "",
      });
      setEmailForOtp(loginId);
      setMode("otp");
      setIsLoading(false);
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

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", {
        email: emailForOtp,
        code: otp,
      });

      navigate(redirect);
    } catch (err) {
      console.error("OTP verification error:", err);

      setError("The verification code you entered is incorrect.");
      setIsLoading(false);

      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (err) {
      console.error("Guest login error:", err);
      setError(
        `Failed to sign in as guest: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      setIsLoading(false);
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
                    variant="ghost"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                  >
                    <User className="h-4 w-4" />
                    Continue as guest
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setLoginId("");
                      setMode("otp");
                    }}
                    disabled={isLoading}
                  >
                    Use different login
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
