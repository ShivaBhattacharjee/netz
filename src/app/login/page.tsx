import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginPattern } from "@/components/login-pattern";
import { getSession } from "@/lib/auth/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/imports");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-svh bg-background">
      <LoginForm error={error} />
      <LoginPattern />
    </div>
  );
}
