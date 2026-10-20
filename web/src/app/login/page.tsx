import { LoginForm } from "@/components/login-form";
import { LoginPattern } from "@/components/login-pattern";

export default function LoginPage() {
  return (
    <div className="flex min-h-svh bg-background">
      <LoginForm />
      <LoginPattern />
    </div>
  );
}
