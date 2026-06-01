import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Expresso" className="mx-auto mb-3 h-12 w-12 object-contain dark:invert" />
          <h1 className="text-xl font-semibold">Expresso Cobrança</h1>
          <p className="text-sm text-muted-foreground">Entre para acessar a carteira</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
