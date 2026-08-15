import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/drive");
  const count = await prisma.user.count();
  redirect(count === 0 ? "/setup" : "/login");
}
