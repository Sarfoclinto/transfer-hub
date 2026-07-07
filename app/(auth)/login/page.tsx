import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { login, signup, signInWithGoogle } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Guests can share content without an account -- sign in for larger
          uploads, private sessions, and a dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent-foreground">
            {message}
          </p>
        )}

        <form action={signInWithGoogle}>
          <Button type="submit" variant="outline" className="w-full">
            Continue with Google
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="flex flex-col gap-3">
          <input type="hidden" name="next" value={next ?? "/dashboard"} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              minLength={8}
            />
          </div>
          <div className="mt-1 flex gap-2">
            <Button formAction={login} type="submit" className="flex-1">
              Log in
            </Button>
            <Button formAction={signup} type="submit" variant="secondary" className="flex-1">
              Sign up
            </Button>
          </div>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t want an account?{" "}
          <Link href="/" className="underline underline-offset-2">
            Continue as a guest
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
