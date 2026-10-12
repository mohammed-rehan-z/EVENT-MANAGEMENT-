"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/app/actions/authActions";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export default function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      await logoutAction();
      toast.success("Signed out successfully.");
      router.push("/");
    });
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isPending}
      title="Sign Out"
      className={
        className ||
        "p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      }
    >
      <LogOut className="w-4 h-4" />
    </button>
  );
}
