import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Paggo Cobrança</h1>
          <p className="text-sm text-muted-foreground">Entre para acessar a carteira</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
