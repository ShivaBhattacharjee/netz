import { LoginPattern } from "@/components/login-pattern";
import { OnboardingForm } from "@/components/onboarding-form";
import { getStores, requireUser } from "@/lib/auth/session";

export default async function OnboardingPage() {
  const user = await requireUser();
  const stores = await getStores(user.id);

  return (
    <div className="flex min-h-svh bg-background">
      <OnboardingForm firstStore={stores.length === 0} userName={user.name} />
      <LoginPattern />
    </div>
  );
}
