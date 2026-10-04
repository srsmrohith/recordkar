import type { Metadata } from "next";
import { LogoMark } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const LINK_ERRORS: Record<string, string> = {
  expired: "That sign-in link has expired or was already used. Request a new one.",
  link: "That sign-in link didn't work. Open it in the same browser you requested it from, or request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const linkError = typeof error === "string" ? LINK_ERRORS[error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 text-lg font-semibold tracking-[0.25em]">
            RECORD<span className="text-brand">KAR</span>
          </h1>
          <p className="mt-1 text-sm text-ink-2">Know where your money stands.</p>
        </div>
        <div className="card">
          <LoginForm linkError={linkError} />
        </div>
      </div>
    </main>
  );
}
