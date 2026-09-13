import ChangePasswordForm from "@/components/auth/ChangePasswordForm";

export const dynamic = "force-dynamic";

export default function CounterPasswordPage() {
  return <ChangePasswordForm portal="counter" />;
}
